import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

const navigation = [
  { to: '/app/dashboard', label: 'Resumen', icon: '⌂' },
  { to: '/app/movements', label: 'Movimientos', icon: '↕' },
  { to: '/app/budgets', label: 'Presupuestos', icon: '◷' },
  { to: '/app/cards', label: 'Tarjetas', icon: '▤' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const email = user?.signInDetails?.loginId || user?.username || 'Mi cuenta'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <div className="brand-mark">F</div>
          <span>Finanzas <strong>Claras</strong></span>
        </div>
        <p className="nav-label">TU ESPACIO</p>
        <nav className="side-navigation" aria-label="Secciones de la aplicación">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="note-icon">✦</span>
          <strong>Un paso a la vez</strong>
          <p>Registrar tus decisiones ayuda a ver hacia dónde va tu dinero.</p>
        </div>

        <div className="sidebar-user">
          <div className="avatar">{email.slice(0, 1).toUpperCase()}</div>
          <div className="user-copy"><strong>Mi cuenta</strong><span>{email}</span></div>
          <button
            className="logout-button"
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            ↪
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="app-topbar">
          <div className="mobile-brand brand-lockup">
            <div className="brand-mark">F</div>
            <span>Finanzas <strong>Claras</strong></span>
          </div>
          <span className="eyebrow">TU ESPACIO FINANCIERO</span>
          <button className="mobile-logout" type="button" onClick={handleLogout}>Salir</button>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
