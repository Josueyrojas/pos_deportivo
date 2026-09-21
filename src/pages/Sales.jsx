import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast, Modal, Spinner, Empty } from '../components/UI'
import { money, folio, dateTime, variantLabel } from '../lib/format'
import { downloadCsv } from '../lib/csv'
import { IconReceipt, IconUndo, IconDownload } from '../components/Icons'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function Sales() {
  const { isAdmin, profile } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [detail, setDetail] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

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

  const activeRows = rows.filter((r) => r.status !== 'cancelled')
  const total = activeRows.reduce((s, r) => s + Number(r.total), 0)

  async function openDetail(sale) {
    const { data } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
    setDetail({ sale, items: data ?? [] })
    setConfirmCancel(false)
    setCancelReason('')
  }

  async function cancelSale() {
    setCancelling(true)
    const { error } = await supabase.rpc('cancel_sale', {
      p_sale_id: detail.sale.id,
      p_reason: cancelReason.trim(),
    })
    setCancelling(false)
    if (error) { toast.err(error.message || 'No se pudo cancelar la venta'); return }
    toast.ok('Venta cancelada · stock devuelto')
    setDetail(null)
    load()
  }

  const canCancel = (sale) =>
    sale && sale.status !== 'cancelled' && (isAdmin || sale.cashier_id === profile?.id)

  function exportCsv() {
    downloadCsv(
      `ventas_${from}_a_${to}.csv`,
      ['Folio', 'Fecha', ...(isAdmin ? ['Cajero'] : []), 'Pago', 'Estado', 'Total'],
      rows.map((s) => [
        folio(s.folio), dateTime(s.created_at),
        ...(isAdmin ? [names[s.cashier_id] || ''] : []),
        s.payment_method, s.status === 'cancelled' ? 'Cancelada' : 'Completada',
        Number(s.total).toFixed(2),
      ])
    )
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
          <button className="btn-ghost !py-2.5" onClick={exportCsv} disabled={rows.length === 0}>
            <IconDownload size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="card p-4">
          <p className="eyebrow">Ventas</p>
          <p className="font-display font-extrabold text-2xl text-ink mt-1">{activeRows.length}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Total</p>
          <p className="font-display font-extrabold text-2xl text-money-dark mt-1 tnum">{money(total)}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow">Canceladas</p>
          <p className="font-display font-extrabold text-2xl text-slate-400 mt-1">{rows.length - activeRows.length}</p>
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
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((s) => {
                const cancelled = s.status === 'cancelled'
                return (
                <tr key={s.id} onClick={() => openDetail(s)}
                    className={`hover:bg-slate-50/60 cursor-pointer ${cancelled ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-ink tnum">{folio(s.folio)}</td>
                  <td className="px-4 py-3 text-slate-500">{dateTime(s.created_at)}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{names[s.cashier_id] || '—'}</td>}
                  <td className="px-4 py-3">
                    <span className={`pill ${methodPill(s.payment_method)} capitalize`}>{s.payment_method}</span>
                  </td>
                  <td className="px-4 py-3">
                    {cancelled
                      ? <span className="pill bg-red-50 text-red-500">Cancelada</span>
                      : <span className="pill bg-money/10 text-money-dark">Completada</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold tnum ${cancelled ? 'line-through text-slate-400' : 'text-ink'}`}>
                    {money(s.total)}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
       )}

      {/* Detalle */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? folio(detail.sale.folio) : ''}>
        {detail && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{dateTime(detail.sale.created_at)}</p>
              {detail.sale.status === 'cancelled' && (
                <span className="pill bg-red-50 text-red-500">Cancelada</span>
              )}
            </div>
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
              {detail.sale.status === 'cancelled' && detail.sale.cancel_reason && (
                <div className="text-xs text-slate-400 pt-1">Motivo: {detail.sale.cancel_reason}</div>
              )}
            </div>

            {canCancel(detail.sale) && (
              confirmCancel ? (
                <div className="mt-5 rounded-xl border border-red-100 bg-red-50/50 p-4">
                  <p className="text-sm text-red-700 font-semibold mb-2">
                    Esto regresa el stock de todos los productos de esta venta. ¿Confirmas?
                  </p>
                  <input className="input mb-3" value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Motivo (opcional)" />
                  <div className="flex gap-2">
                    <button className="btn-ghost flex-1" onClick={() => setConfirmCancel(false)}>
                      Volver
                    </button>
                    <button className="btn-danger flex-1" onClick={cancelSale} disabled={cancelling}>
                      {cancelling ? 'Cancelando…' : 'Sí, cancelar venta'}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn-danger w-full mt-5" onClick={() => setConfirmCancel(true)}>
                  <IconUndo size={16} /> Cancelar / devolver venta
                </button>
              )
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
