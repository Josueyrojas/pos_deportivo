const base = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round', strokeLinejoin: 'round',
}
const S = ({ children, size = 20, ...p }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...base} {...p}>{children}</svg>
)

export const IconCart    = (p) => <S {...p}><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l2.4 12.3a1.5 1.5 0 0 0 1.5 1.2h9.3a1.5 1.5 0 0 0 1.5-1.2L21 7H5"/></S>
export const IconBox     = (p) => <S {...p}><path d="M21 8V16a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/></S>
export const IconReceipt = (p) => <S {...p}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1L6 3 4 2z"/><path d="M8 7h8M8 11h8M8 15h5"/></S>
export const IconCash    = (p) => <S {...p}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></S>
export const IconChart   = (p) => <S {...p}><path d="M3 3v18h18"/><path d="M7 14v3M12 9v8M17 5v12"/></S>
export const IconUsers   = (p) => <S {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6M17 20a6.5 6.5 0 0 0-2-4.6"/></S>
export const IconSearch  = (p) => <S {...p}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></S>
export const IconPlus    = (p) => <S {...p}><path d="M12 5v14M5 12h14"/></S>
export const IconTrash   = (p) => <S {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></S>
export const IconEdit    = (p) => <S {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></S>
export const IconLogout  = (p) => <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></S>
export const IconClose   = (p) => <S {...p}><path d="M18 6 6 18M6 6l12 12"/></S>
export const IconWarn    = (p) => <S {...p}><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></S>
export const IconCheck   = (p) => <S {...p}><path d="M20 6 9 17l-5-5"/></S>
export const IconLock    = (p) => <S {...p}><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></S>
