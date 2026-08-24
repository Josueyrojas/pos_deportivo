import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast, Modal, Spinner, Empty } from '../components/UI'
import { money, variantLabel } from '../lib/format'
import { IconSearch, IconPlus, IconEdit, IconTrash, IconBox, IconWarn } from '../components/Icons'

const emptyVariant = () => ({ _k: crypto.randomUUID(), size: '', color: '', sku: '', price: '', stock: 0, min_stock: 0 })

export default function Inventory() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)   // producto en edición (o {} nuevo)
  const [confirmDel, setConfirmDel] = useState(null)

  async function load() {
    setLoading(true)
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products')
        .select('id,name,brand,price,cost,image_url,active,category_id, category:categories(name), variants:product_variants(id,size,color,sku,price,stock,min_stock,active)')
        .order('name'),
      supabase.from('categories').select('*').order('name'),
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q))
  }, [products, query])

  const stockOf = (p) => (p.variants || []).reduce((s, v) => s + v.stock, 0)
  const lowStock = (p) => (p.variants || []).some((v) => v.stock <= v.min_stock)

  async function remove(p) {
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) { toast.err('No se pudo eliminar'); return }
    toast.ok('Producto eliminado')
    setConfirmDel(null); load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1 className="text-2xl font-bold text-ink">Inventario</h1>
        </div>
        <button className="btn-brand" onClick={() => setEditing({ variants: [emptyVariant()] })}>
          <IconPlus /> Nuevo producto
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch /></span>
        <input className="input pl-11" placeholder="Buscar producto…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {loading ? <Spinner /> :
       filtered.length === 0 ? (
        <Empty icon={<IconBox size={40} />} title="Sin productos"
          hint="Agrega tu primer producto con el botón de arriba." />
       ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Producto</th>
                <th className="px-4 py-3 font-semibold hidden sm:table-cell">Categoría</th>
                <th className="px-4 py-3 font-semibold text-right">Precio</th>
                <th className="px-4 py-3 font-semibold text-center">Variantes</th>
                <th className="px-4 py-3 font-semibold text-right">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb src={p.image_url} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{p.name}</span>
                          {lowStock(p) && (
                            <span className="pill bg-red-50 text-red-500" title="Stock bajo"><IconWarn size={12} /></span>
                          )}
                        </div>
                        {p.brand && <span className="text-xs text-slate-400">{p.brand}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{p.category?.name || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink tnum">{money(p.price)}</td>
                  <td className="px-4 py-3 text-center text-slate-500">{(p.variants || []).length}</td>
                  <td className={`px-4 py-3 text-right font-semibold tnum ${stockOf(p) <= 5 ? 'text-red-500' : 'text-slate-700'}`}>
                    {stockOf(p)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(p)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand">
                        <IconEdit size={17} />
                      </button>
                      <button onClick={() => setConfirmDel(p)} className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
                        <IconTrash size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       )}

      <ProductEditor product={editing} categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load() }} />

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Eliminar producto">
        <p className="text-sm text-slate-600">
          ¿Seguro que quieres eliminar <b>{confirmDel?.name}</b> y todas sus variantes?
          El historial de ventas se conserva.
        </p>
        <div className="flex gap-2 mt-6">
          <button className="btn-ghost flex-1" onClick={() => setConfirmDel(null)}>Cancelar</button>
          <button className="btn-danger flex-1" onClick={() => remove(confirmDel)}>Eliminar</button>
        </div>
      </Modal>
    </div>
  )
}

/* ============ Editor de producto + variantes ============ */
function ProductEditor({ product, categories, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [variants, setVariants] = useState([])
  const [busy, setBusy] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)

  useEffect(() => {
    if (!product) { setForm(null); return }
    setForm({
      name: product.name || '',
      brand: product.brand || '',
      category_id: product.category_id || '',
      newCategory: '',
      cost: product.cost ?? '',
      price: product.price ?? '',
      image_url: product.image_url || '',
    })
    setVariants(
      (product.variants && product.variants.length
        ? product.variants.map((v) => ({
            _k: v.id, id: v.id,
            size: v.size || '', color: v.color || '', sku: v.sku || '',
            price: v.price ?? '', stock: v.stock, min_stock: v.min_stock,
          }))
        : [emptyVariant()])
    )
  }, [product])

  if (!product || !form) return null
  const isNew = !product.id
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const setV = (k, key, val) => setVariants((vs) => vs.map((v) => v._k === k ? { ...v, [key]: val } : v))

  async function uploadImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.err('La imagen no debe pasar de 5 MB'); return }
    setImgBusy(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `products/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('product-images').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { toast.err('No se pudo subir la imagen'); setImgBusy(false); return }
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    set('image_url', data.publicUrl)
    setImgBusy(false)
  }

  async function save() {
    if (!form.name.trim()) { toast.err('Ponle nombre al producto'); return }
    if (variants.length === 0) { toast.err('Agrega al menos una variante'); return }
    setBusy(true)

    // categoría nueva si aplica
    let categoryId = form.category_id || null
    if (form.newCategory.trim()) {
      const { data: cat, error } = await supabase.from('categories')
        .insert({ name: form.newCategory.trim() }).select().single()
      if (error) { toast.err('No se pudo crear la categoría'); setBusy(false); return }
      categoryId = cat.id
    }

    const payload = {
      name: form.name.trim(), brand: form.brand.trim(),
      category_id: categoryId,
      cost: Number(form.cost) || 0, price: Number(form.price) || 0,
      image_url: form.image_url || null,
    }

    let productId = product.id
    if (isNew) {
      const { data, error } = await supabase.from('products').insert(payload).select().single()
      if (error) { toast.err('No se pudo guardar'); setBusy(false); return }
      productId = data.id
    } else {
      const { error } = await supabase.from('products').update(payload).eq('id', productId)
      if (error) { toast.err('No se pudo actualizar'); setBusy(false); return }
    }

    // variantes: upsert las actuales, borrar las que se quitaron
    const existingIds = (product.variants || []).map((v) => v.id)
    const keptIds = variants.filter((v) => v.id).map((v) => v.id)
    const toDelete = existingIds.filter((id) => !keptIds.includes(id))
    if (toDelete.length) await supabase.from('product_variants').delete().in('id', toDelete)

    const rows = variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      product_id: productId,
      size: v.size.trim() || null,
      color: v.color.trim() || null,
      sku: v.sku.trim() || null,
      price: v.price === '' ? null : Number(v.price),
      stock: Number(v.stock) || 0,
      min_stock: Number(v.min_stock) || 0,
    }))
    const { error: vErr } = await supabase.from('product_variants').upsert(rows)
    setBusy(false)
    if (vErr) { toast.err('Error al guardar variantes: ' + vErr.message); return }
    toast.ok(isNew ? 'Producto creado' : 'Producto actualizado')
    onSaved()
  }

  return (
    <Modal open={!!product} onClose={onClose} title={isNew ? 'Nuevo producto' : 'Editar producto'} wide>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 flex items-center gap-4">
          <div className="h-24 w-24 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden grid place-items-center text-slate-300">
            {form.image_url
              ? <img src={form.image_url} alt="" className="h-full w-full object-cover" />
              : <IconBox size={30} />}
          </div>
          <div>
            <label className="label">Foto del producto</label>
            <div className="flex items-center gap-2">
              <label className="btn-ghost cursor-pointer !py-2">
                {imgBusy ? 'Subiendo…' : (form.image_url ? 'Cambiar' : 'Subir imagen')}
                <input type="file" accept="image/*" className="hidden"
                  onChange={uploadImage} disabled={imgBusy} />
              </label>
              {form.image_url && (
                <button type="button" className="btn-danger !py-2" onClick={() => set('image_url', '')}>
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">JPG o PNG, hasta 5 MB.</p>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nombre</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="Ej. Tenis para correr" autoFocus />
        </div>
        <div>
          <label className="label">Marca</label>
          <input className="input" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <label className="label">Categoría</label>
          <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
            <option value="">— Sin categoría —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input mt-2" value={form.newCategory}
            onChange={(e) => set('newCategory', e.target.value)} placeholder="…o escribe una nueva" />
        </div>
        <div>
          <label className="label">Costo</label>
          <input className="input tnum" type="number" min="0" value={form.cost} onChange={(e) => set('cost', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label">Precio de venta (base)</label>
          <input className="input tnum" type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <label className="label !mb-0">Variantes (talla / color / stock)</label>
          <button className="btn-ghost !py-1.5 !px-3 text-xs" onClick={() => setVariants((v) => [...v, emptyVariant()])}>
            <IconPlus size={14} /> Agregar
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Si el producto no maneja tallas ni colores, deja esos campos vacíos (variante única).
        </p>

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1.2fr_1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Talla</span><span>Color</span><span>SKU / código</span><span>Precio*</span><span>Stock</span><span>Mín.</span><span></span>
          </div>
          {variants.map((v) => (
            <div key={v._k} className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.2fr_1fr_1fr_1fr_auto] gap-2">
              <input className="input !py-2" value={v.size} onChange={(e) => setV(v._k, 'size', e.target.value)} placeholder="Talla" />
              <input className="input !py-2" value={v.color} onChange={(e) => setV(v._k, 'color', e.target.value)} placeholder="Color" />
              <input className="input !py-2" value={v.sku} onChange={(e) => setV(v._k, 'sku', e.target.value)} placeholder="Escanea o escribe" />
              <input className="input !py-2 tnum" type="number" value={v.price} onChange={(e) => setV(v._k, 'price', e.target.value)} placeholder="Base" />
              <input className="input !py-2 tnum" type="number" value={v.stock} onChange={(e) => setV(v._k, 'stock', e.target.value)} placeholder="0" />
              <input className="input !py-2 tnum" type="number" value={v.min_stock} onChange={(e) => setV(v._k, 'min_stock', e.target.value)} placeholder="0" />
              <button onClick={() => setVariants((vs) => vs.filter((x) => x._k !== v._k))}
                className="grid place-items-center text-slate-300 hover:text-red-500">
                <IconTrash size={16} />
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">*Precio: déjalo vacío para usar el precio base del producto.</p>
      </div>

      <div className="flex gap-2 mt-6">
        <button className="btn-ghost flex-1" onClick={onClose}>Cancelar</button>
        <button className="btn-brand flex-1" onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

/* ============ Miniatura de producto ============ */
function Thumb({ src }) {
  return (
    <div className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden grid place-items-center text-slate-300">
      {src
        ? <img src={src} alt="" className="h-full w-full object-cover" />
        : <IconBox size={18} />}
    </div>
  )
}
