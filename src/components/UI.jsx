import { createContext, useContext, useState, useCallback } from 'react'
import { IconClose, IconCheck, IconWarn } from './Icons'

/* ---------------- Toasts ---------------- */
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((msg, type = 'ok') => {
    const id = crypto.randomUUID()
    setItems((v) => [...v, { id, msg, type }])
    setTimeout(() => setItems((v) => v.filter((t) => t.id !== id)), 3500)
  }, [])
  const api = {
    ok:  (m) => push(m, 'ok'),
    err: (m) => push(m, 'err'),
  }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[320px] max-w-[90vw]">
        {items.map((t) => (
          <div key={t.id}
            className={`card flex items-start gap-3 p-3.5 border-l-4 ${
              t.type === 'ok' ? 'border-l-money' : 'border-l-red-500'
            }`}>
            <span className={t.type === 'ok' ? 'text-money' : 'text-red-500'}>
              {t.type === 'ok' ? <IconCheck /> : <IconWarn />}
            </span>
            <p className="text-sm text-slate-700 flex-1">{t.msg}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
         onMouseDown={onClose}>
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" />
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`card relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
            <IconClose />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* ---------------- Spinner ---------------- */
export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <div className="h-8 w-8 rounded-full border-3 border-slate-200 border-t-brand animate-spin"
           style={{ borderWidth: 3 }} />
      <p className="text-sm">{label}</p>
    </div>
  )
}

/* ---------------- Empty state ---------------- */
export function Empty({ icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-slate-300">{icon}</div>
      <p className="font-semibold text-slate-600">{title}</p>
      {hint && <p className="text-sm text-slate-400 max-w-xs">{hint}</p>}
    </div>
  )
}
