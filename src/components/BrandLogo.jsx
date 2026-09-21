// Logo de la tienda: como el logo que suba el admin puede tener cualquier
// forma (cuadrado, alargado, con texto) y color (oscuro, claro, saturado),
// se muestra sobre una tarjeta blanca fija en vez de directo sobre fondos
// oscuros como el del sidebar, donde un logo con texto negro se vuelve
// invisible.
export default function BrandLogo({ logoUrl, name, size = 40, className = '' }) {
  if (logoUrl) {
    return (
      <span
        style={{ height: size, maxWidth: size * 3.5 }}
        className={`inline-flex items-center justify-center shrink-0 rounded-xl bg-white px-1.5 py-1 shadow-sm ring-1 ring-black/5 ${className}`}>
        <img src={logoUrl} alt={name || ''}
          style={{ maxHeight: size - 8, maxWidth: size * 3.2 }}
          className="object-contain" />
      </span>
    )
  }
  return (
    <div style={{ height: size, width: size }}
      className={`rounded-2xl bg-brand grid place-items-center shrink-0 font-display font-extrabold text-white ${className}`}>
      <span style={{ fontSize: size * 0.45 }}>{(name || 'D').trim().charAt(0).toUpperCase()}</span>
    </div>
  )
}
