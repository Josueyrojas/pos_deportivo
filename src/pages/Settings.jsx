import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { useToast } from '../components/UI'
import { IconImage, IconSettings } from '../components/Icons'

export default function Settings() {
  const { profile } = useAuth()
  const business = useBusiness()
  const toast = useToast()
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)

  useEffect(() => {
    if (!business.loading) {
      setName(business.name || '')
      setLogoUrl(business.logo_url || '')
    }
  }, [business.loading, business.name, business.logo_url])

  async function uploadLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.err('El logo no debe pasar de 3 MB'); return }
    setImgBusy(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `logo/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('store-assets').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { toast.err('No se pudo subir el logo'); setImgBusy(false); return }
    const { data } = supabase.storage.from('store-assets').getPublicUrl(path)
    setLogoUrl(data.publicUrl)
    setImgBusy(false)
  }

  async function save() {
    if (!name.trim()) { toast.err('Ponle un nombre a la tienda'); return }
    setBusy(true)
    const { error } = await supabase.from('businesses')
      .update({ name: name.trim(), logo_url: logoUrl || null })
      .eq('id', profile.business_id)
    setBusy(false)
    if (error) { toast.err('No se pudo guardar'); return }
    toast.ok('Configuración guardada')
    business.refresh()
  }

  return (
    <div>
      <div className="mb-5">
        <p className="eyebrow">Negocio</p>
        <h1 className="text-2xl font-bold text-ink">Configuración</h1>
      </div>

      <div className="card p-6 max-w-lg">
        <div className="flex items-center gap-2 mb-5">
          <IconSettings size={18} className="text-brand" />
          <h2 className="font-bold text-ink">Marca del negocio</h2>
        </div>

        <label className="label">Nombre del negocio</label>
        <input className="input mb-5" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Deportes Apaseo" />

        <label className="label">Logo</label>
        <div className="flex items-center gap-4">
          <div className="h-16 min-w-16 max-w-[220px] shrink-0 rounded-2xl border border-slate-200 bg-slate-50 grid place-items-center text-slate-300 px-2">
            {logoUrl
              ? <img src={logoUrl} alt="" className="h-full max-h-12 w-full object-contain" />
              : <IconImage size={26} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label className="btn-ghost cursor-pointer !py-2">
                {imgBusy ? 'Subiendo…' : (logoUrl ? 'Cambiar' : 'Subir logo')}
                <input type="file" accept="image/*" className="hidden"
                  onChange={uploadLogo} disabled={imgBusy} />
              </label>
              {logoUrl && (
                <button type="button" className="btn-danger !py-2" onClick={() => setLogoUrl('')}>
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">JPG o PNG, hasta 3 MB. Se ve en el login y el menú.</p>
          </div>
        </div>

        <button className="btn-brand w-full mt-6" onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
