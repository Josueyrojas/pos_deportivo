import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './UI'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { session, profile, loading } = useAuth()

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
            Tu acceso fue suspendido. Contacta al administrador de la tienda.
          </p>
        </div>
      </div>
    )
  }

  if (adminOnly && profile?.role !== 'admin') {
    return <Navigate to="/venta" replace />
  }
  return children
}
