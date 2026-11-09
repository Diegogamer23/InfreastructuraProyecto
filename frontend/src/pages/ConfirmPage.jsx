import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export default function ConfirmPage() {
  const [searchParams] = useSearchParams()
  const { confirmRegistration } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await confirmRegistration(email.trim(), code.trim())
      setSuccess(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (authError) {
      setError(authError.message || 'No se pudo confirmar la cuenta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-card">
      <span className="eyebrow">VERIFICA TU CORREO</span>
      <h1>Un código y listo.</h1>
      <p className="auth-intro">Escribe el código de confirmación que Cognito envió a tu correo.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {success && <div className="alert alert-success" role="status">Cuenta confirmada. Te llevamos al inicio de sesión…</div>}
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Correo electrónico</span>
          <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Código de confirmación</span>
          <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código recibido" required />
        </label>
        <button className="button button-primary button-full" disabled={busy || success} type="submit">
          {busy ? 'Confirmando…' : 'Confirmar cuenta'}
        </button>
      </form>
      <p className="auth-switch"><Link to="/register">Volver al registro</Link></p>
    </section>
  )
}
