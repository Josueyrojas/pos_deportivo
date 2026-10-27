import { money, folio, dateTime, variantLabel, qtyLabel, unitAbbr } from './format'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

// ticket: { folio, items:[{name,size,color,qty,unit,price}], subtotal, discount,
//           tax, total, method, change, customer_name }
// business: fila de `businesses` (name, logo_url, address, phone, rfc,
//           remision_footer, remision_show_signatures)

export function printTicket(ticket, business) {
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
      <p class="center muted">${dateTime(ticket.created_at || new Date())}</p>
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

export function printRemision(ticket, business) {
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
        <div class="field"><span class="label">Fecha</span>${dateTime(ticket.created_at || new Date())}</div>
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

      ${business.remision_show_signatures !== false ? `
      <div class="signatures">
        <div class="sig"><div class="line"></div><span class="label">Entregó</span></div>
        <div class="sig"><div class="line"></div><span class="label">Recibí de conformidad</span></div>
      </div>` : ''}

      <p class="disclaimer">Documento sin validez fiscal. No sustituye una factura (CFDI).</p>
      ${business.remision_footer ? `<p class="disclaimer" style="font-style:normal; color:#555;">${escapeHtml(business.remision_footer)}</p>` : ''}
    </body></html>
  `)
  w.document.close()
  w.focus()
  w.print()
}
