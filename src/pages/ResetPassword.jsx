import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import { IconLock } from '../components/Icons'

export default function ResetPassword() {
  const settings = useSettings()
  const nav = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Supabase intercambia el enlace del correo por una sesión temporal de recuperación
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 6) { setErr('La contraseña debe tener al menos 6 caracteres.'); return }
    if (password !== confirm) { setErr('Las contraseñas no coinciden.'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setErr('No se pudo actualizar la contraseña. Pide un nuevo enlace.'); return }
    setOk(true)
    setTimeout(() => nav('/venta'), 1800)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          {settings.logo_url
            ? <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
            : <div className="h-9 w-9 rounded-xl bg-brand grid place-items-center font-display font-extrabold text-white">
                {(settings.name || 'D').trim().charAt(0).toUpperCase()}
              </div>}
          <span className="font-display font-bold text-ink">{settings.name}</span>
        </div>

        <h2 className="text-2xl font-bold text-ink">Nueva contraseña</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          {ready ? 'Escribe tu nueva contraseña.' : 'Verificando el enlace…'}
        </p>

        {ok ? (
          <p className="text-sm text-money-dark bg-money/10 rounded-lg px-3 py-2.5">
            Contraseña actualizada. Entrando…
          </p>
        ) : (
          <>
            <label className="label">Contraseña nueva</label>
            <input className="input mb-4" type="password" value={password} autoFocus
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={!ready} />

            <label className="label">Confírmala</label>
            <input className="input" type="password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" required disabled={!ready} />

            {err && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">{err}</p>
            )}

            <button className="btn-brand w-full mt-6" disabled={busy || !ready}>
              <IconLock size={18} /> {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
