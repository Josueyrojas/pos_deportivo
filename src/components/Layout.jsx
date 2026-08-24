import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import ErrorBoundary from './ErrorBoundary'
import {
  IconCart, IconBox, IconReceipt, IconCash, IconChart, IconUsers, IconLogout, IconSettings,
} from './Icons'

const NAV = [
  { to: '/venta',       label: 'Punto de venta', icon: IconCart,     roles: ['admin', 'cajero'] },
  { to: '/ventas',      label: 'Ventas',         icon: IconReceipt,  roles: ['admin', 'cajero'] },
  { to: '/corte',       label: 'Corte de caja',  icon: IconCash,     roles: ['admin', 'cajero'] },
  { to: '/inventario',  label: 'Inventario',     icon: IconBox,      roles: ['admin'] },
  { to: '/reportes',    label: 'Reportes',       icon: IconChart,    roles: ['admin'] },
  { to: '/usuarios',    label: 'Usuarios',       icon: IconUsers,    roles: ['admin'] },
  { to: '/configuracion', label: 'Configuración', icon: IconSettings, roles: ['admin'] },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const settings = useSettings()
  const nav = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const role = profile?.role ?? 'cajero'
  const items = NAV.filter((i) => i.roles.includes(role))

  async function handleLogout() {
    await signOut()
    nav('/login')
  }

  const SideContent = (
    <>
      <div className="px-5 py-6">
        <div className="flex items-center gap-2.5">
          {settings.logo_url
            ? <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
            : <div className="h-9 w-9 rounded-xl bg-brand grid place-items-center font-display font-extrabold text-white text-lg">
                {(settings.name || 'D').trim().charAt(0).toUpperCase()}
              </div>}
          <div className="leading-tight">
            <p className="font-display font-bold text-white tracking-tight">{settings.name}</p>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Punto de venta</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-slate-300 hover:bg-ink2 hover:text-white'
              }`
            }>
            <Icon size={19} /> {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-9 w-9 rounded-full bg-ink2 grid place-items-center text-white text-sm font-bold">
            {(profile?.full_name || '?').trim().charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {profile?.full_name || 'Usuario'}
            </p>
            <p className="text-[11px] text-slate-400 capitalize">{role}</p>
          </div>
          <button onClick={handleLogout} title="Cerrar sesión"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-ink2">
            <IconLogout size={18} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-ink sticky top-0 h-screen">
        {SideContent}
      </aside>

      {/* Sidebar móvil */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
          <aside className="relative w-64 flex flex-col bg-ink h-full">{SideContent}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar móvil */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-ink px-4 py-3">
          <button onClick={() => setOpen(true)} className="text-white p-1">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-display font-bold text-white">{settings.name}</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
