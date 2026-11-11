import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import LoadingScreen from './LoadingScreen.jsx'

export default function AuthLayout() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/app/dashboard" replace />

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-lockup inverse-brand">
          <div className="brand-mark">F</div>
          <span>Finanzas <strong>Claras</strong></span>
        </div>

        <div className="story-copy">
          <span className="eyebrow light">TU SALUD FINANCIERA, PASO A PASO</span>
          <h1>Decide con calma. Avanza con claridad.</h1>
          <p>
            Organiza tus ingresos, gastos y planes desde un solo lugar. Empieza
            con lo que tienes hoy y construye mejores hábitos mes a mes.
          </p>
          <div className="story-preview">
            <div className="preview-top">
              <span>Resumen de ejemplo</span><span className="preview-dot" />
            </div>
            <div className="preview-balance">
              <span>Saldo calculado</span><strong>$18,450.00</strong>
            </div>
            <div className="preview-bars" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            </div>
            <div className="preview-foot">
              <span><b className="dot mint" /> Ingresos</span>
              <span><b className="dot peach" /> Gastos</span>
            </div>
          </div>
        </div>
        <p className="story-footer">Una herramienta sencilla para tus decisiones de cada día.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-brand brand-lockup">
            <div className="brand-mark">F</div>
            <span>Finanzas <strong>Claras</strong></span>
          </div>
          <Outlet />
        </div>
      </section>
    </main>
  )
}
