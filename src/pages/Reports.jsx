import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner, Empty } from '../components/UI'
import { money, dateShort, variantLabel } from '../lib/format'
import { IconChart, IconWarn } from '../components/Icons'

export default function Reports() {
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState({ today: 0, todayCount: 0, week: 0, month: 0 })
  const [byDay, setByDay] = useState([])
  const [top, setTop] = useState([])
  const [low, setLow] = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const now = new Date()
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0)
    const start14 = new Date(now); start14.setDate(now.getDate() - 13); start14.setHours(0, 0, 0, 0)
    const start7 = new Date(now); start7.setDate(now.getDate() - 6); start7.setHours(0, 0, 0, 0)
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // ventas desde el punto más antiguo que necesitamos (14 días o inicio de mes)
    const earliest = new Date(Math.min(start14.getTime(), startMonth.getTime()))
    const { data: sales } = await supabase
      .from('sales').select('id,total,created_at')
      .gte('created_at', earliest.toISOString())
      .order('created_at')

    const all = sales ?? []
    const sum = (arr) => arr.reduce((s, r) => s + Number(r.total), 0)
    const today = all.filter((s) => new Date(s.created_at) >= startDay)
    setKpi({
      today: sum(today),
      todayCount: today.length,
      week: sum(all.filter((s) => new Date(s.created_at) >= start7)),
      month: sum(all.filter((s) => new Date(s.created_at) >= startMonth)),
    })

    // agrupar por día (14 días)
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const t = sum(all.filter((s) => {
        const c = new Date(s.created_at); return c >= d && c < next
      }))
      days.push({ label: dateShort(d), total: t })
    }
    setByDay(days)

    // top productos (por cantidad) en los últimos 14 días
    const recentIds = all.filter((s) => new Date(s.created_at) >= start14).map((s) => s.id)
    if (recentIds.length) {
      const { data: items } = await supabase
        .from('sale_items').select('product_name,size,color,qty,line_total')
        .in('sale_id', recentIds)
      const map = {}
      for (const it of items ?? []) {
        const key = it.product_name
        map[key] = map[key] || { name: key, qty: 0, total: 0 }
        map[key].qty += it.qty
        map[key].total += Number(it.line_total)
      }
      setTop(Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 6))
    } else setTop([])

    // stock bajo
    const { data: vars } = await supabase
      .from('product_variants')
      .select('id,size,color,stock,min_stock, product:products(name)')
      .eq('active', true)
    const lows = (vars ?? []).filter((v) => v.stock <= v.min_stock)
      .sort((a, b) => a.stock - b.stock).slice(0, 12)
    setLow(lows)

    setLoading(false)
  }

  if (loading) return <Spinner />

  const maxDay = Math.max(1, ...byDay.map((d) => d.total))
  const maxTop = Math.max(1, ...top.map((t) => t.qty))

  return (
    <div>
      <div className="mb-5">
        <p className="eyebrow">Análisis</p>
        <h1 className="text-2xl font-bold text-ink">Reportes</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Ventas hoy" value={money(kpi.today)} sub={`${kpi.todayCount} tickets`} accent />
        <Kpi label="Últimos 7 días" value={money(kpi.week)} />
        <Kpi label="Este mes" value={money(kpi.month)} />
        <Kpi label="Alertas de stock" value={low.length} sub="variantes bajas" warn={low.length > 0} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Ventas por día */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <IconChart size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Ventas por día (14 días)</h2>
          </div>
          <div className="flex items-end gap-1.5 h-44">
            {byDay.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                <div className="w-full rounded-t-md bg-brand/15 group-hover:bg-brand/30 transition relative"
                     style={{ height: `${(d.total / maxDay) * 100}%`, minHeight: d.total > 0 ? 4 : 0 }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-ink opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {money(d.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-slate-400">
            <span>{byDay[0]?.label}</span>
            <span>{byDay[byDay.length - 1]?.label}</span>
          </div>
        </div>

        {/* Top productos */}
        <div className="card p-6">
          <h2 className="font-bold text-ink mb-5">Más vendidos (14 días)</h2>
          {top.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Aún no hay ventas registradas.</p>
          ) : (
            <div className="space-y-3">
              {top.map((t, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-ink truncate">{t.name}</span>
                    <span className="text-slate-400 tnum ml-2">{t.qty} pz</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(t.qty / maxTop) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stock bajo */}
      <div className="card p-6 mt-5">
        <div className="flex items-center gap-2 mb-4">
          <IconWarn size={18} className="text-red-500" />
          <h2 className="font-bold text-ink">Stock bajo</h2>
        </div>
        {low.length === 0 ? (
          <Empty icon={<IconChart size={36} />} title="Todo en orden"
            hint="Ninguna variante está por debajo de su mínimo." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {low.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{v.product?.name}</p>
                  <p className="text-xs text-slate-400">{variantLabel(v.size, v.color)}</p>
                </div>
                <span className="pill bg-red-100 text-red-600 shrink-0">{v.stock} / min {v.min_stock}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, accent, warn }) {
  return (
    <div className={`card p-4 ${accent ? 'bg-ink text-white border-ink' : ''}`}>
      <p className={`eyebrow ${accent ? '!text-slate-400' : ''}`}>{label}</p>
      <p className={`font-display font-extrabold text-2xl mt-1 tnum ${
        accent ? 'text-white' : warn ? 'text-red-500' : 'text-ink'}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${accent ? 'text-slate-400' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}
