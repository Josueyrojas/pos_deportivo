const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2,
})

export const money = (n) => mxn.format(Number(n || 0))

export const folio = (n) => '#' + String(n).padStart(6, '0')

export const dateTime = (d) =>
  new Date(d).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

export const dateShort = (d) =>
  new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

export const variantLabel = (size, color) =>
  [size, color].filter(Boolean).join(' · ') || 'Único'
