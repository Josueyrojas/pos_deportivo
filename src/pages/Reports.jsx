import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner, Empty } from '../components/UI'
import { money, dateShort, variantLabel } from '../lib/format'
import { IconChart, IconWarn } from '../components/Icons'

const isoDaysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function Reports() {
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState({ today: 0, todayCount: 0, week: 0, month: 0, profitMonth: 0, inventoryValue: 0 })
  const [byDay, setByDay] = useState([])
  const [top, setTop] = useState([])
  const [low, setLow] = useState([])
  const [from, setFrom] = useState(isoDaysAgo(13))
  const [to, setTo] = useState(todayISO())

  useEffect(() => { load() }, [from, to])   // eslint-disable-line

  async function load() {
    setLoading(true)
    const now = new Date()
    const startDay = new Date(now); startDay.setHours(0, 0, 0, 0)
    const start7 = new Date(now); start7.setDate(now.getDate() - 6); start7.setHours(0, 0, 0, 0)
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const rangeStart = new Date(from + 'T00:00:00')
    const rangeEnd = new Date(to + 'T23:59:59')

    // ventana más amplia que cubra KPIs fijos (mes) y el rango elegido para la gráfica
    const earliest = new Date(Math.min(startMonth.getTime(), rangeStart.getTime()))
    const latest = new Date(Math.max(now.getTime(), rangeEnd.getTime()))

    // ventas y stock bajo no dependen entre sí: se piden en paralelo
    const [{ data: sales }, { data: vars }] = await Promise.all([
      supabase
        .from('sales').select('id,total,created_at')
        .eq('status', 'completed')
        .gte('created_at', earliest.toISOString())
        .lte('created_at', latest.toISOString())
        .order('created_at'),
      supabase
        .from('product_variants')
        .select('id,size,color,stock,min_stock, product:products(name,cost)')
        .eq('active', true),
    ])
    const activeVars = vars ?? []
    const lows = activeVars.filter((v) => v.stock <= v.min_stock)
      .sort((a, b) => a.stock - b.stock).slice(0, 12)
    setLow(lows)
    const inventoryValue = activeVars.reduce((s, v) => s + v.stock * Number(v.product?.cost || 0), 0)

    const all = sales ?? []
    const sum = (arr) => arr.reduce((s, r) => s + Number(r.total), 0)
    const today = all.filter((s) => new Date(s.created_at) >= startDay)
    const monthSales = all.filter((s) => new Date(s.created_at) >= startMonth)

    // ventas por día dentro del rango elegido
    const rangeSales = all.filter((s) => {
      const c = new Date(s.created_at); return c >= rangeStart && c <= rangeEnd
    })

    // costo del mes (utilidad) y renglones del rango (top productos): independientes entre sí
    const [costItemsRes, topItemsRes] = await Promise.all([
      monthSales.length
        ? supabase.from('sale_items').select('sale_id,unit_cost,qty').in('sale_id', monthSales.map((s) => s.id))
        : Promise.resolve({ data: [] }),
      rangeSales.length
        ? supabase.from('sale_items').select('product_name,size,color,qty,line_total').in('sale_id', rangeSales.map((s) => s.id))
        : Promise.resolve({ data: [] }),
    ])

    const costBySale = {}
    for (const it of costItemsRes.data ?? []) {
      costBySale[it.sale_id] = (costBySale[it.sale_id] || 0) + Number(it.unit_cost) * it.qty
    }
    const costSum = (arr) => arr.reduce((s, r) => s + (costBySale[r.id] || 0), 0)

    setKpi({
      today: sum(today),
      todayCount: today.length,
      week: sum(all.filter((s) => new Date(s.created_at) >= start7)),
      month: sum(monthSales),
      profitMonth: sum(monthSales) - costSum(monthSales),
      inventoryValue,
    })

    const dayCount = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1)
    const days = []
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i)
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const t = sum(rangeSales.filter((s) => {
        const c = new Date(s.created_at); return c >= d && c < next
      }))
      days.push({ label: dateShort(d), total: t })
    }
    setByDay(days)

    const map = {}
    for (const it of topItemsRes.data ?? []) {
      const key = it.product_name
      map[key] = map[key] || { name: key, qty: 0, total: 0 }
      map[key].qty += it.qty
      map[key].total += Number(it.line_total)
    }
    setTop(Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 6))

    setLoading(false)
  }

  if (loading) return <Spinner />

  const maxDay = Math.max(1, ...byDay.map((d) => d.total))
  const maxTop = Math.max(1, ...top.map((t) => t.qty))

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-4">
        <div>
          <p className="eyebrow">Análisis</p>
          <h1 className="text-2xl font-bold text-ink">Reportes</h1>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Desde</label>
            <input className="input !py-2" type="date" value={from} max={to}
              onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input className="input !py-2" type="date" value={to} min={from} max={todayISO()}
              onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Kpi label="Ventas hoy" value={money(kpi.today)} sub={`${kpi.todayCount} tickets`} accent />
        <Kpi label="Últimos 7 días" value={money(kpi.week)} />
        <Kpi label="Este mes" value={money(kpi.month)} />
        <Kpi label="Utilidad del mes" value={money(kpi.profitMonth)} sub="ventas − costo" />
        <Kpi label="Valor de inventario" value={money(kpi.inventoryValue)} sub="stock × costo" />
        <Kpi label="Alertas de stock" value={low.length} sub="variantes bajas" warn={low.length > 0} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Ventas por día */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <IconChart size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Ventas por día</h2>
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
          <h2 className="font-bold text-ink mb-5">Más vendidos</h2>
          {top.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Sin ventas en este periodo.</p>
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
