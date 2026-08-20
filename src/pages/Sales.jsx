import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, Spinner, Empty } from '../components/UI'
import { money, folio, dateTime, variantLabel } from '../lib/format'
import { IconReceipt } from '../components/Icons'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function Sales() {
  const { isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [detail, setDetail] = useState(null)

  async function load() {
    setLoading(true)
    const start = new Date(from + 'T00:00:00').toISOString()
    const end = new Date(to + 'T23:59:59').toISOString()
    const { data } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', start).lte('created_at', end)
      .order('created_at', { ascending: false })
    setRows(data ?? [])

    if (isAdmin && data?.length) {
      const ids = [...new Set(data.map((s) => s.cashier_id))]
      const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', ids)
      setNames(Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name])))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [from, to])   // eslint-disable-line

  const total = rows.reduce((s, r) => s + Number(r.total), 0)

  async function openDetail(sale) {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
    setDetail({ sale, items: data ?? [] })
  }

  const methodPill = (m) => ({
    efectivo: 'bg-money/10 text-money-dark',
    tarjeta: 'bg-blue-50 text-blue-600',
    transferencia: 'bg-violet-50 text-violet-600',
  }[m] || 'bg-slate-100 text-slate-500')

  return (
    <div>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-4">
        <div>
          <p className="eyebrow">Movimientos</p>
          <h1 className="text-2xl font-bold text-ink">Ventas</h1>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Desde</label>
            <input className="input !py-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input className="input !py-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="card p-4">
          <p className="eyebrow">Ventas</p>
          <p className="font-display font-extrabold text-2xl text-ink mt-1">{rows.length}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Total</p>
          <p className="font-display font-extrabold text-2xl text-money-dark mt-1 tnum">{money(total)}</p>
        </div>
      </div>

      {loading ? <Spinner /> :
       rows.length === 0 ? (
        <Empty icon={<IconReceipt size={40} />} title="Sin ventas en el periodo"
          hint="Cambia el rango de fechas para ver más." />
       ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Folio</th>
                <th className="px-4 py-3 font-semibold">Fecha</th>
                {isAdmin && <th className="px-4 py-3 font-semibold hidden sm:table-cell">Cajero</th>}
                <th className="px-4 py-3 font-semibold">Pago</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s) => (
                <tr key={s.id} onClick={() => openDetail(s)}
                    className="hover:bg-slate-50/60 cursor-pointer">
                  <td className="px-4 py-3 font-semibold text-ink tnum">{folio(s.folio)}</td>
                  <td className="px-4 py-3 text-slate-500">{dateTime(s.created_at)}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{names[s.cashier_id] || '—'}</td>}
                  <td className="px-4 py-3">
                    <span className={`pill ${methodPill(s.payment_method)} capitalize`}>{s.payment_method}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-ink tnum">{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       )}

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? folio(detail.sale.folio) : ''}>
        {detail && (
          <div>
            <p className="text-sm text-slate-500">{dateTime(detail.sale.created_at)}</p>
            <div className="divide-y divide-slate-100 my-4">
              {detail.items.map((it) => (
                <div key={it.id} className="flex justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-ink">{it.product_name}</p>
                    <p className="text-xs text-slate-400">
                      {variantLabel(it.size, it.color)} · {it.qty} × {money(it.unit_price)}
                    </p>
                  </div>
                  <span className="font-semibold text-ink tnum">{money(it.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-sm border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tnum">{money(detail.sale.subtotal)}</span></div>
              {detail.sale.discount > 0 && (
                <div className="flex justify-between text-slate-500"><span>Descuento</span><span className="tnum">− {money(detail.sale.discount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-ink text-base pt-1"><span>Total</span><span className="tnum">{money(detail.sale.total)}</span></div>
              {detail.sale.payment_method === 'efectivo' && detail.sale.cash_received != null && (
                <>
                  <div className="flex justify-between text-slate-500"><span>Recibido</span><span className="tnum">{money(detail.sale.cash_received)}</span></div>
                  <div className="flex justify-between text-money-dark font-semibold"><span>Cambio</span><span className="tnum">{money(detail.sale.change)}</span></div>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
