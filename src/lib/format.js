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

export const UNIT_OPTIONS = [
  { value: 'pieza', label: 'Pieza',  abbr: 'pz' },
  { value: 'metro',  label: 'Metro',  abbr: 'm' },
  { value: 'kg',     label: 'Kilogramo', abbr: 'kg' },
  { value: 'litro',  label: 'Litro', abbr: 'L' },
  { value: 'caja',   label: 'Caja',  abbr: 'caja' },
  { value: 'rollo',  label: 'Rollo', abbr: 'rollo' },
  { value: 'par',    label: 'Par',   abbr: 'par' },
]

export const unitAbbr = (unit) => UNIT_OPTIONS.find((u) => u.value === unit)?.abbr || 'pz'

// pieza/caja/par se venden en enteros; metro/kg/litro/rollo admiten fracciones
export const isFractionalUnit = (unit) => !['pieza', 'caja', 'par'].includes(unit)

export const qtyStep = (unit) => (isFractionalUnit(unit) ? 0.5 : 1)

export const qtyLabel = (value, unit) => {
  const n = Number(value) || 0
  const decimals = isFractionalUnit(unit) && n % 1 !== 0 ? 2 : 0
  return `${n.toFixed(decimals)} ${unitAbbr(unit)}`
}
