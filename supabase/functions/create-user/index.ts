// Edge Function: crea usuarios (cajero/admin/dueño de negocio) del lado del servidor.
//
// Por qué existe: el frontend no puede usar la service_role key (quedaría
// expuesta en el navegador), y el registro público de Supabase Auth no debe
// quedar abierto en un POS real. Esta función corre en el servidor y decide
// el business_id del nuevo usuario según quién llama — nunca confía en lo
// que mande el cliente:
//   - admin de un negocio: solo puede crear usuarios PARA SU PROPIO negocio.
//   - super_admin: puede crear el primer admin de cualquier negocio (nuevo
//     o existente), pasando business_id en el body.
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

    // Cliente "como el usuario que llama" (respeta RLS) — para confirmar su rol.
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
    if (!callerProfile || !callerProfile.active) {
      return json({ error: 'No autorizado' }, 403)
    }

    const body = await req.json()
    const { email, password, full_name, role, invite, redirectTo } = body
    if (!email) {
      return json({ error: 'Falta el correo' }, 400)
    }
    if (!invite && (!password || password.length < 6)) {
      return json({ error: 'Correo válido y contraseña de 6+ caracteres' }, 400)
    }

    let targetBusinessId: string | null = null
    if (callerProfile.role === 'super_admin') {
      if (!['admin', 'cajero'].includes(role)) {
        return json({ error: 'Rol inválido' }, 400)
      }
      targetBusinessId = body.business_id || null
      if (!targetBusinessId) {
        return json({ error: 'Falta el negocio al que pertenece el usuario' }, 400)
      }
    } else if (callerProfile.role === 'admin') {
      if (!['admin', 'cajero'].includes(role)) {
        return json({ error: 'Rol inválido' }, 400)
      }
      targetBusinessId = callerProfile.business_id
    } else {
      return json({ error: 'Solo un administrador puede crear usuarios' }, 403)
    }

    // Cliente con la service_role key — solo aquí, del lado del servidor.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const metadata = { full_name: full_name || '', role, business_id: targetBusinessId }

    const { data: created, error: createErr } = invite
      ? await adminClient.auth.admin.inviteUserByEmail(email, {
          data: metadata,
          redirectTo: redirectTo || undefined,
        })
      : await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: metadata,
        })
    if (createErr) return json({ error: createErr.message }, 400)

    return json({ id: created.user.id }, 200)
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
