import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast, Modal, Spinner } from '../components/UI'
import { IconPlus, IconUsers, IconTrash } from '../components/Icons'

export default function Users() {
  const { profile: me, refreshProfile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'cajero', invite: false })
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [delBusy, setDelBusy] = useState(false)

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
    if (!form.email.trim()) { toast.err('Escribe un correo válido'); return }
    if (!form.invite && form.password.length < 6) {
      toast.err('La contraseña debe tener 6+ caracteres'); return
    }
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: form.email.trim(),
        password: form.invite ? undefined : form.password,
        full_name: form.full_name.trim(),
        role: form.role,
        invite: form.invite,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    })
    setBusy(false)
    if (error || data?.error) { toast.err(data?.error || error.message || 'No se pudo crear el usuario'); return }
    setModal(false)
    setForm({ full_name: '', email: '', password: '', role: 'cajero', invite: false })
    toast.ok(form.invite ? 'Invitación enviada' : 'Usuario creado')
    load()
  }

  async function deleteUser(u) {
    setDelBusy(true)
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { user_id: u.id },
    })
    setDelBusy(false)
    if (error || data?.error) { toast.err(data?.error || error.message || 'No se pudo eliminar'); return }
    setConfirmDel(null)
    toast.ok('Usuario eliminado')
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
              <th className="px-4 py-3"></th>
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
                  <td className="px-4 py-3 text-right">
                    {!self && (
                      <button onClick={() => setConfirmDel(u)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="Eliminar">
                        <IconTrash size={16} />
                      </button>
                    )}
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

        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.invite}
            onChange={(e) => setForm({ ...form, invite: e.target.checked })} />
          <span className="text-sm text-slate-600">Invitar por correo en vez de ponerle contraseña</span>
        </label>

        {!form.invite && (
          <>
            <label className="label">Contraseña temporal</label>
            <input className="input mb-3" type="text" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
          </>
        )}

        <label className="label">Rol</label>
        <select className="input" value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cajero">Cajero</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn-brand w-full mt-5" onClick={createUser} disabled={busy}>
          {busy ? 'Guardando…' : (form.invite ? 'Enviar invitación' : 'Crear usuario')}
        </button>
        <p className="text-xs text-slate-400 mt-3">
          {form.invite
            ? 'Le llega un correo para que elija su propia contraseña.'
            : 'La cuenta queda lista para entrar de inmediato con el correo y la contraseña que pongas aquí.'}
        </p>
      </Modal>

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Eliminar usuario">
        <p className="text-sm text-slate-600">
          ¿Seguro que quieres eliminar a <b>{confirmDel?.full_name || 'este usuario'}</b>?
          No podrá volver a iniciar sesión.
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Si ya tiene ventas o cortes de caja registrados, no se podrá eliminar —
          en ese caso, desactívalo en vez de borrarlo.
        </p>
        <div className="flex gap-2 mt-6">
          <button className="btn-ghost flex-1" onClick={() => setConfirmDel(null)}>Cancelar</button>
          <button className="btn-danger flex-1" onClick={() => deleteUser(confirmDel)} disabled={delBusy}>
            {delBusy ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
