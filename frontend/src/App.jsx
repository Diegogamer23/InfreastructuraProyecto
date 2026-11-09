import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth.js'
import AppLayout from './components/AppLayout.jsx'
import AuthLayout from './components/AuthLayout.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import BudgetsPage from './pages/BudgetsPage.jsx'
import CardsPage from './pages/CardsPage.jsx'
import ConfirmPage from './pages/ConfirmPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MovementsPage from './pages/MovementsPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  return <Navigate to={user ? '/app/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="cards" element={<CardsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
