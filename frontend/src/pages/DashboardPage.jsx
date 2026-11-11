import { Link } from 'react-router-dom'
import { useTransactions } from '../hooks/useTransactions.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const today = new Date()
const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

function amountOf(transaction) {
  const value = Number(transaction.amount)
  return Number.isFinite(value) ? value : 0
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(parsed)
}

export default function DashboardPage() {
  const { transactions, loading, error, refresh } = useTransactions()
  const actual = transactions.filter((item) => item.status !== 'planned')
  const monthRows = transactions.filter((item) => item.date?.slice(0, 7) === currentMonth)
  const incomeMonth = monthRows.filter((item) => item.status !== 'planned' && item.type === 'income').reduce((sum, item) => sum + amountOf(item), 0)
  const expensesMonth = monthRows.filter((item) => item.status !== 'planned' && item.type !== 'income').reduce((sum, item) => sum + amountOf(item), 0)
  const plannedMonth = monthRows.filter((item) => item.status === 'planned' && item.type !== 'income').reduce((sum, item) => sum + amountOf(item), 0)
  const balance = actual.reduce((sum, item) => sum + (item.type === 'income' ? amountOf(item) : -amountOf(item)), 0)
  const recent = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5)
  const expenseCategories = monthRows.filter((item) => item.status !== 'planned' && item.type !== 'income').reduce((groups, item) => {
    groups[item.category || 'Otros'] = (groups[item.category || 'Otros'] || 0) + amountOf(item)
    return groups
  }, {})
  const topCategories = Object.entries(expenseCategories).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const maxCategory = Math.max(1, ...topCategories.map(([, amount]) => amount))

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <span className="eyebrow">TU RESUMEN FINANCIERO</span>
          <h1>Hola, vamos paso a paso.</h1>
          <p>Una vista sencilla para entender tus decisiones de dinero.</p>
        </div>
        <div className="dashboard-actions">
          <Link className="button button-primary" to="/app/movements">＋ Registrar movimiento</Link>
          <Link className="button button-secondary" to="/app/reports">Ver reporte mensual</Link>
          <Link className="button button-secondary" to="/app/goals">Metas de ahorro</Link>
        </div>
      </section>

      {error && <div className="alert alert-error inline-alert" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => refresh().catch(() => {})}>Reintentar</button></div>}

      <section className="metric-grid" aria-label="Indicadores del mes">
        <article className="metric-card metric-featured">
          <div className="metric-heading"><span>Balance registrado</span><span className="metric-icon">↗</span></div>
          <strong className="metric-value">{loading ? '—' : money.format(balance)}</strong>
          <span className="metric-footnote">Ingresos menos gastos entre los últimos 100 registros</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Ingresos del mes</span><span className="metric-icon icon-green">＋</span></div>
          <strong className="metric-value">{loading ? '—' : money.format(incomeMonth)}</strong>
          <span className="metric-footnote">Entradas registradas este mes</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Gastos del mes</span><span className="metric-icon icon-orange">↘</span></div>
          <strong className="metric-value">{loading ? '—' : money.format(expensesMonth)}</strong>
          <span className="metric-footnote">Gastos reales registrados este mes</span>
        </article>
        <article className="metric-card">
          <div className="metric-heading"><span>Gastos previstos</span><span className="metric-icon icon-purple">◷</span></div>
          <strong className="metric-value">{loading ? '—' : money.format(plannedMonth)}</strong>
          <span className="metric-footnote">Planes guardados para este mes</span>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel panel-large">
          <div className="panel-heading">
            <div><h2>Movimientos recientes</h2><p>Actividad de tu cuenta</p></div>
            <Link className="text-link" to="/app/movements">Ver todos <span aria-hidden="true">→</span></Link>
          </div>
          {loading ? <p className="empty-state">Cargando tus movimientos…</p> : recent.length === 0 ? (
            <div className="empty-state"><div className="empty-mark">↕</div><strong>Aquí comienza tu panorama</strong><p>Registra un ingreso o gasto para ver cómo evoluciona tu dinero.</p><Link className="text-link" to="/app/movements">Agregar el primero →</Link></div>
          ) : (
            <div className="transaction-list">
              {recent.map((item) => <div className="transaction-row" key={item.transactionId}>
                <div className={`transaction-mark ${item.type === 'income' ? 'mark-income' : 'mark-expense'}`}>{item.type === 'income' ? '＋' : '−'}</div>
                <div className="transaction-description"><strong>{item.description || item.category || 'Movimiento'}</strong><span>{item.category || 'Sin categoría'} · {formatDate(item.date)}{item.status === 'planned' ? ' · Previsto' : ''}</span></div>
                <strong className={`transaction-amount ${item.type === 'income' ? 'amount-income' : ''}`}>{item.type === 'income' ? '+' : '−'}{money.format(amountOf(item))}</strong>
              </div>)}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading"><div><h2>¿En qué gastas?</h2><p>Gastos reales de este mes</p></div><span className="panel-spark">◌</span></div>
          {loading ? <p className="empty-state">Calculando…</p> : topCategories.length === 0 ? <div className="category-empty"><span className="category-empty-icon">◌</span><p>Al registrar gastos, aquí verás tus categorías principales.</p></div> : <div className="category-list">{topCategories.map(([category, amount], index) => <div className="category-item" key={category}>
            <div className="category-label"><span><i className={`category-dot dot-${index}`} />{category}</span><strong>{money.format(amount)}</strong></div>
            <div className="progress-track"><span className={`progress-fill fill-${index}`} style={{ width: `${Math.max(6, (amount / maxCategory) * 100)}%` }} /></div>
          </div>)}</div>}
          <div className="gentle-tip"><span>✦</span><p>Conocer tus gastos es el primer paso para elegir tus prioridades.</p></div>
        </article>
      </section>
      <p className="data-note">El balance se calcula con los movimientos registrados en esta cuenta. Para incluir tus ahorros actuales, agrega un ingreso con la categoría “Saldo inicial”.</p>
    </div>
  )
}
