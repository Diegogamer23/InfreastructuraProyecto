import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await register(email.trim(), password)
      navigate(`/confirm?email=${encodeURIComponent(email.trim())}`, { replace: true })
    } catch (authError) {
      setError(authError.message || 'No se pudo crear la cuenta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-card">
      <span className="eyebrow">EMPIEZA CON UN PLAN</span>
      <h1>Crea tu espacio financiero.</h1>
      <p className="auth-intro">Usa un correo válido. Cognito enviará un código para confirmar tu cuenta.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Correo electrónico</span>
          <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" required />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input autoComplete="new-password" minLength="8" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres" required />
          <small>Incluye mayúscula, minúscula y número.</small>
        </label>
        <button className="button button-primary button-full" disabled={busy} type="submit">
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="auth-switch">¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link></p>
    </section>
  )
}
