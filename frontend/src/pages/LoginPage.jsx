import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await login(email.trim(), password)
      if (result.isSignedIn) {
        navigate(location.state?.from || '/app/dashboard', { replace: true })
      } else {
        setError('La cuenta requiere un paso adicional. Revisa el estado de verificación de Cognito.')
      }
    } catch (authError) {
      setError(authError.message || 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-card">
      <span className="eyebrow">BIENVENIDO DE VUELTA</span>
      <h1>Tu dinero, con más claridad.</h1>
      <p className="auth-intro">Inicia sesión para revisar tus movimientos y cuidar tus metas.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Correo electrónico</span>
          <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tu contraseña" required />
        </label>
        <button className="button button-primary button-full" disabled={busy} type="submit">
          {busy ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
      <p className="auth-switch">¿Aún no tienes cuenta? <Link to="/register">Crear cuenta</Link></p>
      <p className="auth-security"><span aria-hidden="true">●</span> Acceso protegido con Amazon Cognito</p>
    </section>
  )
}
