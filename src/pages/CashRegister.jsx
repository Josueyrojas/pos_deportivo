import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast, Modal, Spinner, Empty } from '../components/UI'
import { money, dateTime } from '../lib/format'
import { IconCash, IconCheck } from '../components/Icons'

export default function CashRegister() {
  const { profile } = useAuth()
  const toast = useToast()
  const [session, setSession] = useState(null)
  const [summary, setSummary] = useState(null)   // {efectivo, tarjeta, transferencia, count, total}
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [opening, setOpening] = useState('')
  const [counted, setCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data: open } = await supabase
      .from('cash_sessions').select('*')
      .eq('opened_by', profile.id).eq('status', 'open')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle()
    setSession(open ?? null)

    if (open) {
      const { data: sales } = await supabase
        .from('sales').select('payment_method,total').eq('session_id', open.id)
      const acc = { efectivo: 0, tarjeta: 0, transferencia: 0, count: sales?.length || 0, total: 0 }
      for (const s of sales || []) { acc[s.payment_method] += Number(s.total); acc.total += Number(s.total) }
      setSummary(acc)
    } else setSummary(null)

    const { data: hist } = await supabase
      .from('cash_sessions').select('*')
      .eq('status', 'closed').order('closed_at', { ascending: false }).limit(10)
    setHistory(hist ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])   // eslint-disable-line

  async function open() {
    setBusy(true)
    const { error } = await supabase.from('cash_sessions')
      .insert({ opened_by: profile.id, opening_amount: Number(opening) || 0 })
    setBusy(false)
    if (error) { toast.err('No se pudo abrir la caja'); return }
    setOpenModal(false); setOpening(''); toast.ok('Caja abierta'); load()
  }

  async function close() {
    setBusy(true)
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id: session.id,
      p_counted_amount: Number(counted) || 0,
      p_notes: notes,
    })
    setBusy(false)
    if (error) { toast.err(error.message || 'No se pudo cerrar'); return }
    setCloseModal(false); setCounted(''); setNotes('')
    toast.ok(`Corte cerrado · Diferencia ${money(data.difference)}`)
    load()
  }

  const expectedCash = session ? Number(session.opening_amount) + (summary?.efectivo || 0) : 0

  if (loading) return <Spinner />

  return (
    <div>
      <div className="mb-5">
        <p className="eyebrow">Caja</p>
        <h1 className="text-2xl font-bold text-ink">Corte de caja</h1>
      </div>

      {!session ? (
        <div className="card p-8 text-center max-w-md">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 grid place-items-center mb-3">
            <IconCash size={26} />
          </div>
          <p className="font-bold text-ink text-lg">No tienes una caja abierta</p>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            Abre la caja con tu fondo inicial para empezar a vender.
          </p>
          <button className="btn-ink w-full" onClick={() => setOpenModal(true)}>Abrir caja</button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_1fr] gap-5">
          {/* Estado del turno */}
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <span className="pill bg-money/10 text-money-dark">
                <span className="h-2 w-2 rounded-full bg-money" /> Turno abierto
              </span>
              <span className="text-xs text-slate-400">Desde {dateTime(session.opened_at)}</span>
            </div>

            <dl className="mt-5 space-y-3">
              <Row label="Fondo inicial" value={money(session.opening_amount)} />
              <Row label="Ventas del turno" value={summary?.count ?? 0} plain />
              <div className="h-px bg-slate-100" />
              <Row label="Efectivo" value={money(summary?.efectivo || 0)} />
              <Row label="Tarjeta" value={money(summary?.tarjeta || 0)} />
              <Row label="Transferencia" value={money(summary?.transferencia || 0)} />
              <div className="h-px bg-slate-100" />
              <Row label="Total vendido" value={money(summary?.total || 0)} strong />
            </dl>
          </div>

          {/* Efectivo esperado */}
          <div className="card p-6 flex flex-col">
            <p className="eyebrow">Efectivo esperado en caja</p>
            <p className="font-display font-extrabold text-4xl text-ink mt-2 tnum">{money(expectedCash)}</p>
            <p className="text-sm text-slate-400 mt-1">Fondo inicial + ventas en efectivo</p>
            <div className="flex-1" />
            <button className="btn-brand w-full mt-6" onClick={() => setCloseModal(true)}>
              Cerrar corte
            </button>
          </div>
        </div>
      )}

      {/* Historial */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold text-ink mb-3">Cortes anteriores</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cierre</th>
                  <th className="px-4 py-3 font-semibold text-right">Esperado</th>
                  <th className="px-4 py-3 font-semibold text-right">Contado</th>
                  <th className="px-4 py-3 font-semibold text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3 text-slate-500">{dateTime(h.closed_at)}</td>
                    <td className="px-4 py-3 text-right tnum">{money(h.expected_amount)}</td>
                    <td className="px-4 py-3 text-right tnum">{money(h.counted_amount)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tnum ${
                      Number(h.difference) === 0 ? 'text-slate-500'
                      : Number(h.difference) > 0 ? 'text-money-dark' : 'text-red-500'}`}>
                      {money(h.difference)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Abrir */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caja">
        <label className="label">Fondo inicial</label>
        <input className="input" type="number" min="0" autoFocus value={opening}
          onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
        <button className="btn-ink w-full mt-5" onClick={open} disabled={busy}>
          {busy ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </Modal>

      {/* Cerrar */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Cerrar corte">
        <div className="rounded-xl bg-slate-50 px-4 py-3 mb-4">
          <div className="flex justify-between text-sm text-slate-500">
            <span>Efectivo esperado</span>
            <span className="font-semibold text-ink tnum">{money(expectedCash)}</span>
          </div>
        </div>
        <label className="label">Efectivo contado en caja</label>
        <input className="input tnum" type="number" min="0" autoFocus value={counted}
          onChange={(e) => setCounted(e.target.value)} placeholder="0.00" />
        {counted !== '' && (
          <p className={`text-sm mt-2 font-semibold ${
            Number(counted) - expectedCash === 0 ? 'text-slate-500'
            : Number(counted) - expectedCash > 0 ? 'text-money-dark' : 'text-red-500'}`}>
            Diferencia: {money(Number(counted) - expectedCash)}
          </p>
        )}
        <label className="label mt-4">Notas (opcional)</label>
        <textarea className="input" rows="2" value={notes}
          onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del turno…" />
        <button className="btn-brand w-full mt-5" onClick={close} disabled={busy}>
          <IconCheck /> {busy ? 'Cerrando…' : 'Cerrar corte'}
        </button>
      </Modal>
    </div>
  )
}

function Row({ label, value, strong, plain }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`tnum ${strong ? 'font-display font-extrabold text-xl text-ink' : 'font-semibold text-ink'}`}>
        {value}
      </dd>
    </div>
  )
}
