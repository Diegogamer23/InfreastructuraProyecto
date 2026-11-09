import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBudgets, saveBudget } from '../services/api.js'
import { useTransactions } from '../hooks/useTransactions.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const categories = [
  ['comida', 'Comida'],
  ['vivienda', 'Vivienda'],
  ['transporte', 'Transporte'],
  ['servicios', 'Servicios'],
  ['salud', 'Salud'],
  ['escuela', 'Escuela'],
  ['ropa', 'Ropa'],
  ['entretenimiento', 'Entretenimiento'],
  ['ahorro', 'Ahorro'],
  ['otros', 'Otros'],
]

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function amountOf(item) {
  const amount = Number(item.amount)
  return Number.isFinite(amount) ? amount : 0
}

function spentForCategory(transactions, month, category) {
  return transactions
    .filter((item) => item.date?.startsWith(month)
      && item.category?.toLowerCase() === category
      && item.type !== 'income'
      && item.status !== 'planned')
    .reduce((total, item) => total + amountOf(item), 0)
}

export default function BudgetsPage() {
  const { transactions, loading: transactionsLoading, error: transactionError } = useTransactions()
  const [month, setMonth] = useState(currentMonthValue)
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: 'comida', limitAmount: '' })

  useEffect(() => {
    let active = true
    listBudgets(month)
      .then((rows) => {
        if (active) {
          setBudgets(rows)
          setError('')
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'No se pudieron cargar los presupuestos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [month])

  const summaries = useMemo(() => budgets.map((budget) => {
    const limit = Number(budget.limitAmount) || 0
    const spent = spentForCategory(transactions, month, budget.category)
    return { ...budget, limit, spent, remaining: limit - spent, progress: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0 }
  }), [budgets, month, transactions])

  const totalBudget = summaries.reduce((total, item) => total + item.limit, 0)
  const totalAssignedSpent = summaries.reduce((total, item) => total + item.spent, 0)
  const categoriesWithoutBudget = useMemo(() => [...new Set(transactions
    .filter((item) => item.date?.startsWith(month) && item.type !== 'income' && item.status !== 'planned')
    .map((item) => item.category?.toLowerCase())
    .filter((category) => category && !budgets.some((budget) => budget.category === category)))], [transactions, month, budgets])

  const refreshBudgets = useCallback(async (selectedMonth = month) => {
    setLoading(true)
    setError('')
    try {
      setBudgets(await listBudgets(selectedMonth))
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar los presupuestos.')
    } finally {
      setLoading(false)
    }
  }, [month])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const limitAmount = Number(form.limitAmount)
    if (!Number.isFinite(limitAmount) || limitAmount <= 0) {
      setError('Escribe un límite mayor que cero.')
      return
    }
    setSaving(true)
    try {
      await saveBudget({ month, category: form.category, limitAmount: limitAmount.toFixed(2) })
      await refreshBudgets(month)
      setForm((current) => ({ ...current, limitAmount: '' }))
      setNotice('Límite guardado. El resumen compara este presupuesto con los gastos reales de la categoría.')
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar el presupuesto.')
    } finally {
      setSaving(false)
    }
  }

  function changeMonth(value) {
    setLoading(true)
    setMonth(value)
  }

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">PONLE INTENCIÓN A TU DINERO</span><h1>Presupuestos</h1><p>Define límites por categoría y compáralos con tus gastos reales.</p></div>
        <label className="month-picker"><span>Mes</span><input required type="month" value={month} onChange={(event) => changeMonth(event.target.value)} /></label>
      </section>

      {(error || transactionError) && <div className="alert alert-error" role="alert">{error || transactionError}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section className="metric-grid budget-metrics" aria-label="Resumen de presupuestos">
        <article className="metric-card metric-featured"><div className="metric-heading"><span>Límite asignado</span><span className="metric-icon icon-purple">◷</span></div><strong className="metric-value">{money.format(totalBudget)}</strong><span className="metric-footnote">Suma de tus límites para este mes</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Gastado en categorías con límite</span><span className="metric-icon icon-orange">↘</span></div><strong className="metric-value">{transactionsLoading ? '—' : money.format(totalAssignedSpent)}</strong><span className="metric-footnote">Solo gastos reales de este mes</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Disponible en esos límites</span><span className="metric-icon icon-green">✓</span></div><strong className="metric-value">{transactionsLoading ? '—' : money.format(totalBudget - totalAssignedSpent)}</strong><span className="metric-footnote">Puede ser negativo si rebasaste un límite</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Categorías planeadas</span><span className="metric-icon">▦</span></div><strong className="metric-value">{budgets.length}</strong><span className="metric-footnote">Con un límite para este mes</span></article>
      </section>

      <section className="budget-layout">
        <article className="panel budget-form-panel">
          <div className="panel-heading"><div><h2>Nuevo límite</h2><p>Un límite por categoría y mes; puedes actualizarlo cuando quieras.</p></div><span className="panel-spark">＋</span></div>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field"><span>Categoría</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>Límite mensual (MXN)</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0.01" step="0.01" type="number" value={form.limitAmount} onChange={(event) => setForm((current) => ({ ...current, limitAmount: event.target.value }))} placeholder="0.00" required /></div></label>
            <button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar límite'}</button>
          </form>
          <div className="budget-form-note"><span>✦</span><p>Al guardar otra vez la misma categoría y mes, se actualiza su límite en lugar de crear un duplicado.</p></div>
        </article>

        <article className="panel budgets-list-panel">
          <div className="panel-heading"><div><h2>Progreso por categoría</h2><p>El gasto se calcula con los movimientos reales que registraste.</p></div><button className="icon-button" type="button" onClick={() => refreshBudgets()} aria-label="Actualizar presupuestos">↻</button></div>
          {loading ? <p className="empty-state">Cargando presupuestos…</p> : summaries.length === 0 ? <div className="empty-state"><div className="empty-mark">◷</div><strong>Empieza con una categoría</strong><p>Establece un límite y los gastos asociados aparecerán aquí.</p></div> : <div className="budget-list">{summaries.map((item) => {
            const categoryLabel = categories.find(([value]) => value === item.category)?.[1] || item.category
            const overBudget = item.remaining < 0
            return <div className="budget-item" key={item.budgetKey}>
              <div className="budget-item-heading"><div><strong>{categoryLabel}</strong><span>{overBudget ? 'Límite rebasado' : `${money.format(item.remaining)} disponibles`}</span></div><strong className={overBudget ? 'over-budget' : ''}>{money.format(item.spent)} <small>/ {money.format(item.limit)}</small></strong></div>
              <div className="progress-track budget-track"><span className={`progress-fill ${overBudget ? 'budget-overfill' : 'budget-fill'}`} style={{ width: `${Math.max(item.spent > 0 ? 5 : 0, item.progress)}%` }} /></div>
              <span className="budget-percent">{Math.round(item.limit > 0 ? (item.spent / item.limit) * 100 : 0)}% del límite utilizado</span>
            </div>
          })}</div>}
          {categoriesWithoutBudget.length > 0 && !transactionsLoading && <div className="unbudgeted-note"><strong>Gastos sin límite</strong><span>{categoriesWithoutBudget.map((value) => categories.find(([key]) => key === value)?.[1] || value).join(', ')}</span></div>}
        </article>
      </section>
    </div>
  )
}
