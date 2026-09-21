import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const BusinessCtx = createContext(null)
export const useBusiness = () => useContext(BusinessCtx)

// El negocio del usuario logueado (según profiles.business_id). Un super
// admin no pertenece a ninguno: business queda null.
export function BusinessProvider({ children }) {
  const { profile } = useAuth()
  const [business, setBusiness] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.business_id) { setBusiness(null); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase.from('businesses').select('*').eq('id', profile.business_id).maybeSingle()
    setBusiness(data ?? null)
    setLoading(false)
  }, [profile?.business_id])

  useEffect(() => { load() }, [load])

  return (
    <BusinessCtx.Provider value={{ ...business, loading, refresh: load }}>
      {children}
    </BusinessCtx.Provider>
  )
}
