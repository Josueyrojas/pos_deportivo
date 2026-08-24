import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { ToastProvider } from './components/UI'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import POS from './pages/POS'
import Sales from './pages/Sales'
import CashRegister from './pages/CashRegister'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ErrorBoundary>
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/venta" element={<POS />} />
                <Route path="/ventas" element={<Sales />} />
                <Route path="/corte" element={<CashRegister />} />
                <Route path="/inventario" element={<ProtectedRoute adminOnly><Inventory /></ProtectedRoute>} />
                <Route path="/reportes" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
                <Route path="/usuarios" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
                <Route path="/configuracion" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/venta" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </SettingsProvider>
    </ErrorBoundary>
  )
}
