import { Component } from 'react'
import { IconWarn } from './Icons'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Error capturado por ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
          <div className="card p-8 max-w-sm text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-red-50 text-red-500 grid place-items-center mb-4">
              <IconWarn size={26} />
            </div>
            <p className="font-bold text-lg text-ink">Algo salió mal</p>
            <p className="text-sm text-slate-500 mt-2">
              Esta pantalla tuvo un error inesperado. El resto del sistema sigue disponible.
            </p>
            <button className="btn-brand w-full mt-6" onClick={() => window.location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
