import { useCallback, useEffect, useMemo, useState } from 'react'
import { listCards, saveCard } from '../services/api.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const initialForm = {
  name: '',
  issuer: '',
  creditLimit: '',
  currentBalance: '0',
  cutoffDay: '',
  paymentDueDay: '',
}

function amountOf(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function nextPayment(card) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const day = Number(card.paymentDueDay)
  let year = today.getFullYear()
  let month = today.getMonth()
  let lastDay = new Date(year, month + 1, 0).getDate()
  let dueDate = new Date(year, month, Math.min(day, lastDay))

  if (dueDate < today) {
    month += 1
    lastDay = new Date(year, month + 1, 0).getDate()
    dueDate = new Date(year, month, Math.min(day, lastDay))
  }

  const days = Math.round((dueDate - today) / 86_400_000)
  const label = dueDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  const relative = days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`
  return { days, label, relative }
}

export default function CardsPage() {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editingCardId, setEditingCardId] = useState('')
  const [form, setForm] = useState(initialForm)

  const refreshCards = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    setError('')
    try {
      setCards(await listCards())
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar tus tarjetas.')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    listCards()
      .then((rows) => {
        if (active) setCards(rows)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'No se pudieron cargar tus tarjetas.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const cardsWithDates = useMemo(() => cards
    .map((card) => ({ ...card, payment: nextPayment(card) }))
    .sort((first, second) => first.payment.days - second.payment.days), [cards])

  const totalLimit = cards.reduce((total, card) => total + amountOf(card.creditLimit), 0)
  const totalBalance = cards.reduce((total, card) => total + amountOf(card.currentBalance), 0)
  const nextDue = cardsWithDates[0]

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function resetForm() {
    setForm(initialForm)
    setEditingCardId('')
  }

  function startEditing(card) {
    setEditingCardId(card.cardId)
    setForm({
      name: card.name || '',
      issuer: card.issuer || '',
      creditLimit: String(card.creditLimit ?? ''),
      currentBalance: String(card.currentBalance ?? '0'),
      cutoffDay: String(card.cutoffDay ?? ''),
      paymentDueDay: String(card.paymentDueDay ?? ''),
    })
    setNotice('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    const creditLimit = Number(form.creditLimit)
    const currentBalance = Number(form.currentBalance)
    const cutoffDay = Number(form.cutoffDay)
    const paymentDueDay = Number(form.paymentDueDay)

    if (!Number.isFinite(creditLimit) || creditLimit <= 0) {
      setError('El límite de crédito debe ser mayor que cero.')
      return
    }
    if (!Number.isFinite(currentBalance) || currentBalance < 0) {
      setError('El saldo utilizado no puede ser negativo.')
      return
    }
    if (![cutoffDay, paymentDueDay].every((day) => Number.isInteger(day) && day >= 1 && day <= 31)) {
      setError('Las fechas de corte y pago deben ser días del mes entre 1 y 31.')
      return
    }

    setSaving(true)
    try {
      await saveCard({
        ...(editingCardId ? { cardId: editingCardId } : {}),
        name: form.name.trim(),
        issuer: form.issuer.trim(),
        creditLimit: creditLimit.toFixed(2),
        currentBalance: currentBalance.toFixed(2),
        cutoffDay,
        paymentDueDay,
      })
      await refreshCards(false)
      resetForm()
      setNotice(editingCardId ? 'Tarjeta actualizada.' : 'Tarjeta guardada.')
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar la tarjeta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">FECHAS Y PAGOS</span>
          <h1>Tarjetas</h1>
          <p>Ten presentes tus límites, saldos y fechas importantes.</p>
        </div>
        <span className="count-pill">{cards.length} {cards.length === 1 ? 'tarjeta' : 'tarjetas'}</span>
      </section>

      {(error || notice) && <div className={`alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

      <section className="metric-grid cards-metrics" aria-label="Resumen de tarjetas">
        <article className="metric-card metric-featured">
          <div className="metric-heading"><span>Límite total</span><span className="metric-icon icon-purple">▤</span></div>
          <strong className="metric-value">{money.format(totalLimit)}</strong>
          <span className="metric-footnote">Suma de los límites registrados</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Saldo utilizado</span><span className="metric-icon icon-orange">↗</span></div>
          <strong className="metric-value">{money.format(totalBalance)}</strong>
          <span className="metric-footnote">Actualiza el saldo después de cada pago</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Crédito disponible</span><span className="metric-icon icon-green">✓</span></div>
          <strong className="metric-value">{money.format(totalLimit - totalBalance)}</strong>
          <span className="metric-footnote">Límite total menos saldo utilizado</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Próxima fecha límite</span><span className="metric-icon">◷</span></div>
          <strong className="metric-value">{nextDue ? nextDue.payment.label : '—'}</strong>
          <span className="metric-footnote">{nextDue ? nextDue.payment.relative : 'Registra una tarjeta para verla'}</span>
        </article>
      </section>

      <section className="cards-layout">
        <article className="panel card-form-panel">
          <div className="panel-heading">
            <div><h2>{editingCardId ? 'Editar tarjeta' : 'Registrar tarjeta'}</h2><p>Captura los datos manualmente.</p></div>
            <span className="panel-spark">＋</span>
          </div>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field"><span>Nombre para identificarla</span><input autoComplete="off" maxLength="80" name="name" onChange={updateField} placeholder="Ej. Tarjeta principal" required value={form.name} /></label>
            <label className="field"><span>Banco o emisor</span><input autoComplete="off" maxLength="60" name="issuer" onChange={updateField} placeholder="Ej. Banco" required value={form.issuer} /></label>
            <div className="form-two-columns">
              <label className="field"><span>Límite de crédito</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0.01" name="creditLimit" onChange={updateField} placeholder="0.00" required step="0.01" type="number" value={form.creditLimit} /></div></label>
              <label className="field"><span>Saldo utilizado</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0" name="currentBalance" onChange={updateField} required step="0.01" type="number" value={form.currentBalance} /></div></label>
            </div>
            <div className="form-two-columns">
              <label className="field"><span>Día de corte</span><input inputMode="numeric" max="31" min="1" name="cutoffDay" onChange={updateField} placeholder="1–31" required type="number" value={form.cutoffDay} /></label>
              <label className="field"><span>Día límite de pago</span><input inputMode="numeric" max="31" min="1" name="paymentDueDay" onChange={updateField} placeholder="1–31" required type="number" value={form.paymentDueDay} /></label>
            </div>
            <button className="button button-primary button-full" disabled={saving} type="submit">{saving ? 'Guardando…' : editingCardId ? 'Guardar cambios' : 'Guardar tarjeta'}</button>
            {editingCardId && <button className="button button-secondary button-full" onClick={resetForm} type="button">Cancelar edición</button>}
          </form>
          <div className="budget-form-note"><span>i</span><p>Son datos manuales para organizarte. La app no se conecta con bancos ni guarda números de tarjeta o CVV. Los recordatorios se muestran dentro de Avisos; no se envían correos, SMS ni notificaciones push.</p></div>
        </article>

        <article className="panel cards-list-panel">
          <div className="panel-heading">
            <div><h2>Tus tarjetas</h2><p>Selecciona una para actualizar su saldo o sus fechas.</p></div>
            <button aria-label="Actualizar tarjetas" className="icon-button" onClick={() => refreshCards()} type="button">↻</button>
          </div>
          {loading ? <p className="empty-state">Cargando tarjetas…</p> : cardsWithDates.length === 0 ? (
            <div className="empty-state"><div className="empty-mark">▤</div><strong>Aún no registras tarjetas</strong><p>Agrega una tarjeta para consultar su saldo utilizado y la próxima fecha límite de pago.</p></div>
          ) : (
            <div className="cards-grid">
              {cardsWithDates.map((card, index) => {
                const limit = amountOf(card.creditLimit)
                const balance = amountOf(card.currentBalance)
                const available = limit - balance
                const utilization = limit > 0 ? (balance / limit) * 100 : 0
                const overLimit = utilization > 100
                return (
                  <article className={`credit-card${index % 2 ? ' credit-card-alt' : ''}`} key={card.cardId}>
                    <div className="credit-card-top"><span className="credit-card-brand">{card.issuer}</span><span className="credit-card-chip" aria-hidden="true">▦</span></div>
                    <h3>{card.name}</h3>
                    <div className="credit-card-balance"><span>Saldo utilizado</span><strong>{money.format(balance)}</strong></div>
                    <div className="progress-track card-progress"><span className={`progress-fill card-progress-fill${overLimit ? ' card-progress-over' : ''}`} style={{ width: `${Math.min(100, Math.max(balance > 0 ? 4 : 0, utilization))}%` }} /></div>
                    <div className="credit-card-meta"><span>Disponible<strong className={available < 0 ? 'card-negative' : ''}>{money.format(available)}</strong></span><span>Límite<strong>{money.format(limit)}</strong></span></div>
                    <div className="credit-card-dates"><span>Corte día {card.cutoffDay}</span><strong>{card.payment.relative} · {card.payment.label}</strong></div>
                    {overLimit && <p className="card-warning">El saldo supera el límite registrado.</p>}
                    <button className="card-edit-button" onClick={() => startEditing(card)} type="button">Editar datos</button>
                  </article>
                )
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
