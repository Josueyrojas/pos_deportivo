import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast, Modal, Spinner } from '../components/UI'
import { IconPlus, IconUsers } from '../components/Icons'

// Cliente secundario: crea usuarios sin tocar la sesión del administrador
const signupClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export default function Users() {
  const { profile: me, refreshProfile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'cajero' })
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setRows(data ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function setRole(u, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', u.id)
    if (error) { toast.err('No se pudo cambiar el rol'); return }
    if (u.id === me.id) refreshProfile()
    toast.ok('Rol actualizado'); load()
  }

  async function toggleActive(u) {
    const { error } = await supabase.from('profiles').update({ active: !u.active }).eq('id', u.id)
    if (error) { toast.err('No se pudo actualizar'); return }
    toast.ok(u.active ? 'Usuario desactivado' : 'Usuario activado'); load()
  }

  async function createUser() {
    if (!form.email.trim() || form.password.length < 6) {
      toast.err('Correo válido y contraseña de 6+ caracteres'); return
    }
    setBusy(true)
    const { data, error } = await signupClient.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.full_name.trim() } },
    })
    if (error) { toast.err(error.message); setBusy(false); return }

    // el trigger crea el perfil como 'cajero'; ajustamos nombre y rol
    const uid = data.user?.id
    if (uid) {
      await supabase.from('profiles')
        .update({ full_name: form.full_name.trim(), role: form.role }).eq('id', uid)
    }
    setBusy(false)
    setModal(false)
    setForm({ full_name: '', email: '', password: '', role: 'cajero' })
    toast.ok('Usuario creado')
    load()
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Equipo</p>
          <h1 className="text-2xl font-bold text-ink">Usuarios</h1>
        </div>
        <button className="btn-brand" onClick={() => setModal(true)}>
          <IconPlus /> Nuevo usuario
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Rol</th>
              <th className="px-4 py-3 font-semibold text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((u) => {
              const self = u.id === me.id
              return (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-ink text-white grid place-items-center text-sm font-bold">
                        {(u.full_name || '?').trim().charAt(0).toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{u.full_name || 'Sin nombre'}</p>
                        {self && <span className="text-[11px] text-brand font-semibold">Tú</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select className="input !py-1.5 !px-2.5 w-32" value={u.role}
                      disabled={self}
                      onChange={(e) => setRole(u, e.target.value)}>
                      <option value="cajero">Cajero</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => !self && toggleActive(u)} disabled={self}
                      className={`pill ${u.active ? 'bg-money/10 text-money-dark' : 'bg-slate-100 text-slate-400'} ${self ? 'opacity-60' : 'hover:opacity-80'}`}>
                      <span className={`h-2 w-2 rounded-full ${u.active ? 'bg-money' : 'bg-slate-400'}`} />
                      {u.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo usuario">
        <label className="label">Nombre completo</label>
        <input className="input mb-3" value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Ej. María López" />
        <label className="label">Correo</label>
        <input className="input mb-3" type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@ejemplo.com" />
        <label className="label">Contraseña temporal</label>
        <input className="input mb-3" type="text" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
        <label className="label">Rol</label>
        <select className="input" value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cajero">Cajero</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-brand w-full mt-5" onClick={createUser} disabled={busy}>
          {busy ? 'Creando…' : 'Crear usuario'}
        </button>
        <p className="text-xs text-slate-400 mt-3">
          Si en tu proyecto está activada la confirmación por correo, el usuario deberá
          confirmar antes de iniciar sesión.
        </p>
      </Modal>
    </div>
  )
}
