import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast, Modal, Spinner, Empty } from '../components/UI'
import { money, dateShort } from '../lib/format'
import { IconPlus, IconBriefcase, IconUsers, IconEdit, IconImage } from '../components/Icons'
import BrandLogo from '../components/BrandLogo'

export default function Negocios() {
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // ownerModal.business === null  -> crear negocio nuevo + su dueño
  // ownerModal.business === {id,name} -> agregar dueño a un negocio existente
  const [ownerModal, setOwnerModal] = useState(null)
  const [form, setForm] = useState({ business_name: '', full_name: '', email: '', password: '', invite: false })

  const [editModal, setEditModal] = useState(null)   // negocio en edición de marca
  const [editForm, setEditForm] = useState({ name: '', logo_url: '' })
  const [imgBusy, setImgBusy] = useState(false)

  const [teamModal, setTeamModal] = useState(null)   // negocio del que se ve el equipo
  const [team, setTeam] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: businesses }, { data: sales }, { data: products }] = await Promise.all([
      supabase.from('businesses').select('*').order('created_at'),
      supabase.from('sales').select('business_id,total').eq('status', 'completed'),
      supabase.from('products').select('business_id'),
    ])
    const salesByBiz = {}
    for (const s of sales ?? []) salesByBiz[s.business_id] = (salesByBiz[s.business_id] || 0) + Number(s.total)
    const productsByBiz = {}
    for (const p of products ?? []) productsByBiz[p.business_id] = (productsByBiz[p.business_id] || 0) + 1

    setRows((businesses ?? []).map((b) => ({
      ...b,
      totalSales: salesByBiz[b.id] || 0,
      productCount: productsByBiz[b.id] || 0,
    })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const totalBusinesses = rows.length
  const activeBusinesses = rows.filter((b) => b.active).length
  const totalSales = rows.reduce((s, b) => s + b.totalSales, 0)

  async function toggleActive(b) {
    const { error } = await supabase.from('businesses').update({ active: !b.active }).eq('id', b.id)
    if (error) { toast.err('No se pudo actualizar'); return }
    toast.ok(b.active ? 'Negocio desactivado' : 'Negocio activado')
    load()
  }

  function openNewBusiness() {
    setForm({ business_name: '', full_name: '', email: '', password: '', invite: false })
    setOwnerModal({ business: null })
  }
  function openAddOwner(b) {
    setForm({ business_name: '', full_name: '', email: '', password: '', invite: false })
    setOwnerModal({ business: b })
  }

  async function submitOwner() {
    const isNew = !ownerModal.business
    if (isNew && !form.business_name.trim()) { toast.err('Ponle nombre al negocio'); return }
    if (!form.email.trim()) { toast.err('Escribe un correo válido'); return }
    if (!form.invite && form.password.length < 6) {
      toast.err('La contraseña debe tener 6+ caracteres'); return
    }
    setBusy(true)

    let businessId = ownerModal.business?.id
    if (isNew) {
      const { data: biz, error: bizErr } = await supabase
        .from('businesses').insert({ name: form.business_name.trim() }).select().single()
      if (bizErr) { toast.err('No se pudo crear el negocio'); setBusy(false); return }
      businessId = biz.id
    }

    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        email: form.email.trim(),
        password: form.invite ? undefined : form.password,
        full_name: form.full_name.trim(),
        role: 'admin',
        business_id: businessId,
        invite: form.invite,
        redirectTo: `${window.location.origin}/reset-password`,
      },
    })
    setBusy(false)
    if (error || data?.error) { toast.err(data?.error || error.message || 'No se pudo crear el usuario'); return }
    setOwnerModal(null)
    toast.ok(isNew ? 'Negocio creado' : 'Dueño agregado')
    load()
  }

  function openEdit(b) {
    setEditForm({ name: b.name || '', logo_url: b.logo_url || '' })
    setEditModal(b)
  }

  async function uploadEditLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.err('El logo no debe pasar de 3 MB'); return }
    setImgBusy(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `logo/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('store-assets').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { toast.err('No se pudo subir el logo'); setImgBusy(false); return }
    const { data } = supabase.storage.from('store-assets').getPublicUrl(path)
    setEditForm((f) => ({ ...f, logo_url: data.publicUrl }))
    setImgBusy(false)
  }

  async function saveEdit() {
    if (!editForm.name.trim()) { toast.err('Ponle nombre al negocio'); return }
    setBusy(true)
    const { error } = await supabase.from('businesses')
      .update({ name: editForm.name.trim(), logo_url: editForm.logo_url || null })
      .eq('id', editModal.id)
    setBusy(false)
    if (error) { toast.err('No se pudo guardar'); return }
    setEditModal(null)
    toast.ok('Negocio actualizado')
    load()
  }

  async function openTeam(b) {
    setTeamModal(b)
    setTeamLoading(true)
    const { data } = await supabase.from('profiles')
      .select('id,full_name,role,active').eq('business_id', b.id).order('created_at')
    setTeam(data ?? [])
    setTeamLoading(false)
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Plataforma</p>
          <h1 className="text-2xl font-bold text-ink">Negocios</h1>
        </div>
        <button className="btn-brand" onClick={openNewBusiness}>
          <IconPlus /> Nuevo negocio
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="eyebrow">Negocios</p>
          <p className="font-display font-extrabold text-2xl text-ink mt-1 tnum">{totalBusinesses}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Activos</p>
          <p className="font-display font-extrabold text-2xl text-ink mt-1 tnum">{activeBusinesses}</p>
        </div>
        <div className="card p-4 bg-ink text-white border-ink">
          <p className="eyebrow !text-slate-400">Ventas de la plataforma</p>
          <p className="font-display font-extrabold text-2xl mt-1 tnum">{money(totalSales)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty icon={<IconBriefcase size={40} />} title="Sin negocios todavía"
          hint="Crea el primero con el botón de arriba." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Negocio</th>
                <th className="px-4 py-3 font-semibold text-center">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Ventas</th>
                <th className="px-4 py-3 font-semibold text-right">Productos</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Alta</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link to={`/negocios/${b.id}`} className="flex items-center gap-3 hover:opacity-80">
                      <BrandLogo logoUrl={b.logo_url} name={b.name} size={32} />
                      <span className="font-semibold text-ink">{b.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(b)}
                      className={`pill ${b.active ? 'bg-money/10 text-money-dark' : 'bg-slate-100 text-slate-400'} hover:opacity-80`}>
                      <span className={`h-2 w-2 rounded-full ${b.active ? 'bg-money' : 'bg-slate-400'}`} />
                      {b.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink tnum">{money(b.totalSales)}</td>
                  <td className="px-4 py-3 text-right text-slate-500 tnum">{b.productCount}</td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{dateShort(b.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openTeam(b)} title="Ver equipo"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand">
                        <IconUsers size={16} />
                      </button>
                      <button onClick={() => openEdit(b)} title="Editar marca"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand">
                        <IconEdit size={16} />
                      </button>
                      <button onClick={() => openAddOwner(b)} className="btn-ghost !py-1.5 !px-3 text-xs">
                        Dueño
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nuevo negocio / nuevo dueño */}
      <Modal open={!!ownerModal} onClose={() => setOwnerModal(null)}
        title={ownerModal?.business ? `Dueño de ${ownerModal.business.name}` : 'Nuevo negocio'}>
        {!ownerModal?.business && (
          <>
            <label className="label">Nombre del negocio</label>
            <input className="input mb-3" value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Ej. Deportes Apaseo" />
          </>
        )}
        <label className="label">Nombre completo del dueño</label>
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

        <button className="btn-brand w-full mt-2" onClick={submitOwner} disabled={busy}>
          {busy ? 'Guardando…' : (ownerModal?.business ? 'Crear dueño' : 'Crear negocio')}
        </button>
        <p className="text-xs text-slate-400 mt-3">
          {form.invite
            ? 'Le llega un correo para que elija su propia contraseña.'
            : 'Queda como administrador de este negocio, listo para entrar de inmediato.'}
        </p>
      </Modal>

      {/* Editar marca del negocio */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title={`Editar ${editModal?.name || ''}`}>
        <label className="label">Nombre del negocio</label>
        <input className="input mb-5" value={editForm.name}
          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Ej. Deportes Apaseo" />

        <label className="label">Logo</label>
        <div className="flex items-center gap-4">
          <div className="h-16 min-w-16 max-w-[220px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50 grid place-items-center text-slate-300 px-2">
            {editForm.logo_url
              ? <img src={editForm.logo_url} alt="" className="h-full max-h-12 w-full object-contain" />
              : <IconImage size={26} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label className="btn-ghost cursor-pointer !py-2">
                {imgBusy ? 'Subiendo…' : (editForm.logo_url ? 'Cambiar' : 'Subir logo')}
                <input type="file" accept="image/*" className="hidden" onChange={uploadEditLogo} disabled={imgBusy} />
              </label>
              {editForm.logo_url && (
                <button type="button" className="btn-danger !py-2"
                  onClick={() => setEditForm({ ...editForm, logo_url: '' })}>
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">JPG o PNG, hasta 3 MB.</p>
          </div>
        </div>

        <button className="btn-brand w-full mt-6" onClick={saveEdit} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </Modal>

      {/* Equipo del negocio */}
      <Modal open={!!teamModal} onClose={() => setTeamModal(null)} title={`Equipo de ${teamModal?.name || ''}`}>
        {teamLoading ? <Spinner /> : team.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Este negocio no tiene usuarios todavía.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {team.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-ink text-white grid place-items-center text-sm font-bold">
                    {(u.full_name || '?').trim().charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-semibold text-ink text-sm">{u.full_name || 'Sin nombre'}</p>
                    <p className="text-xs text-slate-400 capitalize">{u.role}</p>
                  </div>
                </div>
                <span className={`pill ${u.active ? 'bg-money/10 text-money-dark' : 'bg-slate-100 text-slate-400'}`}>
                  <span className={`h-2 w-2 rounded-full ${u.active ? 'bg-money' : 'bg-slate-400'}`} />
                  {u.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
