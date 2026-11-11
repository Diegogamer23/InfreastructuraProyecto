import { useEffect, useMemo, useState } from 'react'
import { getMonthlyReport } from '../services/api.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function amount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function monthLabel(value) {
  if (!value) return ''
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonthValue)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getMonthlyReport(month)
      .then((result) => { if (active) { setReport(result); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message || 'No se pudo generar el reporte.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month])

  const largestCategory = useMemo(() => Math.max(1, ...(report?.categories || []).map((item) => amount(item.amount))), [report])

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">MIRA EL MES CON CLARIDAD</span><h1>Reporte mensual</h1><p>Ingresos, gastos, planes y límites de {monthLabel(month)}.</p></div>
        <label className="month-picker"><span>Mes</span><input type="month" value={month} onChange={(event) => { setReport(null); setLoading(true); setMonth(event.target.value) }} /></label>
      </section>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="report-source-note" role="note"><span>i</span><p>Este reporte se calcula en Lambda con tus movimientos y presupuestos guardados. Solo incluye datos registrados en la app.</p></div>

      <section className="metric-grid report-metrics" aria-label="Totales del mes">
        <article className="metric-card metric-featured"><div className="metric-heading"><span>Ingresos reales</span><span className="metric-icon icon-green">＋</span></div><strong className="metric-value">{loading ? '—' : money.format(amount(report?.income))}</strong><span className="metric-footnote">Entradas marcadas como actuales</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Gastos reales</span><span className="metric-icon icon-orange">↘</span></div><strong className="metric-value">{loading ? '—' : money.format(amount(report?.expenses))}</strong><span className="metric-footnote">Gastos que registraste este mes</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Balance del mes</span><span className="metric-icon icon-purple">↗</span></div><strong className="metric-value">{loading ? '—' : money.format(amount(report?.net))}</strong><span className="metric-footnote">Ingresos menos gastos reales</span></article>
        <article className="metric-card"><div className="metric-heading"><span>Gastos previstos</span><span className="metric-icon">◷</span></div><strong className="metric-value">{loading ? '—' : money.format(amount(report?.plannedExpenses))}</strong><span className="metric-footnote">No se restan del balance real</span></article>
      </section>

      <section className="report-grid">
        <article className="panel report-category-panel">
          <div className="panel-heading"><div><h2>Gastos por categoría</h2><p>{report?.transactionCount || 0} movimiento(s) del mes consultado</p></div><span className="panel-spark">▥</span></div>
          {loading ? <div className="empty-state">Calculando el reporte…</div> : !report?.categories?.length ? <div className="empty-state"><strong>Sin gastos registrados este mes</strong><p>Registra movimientos para ver el desglose.</p></div> : <div className="category-list">{report.categories.map((item, index) => <div className="category-item" key={item.category}>
            <div className="category-label"><span><i className={`category-dot dot-${index % 4}`} />{item.category}</span><strong>{money.format(amount(item.amount))}</strong></div>
            <div className="progress-track"><span className={`progress-fill fill-${index % 4}`} style={{ width: `${Math.max(5, amount(item.amount) / largestCategory * 100)}%` }} /></div>
          </div>)}</div>}
        </article>

        <article className="panel report-insights-panel">
          <div className="panel-heading"><div><h2>Observaciones</h2><p>Sugerencias sencillas a partir de lo registrado.</p></div><span className="panel-spark">✦</span></div>
          {loading ? <div className="empty-state">Revisando tus datos…</div> : <ul className="insight-list">{(report?.insights || []).map((insight, index) => <li key={`${index}-${insight}`}><span aria-hidden="true">✦</span><p>{insight}</p></li>)}</ul>}
          <p className="report-footnote">Son observaciones informativas; tú decides qué cambios se ajustan a tus prioridades.</p>
        </article>
      </section>

      <section className="panel report-budget-panel">
        <div className="panel-heading"><div><h2>Presupuesto frente al gasto</h2><p>Límites que definiste para el mes seleccionado.</p></div></div>
        {loading ? <div className="empty-state">Cargando presupuestos…</div> : !report?.budgets?.length ? <div className="empty-state"><strong>No hay límites para este mes</strong><p>Puedes establecerlos desde Presupuestos.</p></div> : <div className="report-budget-list">{report.budgets.map((budget) => {
          const percent = Math.max(0, amount(budget.percentUsed))
          const over = amount(budget.spent) > amount(budget.limitAmount)
          return <div className="report-budget-row" key={budget.category}>
            <div className="budget-item-heading"><div><strong>{budget.category}</strong><span>{over ? 'Límite rebasado' : `${money.format(amount(budget.remaining))} disponibles`}</span></div><strong className={over ? 'over-budget' : ''}>{money.format(amount(budget.spent))} <small>/ {money.format(amount(budget.limitAmount))}</small></strong></div>
            <div className="progress-track budget-track"><span className={`progress-fill ${over ? 'budget-overfill' : 'budget-fill'}`} style={{ width: `${Math.min(100, Math.max(percent > 0 ? 4 : 0, percent))}%` }} /></div>
          </div>
        })}</div>}
      </section>

      <section className="panel report-goals-panel">
        <div className="panel-heading"><div><h2>Metas de ahorro</h2><p>Progreso registrado en tus objetivos.</p></div></div>
        {loading ? <div className="empty-state">Cargando metas…</div> : !report?.goals?.length ? <div className="empty-state"><strong>Aún no tienes metas</strong><p>Registra un objetivo para incluirlo en tu panorama financiero.</p></div> : <div className="goal-list">{report.goals.map((goal) => {
          const target = amount(goal.targetAmount)
          const current = amount(goal.currentAmount)
          const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0
          return <div className="goal-card" key={goal.goalId}>
            <div className="goal-card-heading"><div><strong>{goal.name}</strong><span>{goal.targetDate ? `Objetivo: ${goal.targetDate}` : 'Sin fecha objetivo'}</span></div><span className="goal-percent">{Math.round(progress)}%</span></div>
            <div className="progress-track"><span className="progress-fill goal-complete" style={{ width: `${Math.max(current > 0 ? 4 : 0, progress)}%` }} /></div>
            <div className="goal-amounts"><span>{money.format(current)} ahorrados</span><strong>de {money.format(target)}</strong></div>
          </div>
        })}</div>}
      </section>
    </div>
  )
}
