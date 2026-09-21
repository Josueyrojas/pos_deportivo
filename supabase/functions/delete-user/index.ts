// Edge Function: elimina un usuario del lado del servidor (requiere admin).
//
// Si el usuario tiene ventas, corte de caja abiertos, o canceló alguna venta,
// la base de datos rechaza el borrado a propósito (foreign key) para no perder
// el historial contable — en ese caso se le pide al admin que lo desactive
// en vez de borrarlo.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? ''

    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return json({ error: 'No autenticado' }, 401)
    }

    const { data: callerProfile } = await callerClient
      .from('profiles').select('role, active, business_id').eq('id', caller.id).single()
    if (!callerProfile || !callerProfile.active || !['admin', 'super_admin'].includes(callerProfile.role)) {
      return json({ error: 'Solo un administrador puede eliminar usuarios' }, 403)
    }

    const { user_id } = await req.json()
    if (!user_id) {
      return json({ error: 'Falta el usuario a eliminar' }, 400)
    }
    if (user_id === caller.id) {
      return json({ error: 'No puedes eliminar tu propia cuenta' }, 400)
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Un admin normal solo puede borrar usuarios de su propio negocio
    // (bypasea RLS con la service_role key, así que se valida a mano aquí).
    if (callerProfile.role === 'admin') {
      const { data: target } = await adminClient
        .from('profiles').select('business_id').eq('id', user_id).single()
      if (!target || target.business_id !== callerProfile.business_id) {
        return json({ error: 'Ese usuario no pertenece a tu negocio' }, 403)
      }
    }

    const { error } = await adminClient.auth.admin.deleteUser(user_id)
    if (error) {
      const blocked = /foreign key|violates|referenced/i.test(error.message)
      return json({
        error: blocked
          ? 'No se puede eliminar: este usuario tiene ventas o cortes de caja registrados. Desactívalo en vez de borrarlo.'
          : error.message,
      }, 400)
    }

    return json({ ok: true }, 200)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500)
  }
})

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
