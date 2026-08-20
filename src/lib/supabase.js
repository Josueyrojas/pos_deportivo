import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  // Mensaje claro si faltan las credenciales
  console.error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en tu archivo .env')
}

export const supabase = createClient(url, key)
