import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast, Spinner, Empty } from '../components/UI'
import { money, folio, dateTime, variantLabel } from '../lib/format'
import { IconBriefcase, IconReceipt, IconWarn, IconUsers } from '../components/Icons'
import BrandLogo from '../components/BrandLogo'

// Vista de solo lectura para el super admin: nada aquí escribe en las
// tablas del negocio (ventas, inventario) — es para dar soporte sin pedir
// la contraseña del dueño. Todas las consultas filtran por business_id a
// propósito, porque para un super admin las políticas RLS dejan ver TODOS
// los negocios a la vez si no se filtra explícito.
export default function NegocioDetalle() {
  const { id } = useParams()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState(null)
  const [kpi, setKpi] = useState({ today: 0, month: 0, inventoryValue: 0, lowStock: 0 })
  const [sales, setSales] = useState([])
  const [team, setTeam] = useState([])
  const [notes, setNotes] = useState('')
  const [notesBusy, setNotesBusy] = useState(false)

  useEffect(() => { load() }, [id])   // eslint-disable-line

  async function load() {
    setLoading(true)
    const now = new Date()
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0)
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [{ data: biz }, { data: recentSales }, { data: vars }, { data: profiles }, { data: noteRow }] =
      await Promise.all([
        supabase.from('businesses').select('*').eq('id', id).single(),
        supabase.from('sales').select('id,folio,total,status,payment_method,created_at')
          .eq('business_id', id).order('created_at', { ascending: false }).limit(20),
        supabase.from('product_variants').select('stock,min_stock,active, product:products(cost)')
          .eq('business_id', id).eq('active', true),
        supabase.from('profiles').select('id,full_name,role,active').eq('business_id', id).order('created_at'),
        supabase.from('business_notes').select('notes').eq('business_id', id).maybeSingle(),
      ])

    setBusiness(biz ?? null)
    setSales(recentSales ?? [])
    setTeam(profiles ?? [])
    setNotes(noteRow?.notes || '')

    const monthSalesRes = await supabase.from('sales').select('total,status,created_at')
      .eq('business_id', id).eq('status', 'completed').gte('created_at', startMonth.toISOString())
    const monthSales = monthSalesRes.data ?? []
    const today = monthSales.filter((s) => new Date(s.created_at) >= startDay)

    const activeVars = vars ?? []
    setKpi({
      today: today.reduce((s, r) => s + Number(r.total), 0),
      month: monthSales.reduce((s, r) => s + Number(r.total), 0),
      inventoryValue: activeVars.reduce((s, v) => s + v.stock * Number(v.product?.cost || 0), 0),
      lowStock: activeVars.filter((v) => v.stock <= v.min_stock).length,
    })
    setLoading(false)
  }

  async function saveNotes() {
    setNotesBusy(true)
    const { error } = await supabase.from('business_notes')
      .upsert({ business_id: id, notes, updated_at: new Date().toISOString() })
    setNotesBusy(false)
    if (error) { toast.err('No se pudieron guardar las notas'); return }
    toast.ok('Notas guardadas')
  }

  if (loading) return <Spinner />
  if (!business) return <Empty icon={<IconBriefcase size={40} />} title="Negocio no encontrado" />

  return (
    <div>
      <Link to="/negocios" className="text-sm text-slate-500 hover:text-ink">← Negocios</Link>

      <div className="flex items-center gap-3 mt-3 mb-6">
        <BrandLogo logoUrl={business.logo_url} name={business.name} size={40} />
        <div>
          <h1 className="text-2xl font-bold text-ink">{business.name}</h1>
          <span className={`pill ${business.active ? 'bg-money/10 text-money-dark' : 'bg-slate-100 text-slate-400'}`}>
            <span className={`h-2 w-2 rounded-full ${business.active ? 'bg-money' : 'bg-slate-400'}`} />
            {business.active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <p className="eyebrow">Ventas hoy</p>
          <p className="font-display font-extrabold text-xl text-ink mt-1 tnum">{money(kpi.today)}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Este mes</p>
          <p className="font-display font-extrabold text-xl text-ink mt-1 tnum">{money(kpi.month)}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Valor de inventario</p>
          <p className="font-display font-extrabold text-xl text-ink mt-1 tnum">{money(kpi.inventoryValue)}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Stock bajo</p>
          <p className={`font-display font-extrabold text-xl mt-1 tnum ${kpi.lowStock > 0 ? 'text-red-500' : 'text-ink'}`}>
            {kpi.lowStock}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
        {/* Ventas recientes */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <IconReceipt size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Ventas recientes</h2>
          </div>
          {sales.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin ventas todavía.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-50">
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5 font-semibold text-ink tnum">{folio(s.folio)}</td>
                    <td className="px-5 py-2.5 text-slate-500">{dateTime(s.created_at)}</td>
                    <td className="px-5 py-2.5">
                      {s.status === 'cancelled'
                        ? <span className="pill bg-red-50 text-red-500">Cancelada</span>
                        : <span className="pill bg-slate-100 text-slate-500 capitalize">{s.payment_method}</span>}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-bold tnum ${s.status === 'cancelled' ? 'line-through text-slate-400' : 'text-ink'}`}>
                      {money(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-5">
          {/* Equipo */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <IconUsers size={18} className="text-brand" />
              <h2 className="font-bold text-ink">Equipo</h2>
            </div>
            {team.length === 0 ? (
              <p className="text-sm text-slate-400">Sin usuarios todavía.</p>
            ) : (
              <div className="space-y-2.5">
                {team.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink font-medium">{u.full_name || 'Sin nombre'}</span>
                    <span className="text-slate-400 capitalize">{u.role}{!u.active && ' · inactivo'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas privadas */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <IconWarn size={16} className="text-slate-400" />
              <h2 className="font-bold text-ink text-sm">Notas privadas</h2>
            </div>
            <p className="text-xs text-slate-400 mb-3">Solo tú las ves — el dueño del negocio no tiene acceso a esto.</p>
            <textarea className="input" rows={5} value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Plan, contacto, acuerdos…" />
            <button className="btn-ghost w-full mt-3" onClick={saveNotes} disabled={notesBusy}>
              {notesBusy ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
