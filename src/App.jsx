import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/UI'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Sales from './pages/Sales'
import CashRegister from './pages/CashRegister'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Users from './pages/Users'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/venta" element={<POS />} />
              <Route path="/ventas" element={<Sales />} />
              <Route path="/corte" element={<CashRegister />} />
              <Route path="/inventario" element={<ProtectedRoute adminOnly><Inventory /></ProtectedRoute>} />
              <Route path="/reportes" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />
              <Route path="/usuarios" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/venta" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
