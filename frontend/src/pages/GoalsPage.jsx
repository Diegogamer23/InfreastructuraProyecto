import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listGoals, saveGoal } from '../services/api.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const emptyForm = { name: '', targetAmount: '', currentAmount: '0', targetDate: '' }

function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export default function GoalsPage() {
  const [goals, setGoals] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [contributions, setContributions] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingGoalId, setSavingGoalId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setGoals(await listGoals())
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar tus metas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    listGoals()
      .then((rows) => { if (active) setGoals(rows) })
      .catch((requestError) => { if (active) setError(requestError.message || 'No se pudieron cargar tus metas.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const totals = useMemo(() => goals.reduce((summary, goal) => ({
    target: summary.target + amount(goal.targetAmount),
    current: summary.current + amount(goal.currentAmount),
  }), { target: 0, current: 0 }), [goals])

  async function handleCreate(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const targetAmount = amount(form.targetAmount)
    const currentAmount = amount(form.currentAmount)
    if (!form.name.trim() || targetAmount <= 0 || currentAmount < 0) {
      setError('Escribe un nombre y una meta mayor que cero. El ahorro inicial no puede ser negativo.')
      return
    }
    setSaving(true)
    try {
      await saveGoal({ ...form, name: form.name.trim(), targetAmount: targetAmount.toFixed(2), currentAmount: currentAmount.toFixed(2) })
      await refresh()
      setForm(emptyForm)
      setNotice('Meta guardada en tu cuenta.')
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar la meta.')
    } finally {
      setSaving(false)
    }
  }

  async function handleContribution(goal) {
    const contribution = amount(contributions[goal.goalId])
    if (contribution <= 0) {
      setError('Escribe un ahorro mayor que cero.')
      return
    }
    setError('')
    setNotice('')
    setSavingGoalId(goal.goalId)
    try {
      await saveGoal({
        goalId: goal.goalId,
        name: goal.name,
        targetAmount: amount(goal.targetAmount).toFixed(2),
        currentAmount: (amount(goal.currentAmount) + contribution).toFixed(2),
        targetDate: goal.targetDate || '',
      })
      await refresh()
      setContributions((current) => ({ ...current, [goal.goalId]: '' }))
      setNotice(`Ahorro agregado a “${goal.name}”.`)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo actualizar el ahorro.')
    } finally {
      setSavingGoalId('')
    }
  }

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">AVANZA A TU RITMO</span><h1>Metas de ahorro</h1><p>Define un objetivo y registra cuánto has apartado.</p></div>
        <span className="count-pill">{loading ? 'Cargando…' : `${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}`}</span>
      </section>

      {(error || notice) && <div className={`alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}

      <section className="metric-grid goal-metrics" aria-label="Resumen de metas">
        <article className="metric-card metric-featured"><div className="metric-heading"><span>Ahorro registrado en metas</span><span className="metric-icon icon-green">＋</span></div><strong className="metric-value">{money.format(totals.current)}</strong><span className="metric-footnote">Cantidad que registraste como apartada</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Objetivo total</span><span className="metric-icon icon-purple">✦</span></div><strong className="metric-value">{money.format(totals.target)}</strong><span className="metric-footnote">Suma de los objetivos registrados</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Progreso general</span><span className="metric-icon">◷</span></div><strong className="metric-value">{totals.target ? `${Math.min(100, Math.round((totals.current / totals.target) * 100))}%` : '0%'}</strong><span className="metric-footnote">El progreso usa los montos que registras</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Objetivos completados</span><span className="metric-icon icon-green">✓</span></div><strong className="metric-value">{goals.filter((goal) => amount(goal.currentAmount) >= amount(goal.targetAmount)).length}</strong><span className="metric-footnote">Metas cuyo ahorro iguala o supera el objetivo</span></article>
      </section>

      <section className="goal-layout">
        <article className="panel goal-form-panel">
          <div className="panel-heading"><div><h2>Nueva meta</h2><p>Por ejemplo: fondo de emergencia o viaje.</p></div><span className="panel-spark">✦</span></div>
          <form className="form-stack" onSubmit={handleCreate}>
            <label className="field"><span>Nombre de la meta</span><input maxLength="80" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Fondo de emergencia" required /></label>
            <label className="field"><span>Monto objetivo (MXN)</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0.01" step="0.01" type="number" value={form.targetAmount} onChange={(event) => setForm((current) => ({ ...current, targetAmount: event.target.value }))} placeholder="0.00" required /></div></label>
            <label className="field"><span>Ahorro inicial (MXN)</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0" step="0.01" type="number" value={form.currentAmount} onChange={(event) => setForm((current) => ({ ...current, currentAmount: event.target.value }))} /></div></label>
            <label className="field"><span>Fecha objetivo (opcional)</span><input type="date" value={form.targetDate} onChange={(event) => setForm((current) => ({ ...current, targetDate: event.target.value }))} /></label>
            <button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar meta'}</button>
          </form>
          <div className="budget-form-note"><span>i</span><p>Es un registro manual para organizarte; no mueve dinero ni se conecta a una cuenta bancaria.</p></div>
        </article>

        <article className="panel goals-list-panel">
          <div className="panel-heading"><div><h2>Tus metas</h2><p>Registra cada aportación para actualizar el avance.</p></div><button className="icon-button" type="button" onClick={refresh} aria-label="Actualizar metas">↻</button></div>
          {loading ? <div className="empty-state"><strong>Cargando metas…</strong></div> : goals.length === 0 ? <div className="empty-state"><div className="empty-mark">✦</div><strong>Aún no hay metas</strong><p>Crea un objetivo para darle seguimiento a tu ahorro.</p></div> : <div className="goal-list">{goals.map((goal) => {
            const target = amount(goal.targetAmount)
            const current = amount(goal.currentAmount)
            const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0
            const complete = current >= target
            return <div className="goal-card" key={goal.goalId}>
              <div className="goal-card-heading"><div><strong>{goal.name}</strong><span>{goal.targetDate ? `Fecha objetivo: ${goal.targetDate}` : 'Sin fecha objetivo'}</span></div><span className="goal-percent">{Math.round(progress)}%</span></div>
              <div className="progress-track"><span className={`progress-fill ${complete ? 'goal-complete' : 'budget-fill'}`} style={{ width: `${Math.max(current > 0 ? 4 : 0, progress)}%` }} /></div>
              <div className="goal-amounts"><span>{money.format(current)} ahorrados</span><strong>de {money.format(target)}</strong></div>
              {!complete && <form className="goal-contribution" onSubmit={(event) => { event.preventDefault(); handleContribution(goal) }}>
                <label className="field"><span>Agregar ahorro (MXN)</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0.01" step="0.01" type="number" value={contributions[goal.goalId] || ''} onChange={(event) => setContributions((currentValues) => ({ ...currentValues, [goal.goalId]: event.target.value }))} placeholder="0.00" required /></div></label>
                <button className="button button-secondary" type="submit" disabled={savingGoalId === goal.goalId}>{savingGoalId === goal.goalId ? 'Guardando…' : 'Registrar ahorro'}</button>
              </form>}
              {complete && <p className="goal-success">¡Meta alcanzada! Puedes seguir registrando tu ahorro.</p>}
            </div>
          })}</div>}
          <div className="goal-report-link"><Link className="text-link" to="/app/reports">Ver reporte mensual →</Link></div>
        </article>
      </section>
    </div>
  )
}
