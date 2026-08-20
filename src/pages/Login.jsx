import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { IconLock } from '../components/Icons'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) {
      setErr('Correo o contraseña incorrectos.')
      return
    }
    nav('/venta')
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="hidden lg:flex flex-col justify-between bg-ink p-12 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-money/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-brand grid place-items-center font-display font-extrabold text-white text-2xl">D</div>
          <span className="font-display font-bold text-white text-xl">Deportes Sarapaseo</span>
        </div>
        <div className="relative">
          <p className="eyebrow text-brand-light">Punto de venta</p>
          <h1 className="font-display font-extrabold text-white text-4xl leading-tight mt-2">
            Vende rápido.<br />Controla tu inventario.
          </h1>
          <p className="text-slate-400 mt-4 max-w-sm">
            Ventas, tallas y colores, corte de caja y reportes en un solo lugar.
          </p>
        </div>
        <div className="relative text-slate-500 text-sm">Yañez Society · Sistema a la medida</div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-100">
        <form onSubmit={submit} className="card w-full max-w-sm p-8">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <div className="h-9 w-9 rounded-xl bg-brand grid place-items-center font-display font-extrabold text-white">D</div>
            <span className="font-display font-bold text-ink">Deportes Sarapaseo</span>
          </div>

          <h2 className="text-2xl font-bold text-ink">Inicia sesión</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">Entra con tu cuenta de la tienda.</p>

          <label className="label">Correo</label>
          <input className="input mb-4" type="email" value={email} autoFocus
            onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" required />

          <label className="label">Contraseña</label>
          <input className="input" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />

          {err && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">{err}</p>
          )}

          <button className="btn-brand w-full mt-6" disabled={busy}>
            <IconLock size={18} /> {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
