import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SettingsCtx = createContext(null)
export const useSettings = () => useContext(SettingsCtx)

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULTS = { id: SETTINGS_ID, name: 'Deportes Apaseo', logo_url: null }

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.from('store_settings').select('*').eq('id', SETTINGS_ID).maybeSingle()
    if (data) setSettings(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <SettingsCtx.Provider value={{ ...settings, loading, refresh: load }}>
      {children}
    </SettingsCtx.Provider>
  )
}
