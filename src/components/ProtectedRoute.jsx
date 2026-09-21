import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { Spinner } from './UI'

export default function ProtectedRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { session, profile, loading } = useAuth()
  const business = useBusiness()
  const location = useLocation()

  if (loading) {
    return <div className="min-h-screen grid place-items-center"><Spinner /></div>
  }
  if (!session) return <Navigate to="/login" replace />

  // cuenta desactivada
  if (profile && profile.active === false) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="card p-8 max-w-sm">
          <p className="font-bold text-lg text-ink">Cuenta desactivada</p>
          <p className="text-sm text-slate-500 mt-2">
            Tu acceso fue suspendido. Contacta al administrador de tu negocio.
          </p>
        </div>
      </div>
    )
  }

  const role = profile?.role

  // un super admin no opera dentro de un negocio: siempre cae en /negocios
  if (role === 'super_admin' && !location.pathname.startsWith('/negocios')) {
    return <Navigate to="/negocios" replace />
  }
  if (superAdminOnly && role !== 'super_admin') {
    return <Navigate to="/venta" replace />
  }
  if (adminOnly && role !== 'admin') {
    return <Navigate to="/venta" replace />
  }

  // negocio desactivado por el super admin (ej. dejó de pagar el servicio)
  if (role !== 'super_admin' && !business.loading && business.active === false) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div className="card p-8 max-w-sm">
          <p className="font-bold text-lg text-ink">Negocio desactivado</p>
          <p className="text-sm text-slate-500 mt-2">
            El acceso de este negocio fue suspendido. Contacta al administrador de la plataforma.
          </p>
        </div>
      </div>
    )
  }

  return children
}
