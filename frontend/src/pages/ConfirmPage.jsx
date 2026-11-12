import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'

export default function ConfirmPage() {
  const [searchParams] = useSearchParams()
  const { confirmRegistration, resendRegistrationCode } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      await confirmRegistration(email.trim(), code.trim())
      setSuccess(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (authError) {
      if (authError.name === 'CodeMismatchException' || /invalid verification code/i.test(authError.message || '')) {
        setError('El código no coincide. Reenvía uno nuevo y captura el más reciente.')
      } else if (authError.name === 'ExpiredCodeException') {
        setError('El código venció. Reenvía uno nuevo para confirmar tu cuenta.')
      } else {
        setError('No se pudo confirmar la cuenta. Revisa el correo e intenta de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleResend() {
    setError('')
    setNotice('')
    setResending(true)
    try {
      await resendRegistrationCode(email.trim())
      setCode('')
      setNotice('Solicitamos un nuevo código. Revisa tu correo y usa ese código, no uno anterior.')
    } catch (authError) {
      if (authError.name === 'LimitExceededException') {
        setError('Se solicitaron demasiados códigos en poco tiempo. Espera un momento antes de intentarlo otra vez.')
      } else {
        setError('No pudimos reenviar el código. Confirma el correo e intenta de nuevo más tarde.')
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <section className="auth-card">
      <span className="eyebrow">VERIFICA TU CORREO</span>
      <h1>Un código y listo.</h1>
      <p className="auth-intro">Escribe el código de confirmación que Cognito envió a tu correo.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      {success && <div className="alert alert-success" role="status">Cuenta confirmada. Te llevamos al inicio de sesión…</div>}
      <form className="form-stack" onSubmit={handleSubmit}>
        <label className="field">
          <span>Correo electrónico</span>
          <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          <span>Código de confirmación</span>
          <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="Código de 6 dígitos" required />
        </label>
        <button className="button button-primary button-full" disabled={busy || success} type="submit">
          {busy ? 'Confirmando…' : 'Confirmar cuenta'}
        </button>
      </form>
      <p className="auth-switch">
        ¿No recibiste el correo?{' '}
        <button className="text-button" disabled={resending || busy || success} onClick={handleResend} type="button">
          {resending ? 'Enviando…' : 'Reenviar código'}
        </button>
      </p>
      <p className="auth-switch"><Link to="/register">Volver al registro</Link></p>
    </section>
  )
}
