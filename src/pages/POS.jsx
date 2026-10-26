import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { useToast, Modal, Spinner, Empty } from '../components/UI'
import { money, folio, variantLabel, dateTime, qtyLabel, qtyStep, isFractionalUnit, unitAbbr } from '../lib/format'
import { IconSearch, IconCart, IconPlus, IconTrash, IconBox, IconCheck, IconPrint } from '../components/Icons'

const IVA_RATE = 0.16   // fijo para todos los negocios; el cálculo real lo hace process_sale en el servidor
const round3 = (n) => Math.round(n * 1000) / 1000

export default function POS() {
  const { profile } = useAuth()
  const toast = useToast()

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])           // [{variant_id, name, size, color, price, qty, stock}]
  const [discount, setDiscount] = useState('')
  const [pickProduct, setPickProduct] = useState(null) // producto con variantes a elegir

  const [session, setSession] = useState(null)   // sesión de caja abierta
  const [openingModal, setOpeningModal] = useState(false)
  const [openingAmount, setOpeningAmount] = useState('')

  const [payModal, setPayModal] = useState(false)
  const [ticket, setTicket] = useState(null)

  /* ---------- carga de datos ---------- */
  async function loadProducts() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id,name,brand,price,unit,image_url,active, category:categories(name), variants:product_variants(id,size,color,sku,price,stock,min_stock,active)')
      .eq('active', true)
      .order('name')
    if (error) toast.err('No se pudo cargar el catálogo')
    setProducts(data ?? [])
    setLoading(false)
  }

  async function loadSession() {
    const { data } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('status', 'open')
      .eq('opened_by', profile.id)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSession(data ?? null)
  }

  useEffect(() => { loadProducts(); loadSession() }, [])   // eslint-disable-line

  /* ---------- filtrado ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q) ||
      (p.variants || []).some((v) => (v.sku || '').toLowerCase().includes(q)))
  }, [products, query])

  /* ---------- lector de código de barras ----------
     Un lector USB "teclea" el SKU y termina con Enter. Si coincide
     exacto con una variante, se agrega directo al carrito. */
  function onSearchKeyDown(e) {
    if (e.key !== 'Enter') return
    const code = query.trim().toLowerCase()
    if (!code) return
    for (const p of products) {
      const v = (p.variants || []).find((v) => (v.sku || '').toLowerCase() === code)
      if (v) { e.preventDefault(); addVariant(p, v); setQuery(''); return }
    }
  }

  const stockOf = (p) =>
    (p.variants || []).filter((v) => v.active).reduce((s, v) => s + v.stock, 0)

  /* ---------- carrito ---------- */
  function addVariant(product, variant) {
    if (variant.stock <= 0) { toast.err('Sin stock disponible'); return }
    const step = qtyStep(product.unit)
    setCart((c) => {
      const found = c.find((i) => i.variant_id === variant.id)
      if (found) {
        if (found.qty + step > variant.stock) { toast.err('No hay más stock'); return c }
        return c.map((i) => i.variant_id === variant.id ? { ...i, qty: round3(i.qty + step) } : i)
      }
      return [...c, {
        variant_id: variant.id,
        name: product.name,
        size: variant.size, color: variant.color,
        price: variant.price ?? product.price,
        unit: product.unit,
        qty: step, stock: variant.stock,
      }]
    })
  }

  function onProductClick(p) {
    const active = (p.variants || []).filter((v) => v.active)
    if (active.length === 0) { toast.err('Producto sin variantes'); return }
    // producto de una sola variante "única" (sin talla/color): agregar directo
    if (active.length === 1 && !active[0].size && !active[0].color) {
      addVariant(p, active[0]); return
    }
    setPickProduct(p)
  }

  const setQty = (variant_id, qty) =>
    setCart((c) => c.map((i) => {
      if (i.variant_id !== variant_id) return i
      const min = isFractionalUnit(i.unit) ? 0.01 : 1
      const q = round3(Math.max(min, Math.min(Number(qty) || min, i.stock)))
      return { ...i, qty: q }
    }))

  const removeItem = (variant_id) =>
    setCart((c) => c.filter((i) => i.variant_id !== variant_id))

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const disc = Math.min(Number(discount) || 0, subtotal)
  const taxable = subtotal - disc
  const tax = Math.round(taxable * IVA_RATE * 100) / 100
  const total = taxable + tax

  /* ---------- abrir caja ---------- */
  async function openSession() {
    const amt = Number(openingAmount) || 0
    const { data, error } = await supabase
      .from('cash_sessions')
      .insert({ opened_by: profile.id, opening_amount: amt })
      .select().single()
    if (error) { toast.err('No se pudo abrir la caja'); return }
    setSession(data)
    setOpeningModal(false)
    setOpeningAmount('')
    toast.ok('Caja abierta')
  }

  /* ---------- cobrar ---------- */
  function startCheckout() {
    if (cart.length === 0) { toast.err('El carrito está vacío'); return }
    if (!session) { toast.err('Primero abre la caja'); setOpeningModal(true); return }
    setPayModal(true)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6">
      {/* -------- Catálogo -------- */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <p className="eyebrow">Punto de venta</p>
            <h1 className="text-2xl font-bold text-ink">Cobrar</h1>
          </div>
          {session ? (
            <span className="pill bg-money/10 text-money-dark">
              <span className="h-2 w-2 rounded-full bg-money" /> Caja abierta
            </span>
          ) : (
            <button className="btn-ink" onClick={() => setOpeningModal(true)}>Abrir caja</button>
          )}
        </div>

        <div className="relative mb-4">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
          <input className="input pl-11" placeholder="Buscar producto, marca o escanear código…"
            value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKeyDown} autoFocus />
        </div>

        {loading ? <Spinner label="Cargando catálogo…" /> :
         filtered.length === 0 ? (
          <Empty icon={<IconBox size={40} />} title="Sin productos"
            hint="No hay productos que coincidan con la búsqueda." />
         ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const s = stockOf(p)
              return (
                <button key={p.id} onClick={() => onProductClick(p)} disabled={s <= 0}
                  className="card p-3 text-left hover:border-brand hover:shadow-md transition disabled:opacity-50 group">
                  <div className="aspect-square w-full rounded-xl bg-slate-100 overflow-hidden grid place-items-center text-slate-300 group-hover:text-brand transition mb-3">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                      : <IconBox size={32} />}
                  </div>
                  <p className="font-semibold text-sm text-ink leading-tight line-clamp-2 px-1">{p.name}</p>
                  {p.brand && <p className="text-xs text-slate-400 mt-0.5 px-1">{p.brand}</p>}
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="font-bold text-brand tnum">{money(p.price)}</span>
                    <span className={`text-[11px] font-semibold ${s <= 3 ? 'text-red-500' : 'text-slate-400'}`}>
                      {qtyLabel(s, p.unit)}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
         )}
      </div>

      {/* -------- Carrito -------- */}
      <div className="lg:sticky lg:top-8 h-fit">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <IconCart size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Ticket</h2>
            <span className="ml-auto text-sm text-slate-400">{cart.length} art.</span>
          </div>

          <div className="max-h-[42vh] overflow-auto divide-y divide-slate-50">
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">
                Toca un producto para agregarlo.
              </p>
            ) : cart.map((i) => (
              <div key={i.variant_id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{i.name}</p>
                  <p className="text-xs text-slate-400">
                    {variantLabel(i.size, i.color)} · {money(i.price)}
                    {isFractionalUnit(i.unit) && <span className="text-slate-300">/{qtyLabel(1, i.unit).split(' ')[1]}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setQty(i.variant_id, round3(i.qty - qtyStep(i.unit)))}
                    className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 shrink-0">–</button>
                  <input type="number" min="0" step={isFractionalUnit(i.unit) ? '0.01' : '1'}
                    value={i.qty} onChange={(e) => setQty(i.variant_id, e.target.value)}
                    className="w-14 text-center text-sm font-bold tnum input !py-1 !px-1" />
                  <button onClick={() => setQty(i.variant_id, round3(i.qty + qtyStep(i.unit)))}
                    className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 shrink-0">+</button>
                </div>
                <span className="w-16 text-right text-sm font-bold text-ink tnum">{money(i.price * i.qty)}</span>
                <button onClick={() => removeItem(i.variant_id)} className="text-slate-300 hover:text-red-500">
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span className="tnum">{money(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-slate-500">
              <span>Descuento</span>
              <div className="flex items-center gap-1">
                <span className="text-slate-400">$</span>
                <input className="input py-1 px-2 w-24 text-right tnum" type="number" min="0"
                  value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>IVA (16%)</span><span className="tnum">{money(tax)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200">
              <span className="font-bold text-ink">Total</span>
              <span className="font-display font-extrabold text-2xl text-ink tnum">{money(total)}</span>
            </div>
            <button className="btn-money w-full !py-3 text-base mt-2" onClick={startCheckout}>
              <IconCheck /> Cobrar {money(total)}
            </button>
            {cart.length > 0 && (
              <button className="btn-ghost w-full" onClick={() => { setCart([]); setDiscount('') }}>
                Vaciar ticket
              </button>
            )}
          </div>
        </div>
      </div>

      {/* -------- Modal elegir variante -------- */}
      <VariantPicker product={pickProduct} onClose={() => setPickProduct(null)}
        onPick={(v) => { addVariant(pickProduct, v); setPickProduct(null) }} />

      {/* -------- Modal abrir caja -------- */}
      <Modal open={openingModal} onClose={() => setOpeningModal(false)} title="Abrir caja">
        <p className="text-sm text-slate-500 mb-4">
          Anota el efectivo con el que inicias el turno (fondo de caja).
        </p>
        <label className="label">Fondo inicial</label>
        <input className="input" type="number" min="0" autoFocus value={openingAmount}
          onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0.00" />
        <button className="btn-ink w-full mt-5" onClick={openSession}>Abrir caja</button>
      </Modal>

      {/* -------- Modal de pago -------- */}
      <PaymentModal
        open={payModal} onClose={() => setPayModal(false)}
        total={total} subtotal={subtotal} tax={tax} cart={cart} discount={disc} sessionId={session?.id}
        onDone={(res) => {
          setPayModal(false)
          setTicket(res)
          setCart([]); setDiscount('')
          loadProducts()   // refrescar stock
        }}
      />

      {/* -------- Ticket final -------- */}
      <TicketModal ticket={ticket} onClose={() => setTicket(null)} />
    </div>
  )
}

/* ============ Selector de variante ============ */
function VariantPicker({ product, onClose, onPick }) {
  if (!product) return null
  const variants = (product.variants || []).filter((v) => v.active)
  return (
    <Modal open={!!product} onClose={onClose} title={product.name} wide>
      {product.image_url && (
        <img src={product.image_url} alt=""
          className="w-full h-44 object-cover rounded-xl mb-4 border border-slate-100" />
      )}
      <p className="text-sm text-slate-500 mb-4">Elige una opción.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {variants.map((v) => (
          <button key={v.id} disabled={v.stock <= 0} onClick={() => onPick(v)}
            className="card p-3 text-left hover:border-brand disabled:opacity-40 transition">
            <p className="font-semibold text-ink">{variantLabel(v.size, v.color)}</p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-brand font-bold tnum">{money(v.price ?? product.price)}</span>
              <span className={`text-xs font-semibold ${v.stock <= v.min_stock ? 'text-red-500' : 'text-slate-400'}`}>
                {qtyLabel(v.stock, product.unit)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/* ============ Modal de pago ============ */
function PaymentModal({ open, onClose, total, subtotal, tax, cart, discount, sessionId, onDone }) {
  const toast = useToast()
  const [method, setMethod] = useState('efectivo')
  const [received, setReceived] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) { setMethod('efectivo'); setReceived(''); setCustomerName('') } }, [open])

  const change = method === 'efectivo' ? Math.max((Number(received) || 0) - total, 0) : 0
  const insufficient = method === 'efectivo' && received !== '' && Number(received) < total

  async function confirm() {
    if (insufficient) { toast.err('El efectivo recibido es menor al total'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('process_sale', {
      p_items: cart.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
      p_payment_method: method,
      p_discount: discount,
      p_cash_received: method === 'efectivo' ? (Number(received) || total) : null,
      p_session_id: sessionId,
      p_customer_name: customerName.trim(),
    })
    setBusy(false)
    if (error) { toast.err(error.message || 'No se pudo registrar la venta'); return }
    toast.ok(`Venta ${folio(data.folio)} registrada`)
    onDone({ ...data, method, items: cart })
  }

  const methods = [
    { id: 'efectivo', label: 'Efectivo' },
    { id: 'tarjeta', label: 'Tarjeta' },
    { id: 'transferencia', label: 'Transfer.' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Cobrar venta">
      <div className="space-y-1 mb-4 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Subtotal</span><span className="tnum">{money(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>Descuento</span><span className="tnum">− {money(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-500">
          <span>IVA (16%)</span><span className="tnum">{money(tax)}</span>
        </div>
      </div>
      <div className="flex justify-between items-baseline mb-5 pt-3 border-t border-slate-100">
        <span className="text-slate-500">Total a pagar</span>
        <span className="font-display font-extrabold text-3xl text-ink tnum">{money(total)}</span>
      </div>

      <label className="label">Cliente (opcional)</label>
      <input className="input mb-4" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
        placeholder="Para la nota de remisión" />

      <label className="label">Método de pago</label>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {methods.map((m) => (
          <button key={m.id} onClick={() => setMethod(m.id)}
            className={`btn ${method === m.id ? 'bg-ink text-white' : 'bg-slate-100 text-slate-600'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {method === 'efectivo' && (
        <>
          <label className="label">Efectivo recibido</label>
          <input className="input text-lg tnum" type="number" min="0" autoFocus
            value={received} onChange={(e) => setReceived(e.target.value)} placeholder={total.toFixed(2)} />
          <div className="grid grid-cols-4 gap-2 mt-2">
            {[total, 100, 200, 500].map((v, idx) => (
              <button key={idx} onClick={() => setReceived(String(Math.ceil(v)))}
                className="btn-ghost text-xs !py-2">
                {idx === 0 ? 'Exacto' : `$${v}`}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-baseline mt-4 rounded-xl bg-money/5 px-4 py-3">
            <span className="text-money-dark font-semibold">Cambio</span>
            <span className="font-display font-bold text-2xl text-money-dark tnum">{money(change)}</span>
          </div>
          {insufficient && <p className="text-sm text-red-600 mt-2">Falta {money(total - Number(received))}.</p>}
        </>
      )}

      <button className="btn-money w-full !py-3 mt-6" onClick={confirm} disabled={busy}>
        {busy ? 'Registrando…' : 'Confirmar venta'}
      </button>
    </Modal>
  )
}

/* ============ Ticket ============ */
function TicketModal({ ticket, onClose }) {
  const business = useBusiness()
  if (!ticket) return null

  function printTicket() {
    const w = window.open('', '_blank', 'width=380,height=600')
    if (!w) return
    const rows = ticket.items.map((i) => `
      <div class="item">
        <div class="item-name">${escapeHtml(i.name)}${i.size || i.color ? ` <span class="muted">(${escapeHtml(variantLabel(i.size, i.color))})</span>` : ''}</div>
        <div class="row">
          <span class="muted">${qtyLabel(i.qty, i.unit)} × ${money(i.price)}</span>
          <span class="line-total">${money(i.price * i.qty)}</span>
        </div>
      </div>`).join('')
    w.document.write(`
      <html><head><title>${folio(ticket.folio)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 78mm; margin: 0 auto; padding: 14px 12px; color: #111; }
        .brand { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 4px; }
        .brand img { max-height: 46px; max-width: 70%; object-fit: contain; }
        h1 { font-size: 16px; letter-spacing: .03em; text-align: center; margin: 0; text-transform: uppercase; }
        .center { text-align: center; }
        .muted { color: #666; font-size: 10.5px; }
        hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
        hr.strong { border-top: 2px solid #111; }
        .row { display: flex; justify-content: space-between; gap: 8px; margin: 1px 0; }
        .item { margin: 7px 0; }
        .item-name { font-weight: bold; font-size: 12px; }
        .line-total { font-weight: bold; }
        .folio { display: inline-block; border: 1px solid #111; border-radius: 10px; padding: 2px 10px; font-weight: bold; font-size: 11px; letter-spacing: .04em; margin-top: 4px; }
        .totals .row { font-size: 12px; color: #333; }
        .grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; padding-top: 6px; border-top: 2px solid #111; }
        .grand .label { font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: .04em; }
        .grand .value { font-weight: bold; font-size: 20px; }
        .footer { text-align: center; margin-top: 14px; }
        .footer .thanks { font-weight: bold; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; }
        .dots { letter-spacing: 3px; color: #999; text-align: center; margin: 10px 0; }
      </style></head>
      <body>
        <div class="brand">
          ${business.logo_url ? `<img src="${business.logo_url}" alt="" />` : ''}
          <h1>${escapeHtml(business.name || 'Tienda')}</h1>
        </div>
        <p class="center muted">${dateTime(new Date())}</p>
        <div class="center"><span class="folio">${folio(ticket.folio)}</span></div>
        <hr />
        ${rows}
        <hr />
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${money(ticket.subtotal)}</span></div>
          ${ticket.discount > 0 ? `<div class="row"><span>Descuento</span><span>− ${money(ticket.discount)}</span></div>` : ''}
          <div class="row"><span>IVA (16%)</span><span>${money(ticket.tax)}</span></div>
        </div>
        <div class="grand"><span class="label">Total</span><span class="value">${money(ticket.total)}</span></div>
        <div class="row muted" style="margin-top:8px"><span>Forma de pago</span><span class="center" style="text-transform:capitalize">${ticket.method}</span></div>
        ${ticket.method === 'efectivo' && ticket.change > 0 ? `<div class="row muted"><span>Cambio</span><span>${money(ticket.change)}</span></div>` : ''}
        <div class="dots">• • •</div>
        <div class="footer">
          <p class="thanks">¡Gracias por su compra!</p>
        </div>
      </body></html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  function printRemision() {
    const w = window.open('', '_blank', 'width=850,height=1000')
    if (!w) return
    const rows = ticket.items.map((i) => `
      <tr>
        <td class="num">${qtyLabel(i.qty, i.unit).split(' ')[0]}</td>
        <td class="center">${unitAbbr(i.unit)}</td>
        <td>${escapeHtml(i.name)}${i.size || i.color ? ` <span class="muted">(${escapeHtml(variantLabel(i.size, i.color))})</span>` : ''}</td>
        <td class="num">${money(i.price)}</td>
        <td class="num">${money(i.price * i.qty)}</td>
      </tr>`).join('')
    w.document.write(`
      <html><head><title>Nota de remisión ${folio(ticket.folio)}</title>
      <style>
        @page { size: letter; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #111; padding-bottom: 12px; margin-bottom: 14px; }
        .header img { max-height: 60px; max-width: 220px; object-fit: contain; }
        .biz-name { font-size: 18px; font-weight: bold; margin: 0 0 2px; }
        .biz-meta { font-size: 11px; color: #555; line-height: 1.5; }
        .doc-title { text-align: right; }
        .doc-title h1 { font-size: 20px; letter-spacing: .04em; margin: 0 0 6px; text-transform: uppercase; }
        .folio-box { display: inline-block; border: 2px solid #111; border-radius: 8px; padding: 4px 14px; font-weight: bold; font-size: 13px; }
        .meta-row { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 14px; font-size: 12px; }
        .meta-row .field { flex: 1; }
        .meta-row .label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: #888; display: block; margin-bottom: 1px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th { background: #111; color: #fff; text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; padding: 7px 8px; }
        td { padding: 7px 8px; border-bottom: 1px solid #e5e5e5; font-size: 12px; vertical-align: top; }
        .num { text-align: right; white-space: nowrap; }
        .center { text-align: center; }
        .muted { color: #777; font-size: 10.5px; }
        .totals { margin-left: auto; width: 260px; }
        .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; }
        .totals .grand { display: flex; justify-content: space-between; border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; font-weight: bold; font-size: 16px; }
        .signatures { display: flex; gap: 40px; margin-top: 60px; }
        .sig { flex: 1; text-align: center; }
        .sig .line { border-top: 1px solid #333; margin-bottom: 4px; }
        .sig .label { font-size: 11px; color: #555; }
        .disclaimer { margin-top: 28px; font-size: 10px; color: #999; text-align: center; font-style: italic; }
      </style></head>
      <body>
        <div class="header">
          <div style="display:flex; gap:14px; align-items:center;">
            ${business.logo_url ? `<img src="${business.logo_url}" alt="" />` : ''}
            <div>
              <p class="biz-name">${escapeHtml(business.name || 'Negocio')}</p>
              <div class="biz-meta">
                ${business.address ? `${escapeHtml(business.address)}<br/>` : ''}
                ${business.phone ? `Tel. ${escapeHtml(business.phone)}` : ''}${business.phone && business.rfc ? ' · ' : ''}${business.rfc ? `RFC ${escapeHtml(business.rfc)}` : ''}
              </div>
            </div>
          </div>
          <div class="doc-title">
            <h1>Nota de remisión</h1>
            <span class="folio-box">${folio(ticket.folio)}</span>
          </div>
        </div>

        <div class="meta-row">
          <div class="field"><span class="label">Cliente</span>${escapeHtml(ticket.customer_name) || '—'}</div>
          <div class="field"><span class="label">Fecha</span>${dateTime(new Date())}</div>
          <div class="field"><span class="label">Forma de pago</span><span style="text-transform:capitalize">${ticket.method}</span></div>
        </div>

        <table>
          <thead><tr><th>Cant.</th><th>Unidad</th><th>Descripción</th><th class="num">P. unitario</th><th class="num">Importe</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${money(ticket.subtotal)}</span></div>
          ${ticket.discount > 0 ? `<div class="row"><span>Descuento</span><span>− ${money(ticket.discount)}</span></div>` : ''}
          <div class="row"><span>IVA (16%)</span><span>${money(ticket.tax)}</span></div>
          <div class="grand"><span>Total</span><span>${money(ticket.total)}</span></div>
          ${ticket.method === 'efectivo' && ticket.change > 0 ? `<div class="row"><span>Cambio</span><span>${money(ticket.change)}</span></div>` : ''}
        </div>

        <div class="signatures">
          <div class="sig"><div class="line"></div><span class="label">Entregó</span></div>
          <div class="sig"><div class="line"></div><span class="label">Recibí de conformidad</span></div>
        </div>

        <p class="disclaimer">Documento sin validez fiscal. No sustituye una factura (CFDI).</p>
      </body></html>
    `)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Modal open={!!ticket} onClose={onClose} title="Venta registrada">
      <div className="text-center pt-1 pb-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-money/10 text-money grid place-items-center mb-2">
          <IconCheck size={24} />
        </div>
        <span className="pill bg-ink text-white">{folio(ticket.folio)}</span>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-4">
        <div className="text-center mb-3">
          {business.logo_url
            ? <img src={business.logo_url} alt="" className="h-9 mx-auto object-contain mb-1" />
            : <p className="font-display font-bold text-ink">{business.name || 'Tienda'}</p>}
          <p className="text-xs text-slate-400">{dateTime(new Date())}</p>
          {ticket.customer_name && (
            <p className="text-xs text-slate-500 mt-1">Cliente: <b>{ticket.customer_name}</b></p>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {ticket.items.map((i) => (
            <div key={i.variant_id} className="py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-ink">{i.name}</span>
                <span className="font-semibold text-ink tnum shrink-0">{money(i.price * i.qty)}</span>
              </div>
              <p className="text-xs text-slate-400">
                {variantLabel(i.size, i.color)} · {qtyLabel(i.qty, i.unit)} × {money(i.price)}
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm pt-3 mt-1 border-t border-dashed border-slate-200">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tnum">{money(ticket.subtotal)}</span></div>
          {ticket.discount > 0 && (
            <div className="flex justify-between text-slate-500"><span>Descuento</span><span className="tnum">− {money(ticket.discount)}</span></div>
          )}
          <div className="flex justify-between text-slate-500"><span>IVA (16%)</span><span className="tnum">{money(ticket.tax)}</span></div>
        </div>

        <div className="flex justify-between items-baseline mt-2 pt-2 border-t-2 border-ink">
          <span className="font-bold text-ink uppercase text-sm tracking-wide">Total</span>
          <span className="font-display font-extrabold text-3xl text-ink tnum">{money(ticket.total)}</span>
        </div>
        {ticket.method === 'efectivo' && ticket.change > 0 && (
          <p className="text-money-dark font-semibold text-sm text-right mt-1">Cambio: {money(ticket.change)}</p>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button className="btn-ghost flex-1" onClick={printTicket}>
          <IconPrint size={16} /> Ticket
        </button>
        <button className="btn-ghost flex-1" onClick={printRemision}>
          <IconPrint size={16} /> Nota de remisión
        </button>
      </div>
      <button className="btn-brand w-full mt-2" onClick={onClose}>Nueva venta</button>
    </Modal>
  )
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}
