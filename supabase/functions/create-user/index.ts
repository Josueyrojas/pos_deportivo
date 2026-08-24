// Edge Function: crea usuarios (cajero/admin) del lado del servidor.
//
// Por qué existe: el frontend no puede usar la service_role key (quedaría
// expuesta en el navegador), y el registro público de Supabase Auth no debe
// quedar abierto en un POS real. Esta función corre en el servidor, valida
// que quien llama ya sea un admin activo, y solo entonces crea la cuenta con
// la Admin API.
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

    // Cliente "como el usuario que llama" (respeta RLS) — para confirmar que es admin.
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
      .from('profiles').select('role, active').eq('id', caller.id).single()
    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
      return json({ error: 'Solo un administrador puede crear usuarios' }, 403)
    }

    const { email, password, full_name, role } = await req.json()
    if (!email || !password || password.length < 6) {
      return json({ error: 'Correo válido y contraseña de 6+ caracteres' }, 400)
    }
    if (!['admin', 'cajero'].includes(role)) {
      return json({ error: 'Rol inválido' }, 400)
    }

    // Cliente con la service_role key — solo aquí, del lado del servidor.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: full_name || '' },
    })
    if (createErr) return json({ error: createErr.message }, 400)

    // El trigger on_auth_user_created ya insertó el perfil como 'cajero'; lo ajustamos.
    const { error: profErr } = await adminClient
      .from('profiles')
      .update({ full_name: full_name || '', role })
      .eq('id', created.user.id)
    if (profErr) return json({ error: profErr.message }, 400)

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
