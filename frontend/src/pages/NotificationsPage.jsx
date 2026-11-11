import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBudgets, listCards, listTransactions } from '../services/api.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const dayMs = 86_400_000
const levelOrder = { danger: 0, warning: 1, info: 2 }

function currentMonthValue() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function startOfToday() {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

function dateFromIso(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDate(date) {
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

function categoryLabel(category) {
  const value = String(category || 'otros')
  return value.charAt(0).toLocaleUpperCase('es-MX') + value.slice(1)
}

function nextPaymentDate(dayValue, today) {
  const day = Number(dayValue)
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  let year = today.getFullYear()
  let month = today.getMonth()
  let due = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))
  if (due < today) {
    month += 1
    if (month > 11) {
      year += 1
      month = 0
    }
    due = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))
  }

  return due
}

function buildNotices({ cards, budgets, transactions, month }) {
  const today = startOfToday()
  const notices = []

  for (const card of cards) {
    const balance = Number(card.currentBalance) || 0
    const dueDate = nextPaymentDate(card.paymentDueDay, today)
    if (balance <= 0 || !dueDate) continue

    const days = Math.round((dueDate - today) / dayMs)
    if (days > 30) continue

    const level = days <= 2 ? 'danger' : days <= 7 ? 'warning' : 'info'
    notices.push({
      id: `card-${card.cardId}`,
      level,
      label: days === 0 ? 'Vence hoy' : days === 1 ? 'Vence mañana' : `Vence en ${days} días`,
      title: `Pago próximo: ${card.name}`,
      description: `${card.issuer || 'Tarjeta'} · saldo registrado de ${money.format(balance)} · fecha límite ${formatDate(dueDate)}.`,
      href: '/app/cards',
      sortDate: dueDate,
      icon: '◷',
    })
  }

  for (const budget of budgets) {
    const limit = Number(budget.limitAmount) || 0
    if (limit <= 0) continue

    const spent = transactions
      .filter((item) => item.date?.startsWith(month)
        && item.category?.toLowerCase() === budget.category
        && item.type !== 'income'
        && item.status !== 'planned')
      .reduce((total, item) => total + (Number(item.amount) || 0), 0)
    const utilization = (spent / limit) * 100
    if (utilization < 80) continue

    const over = spent > limit
    notices.push({
      id: `budget-${budget.budgetKey}`,
      level: over ? 'danger' : 'warning',
      label: over ? 'Límite superado' : `${Math.round(utilization)}% del límite`,
      title: `${categoryLabel(budget.category)}: ${over ? 'revisar gasto' : 'límite casi alcanzado'}`,
      description: `Llevas ${money.format(spent)} de ${money.format(limit)} presupuestados para este mes.`,
      href: '/app/budgets',
      sortDate: today,
      icon: over ? '!' : '↗',
    })
  }

  for (const item of transactions) {
    if (item.status !== 'planned' || item.type === 'income') continue
    const plannedDate = dateFromIso(item.date)
    if (!plannedDate) continue

    const days = Math.round((plannedDate - today) / dayMs)
    if (days < 0 || days > 14) continue

    notices.push({
      id: `planned-${item.transactionId}`,
      level: days <= 2 ? 'warning' : 'info',
      label: days === 0 ? 'Planeado para hoy' : days === 1 ? 'Planeado para mañana' : `En ${days} días`,
      title: item.description || `Gasto previsto: ${categoryLabel(item.category)}`,
      description: `${categoryLabel(item.category)} · ${money.format(Number(item.amount) || 0)} · ${formatDate(plannedDate)}.`,
      href: '/app/movements',
      sortDate: plannedDate,
      icon: '↗',
    })
  }

  return notices.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || a.sortDate - b.sortDate)
}

export default function NotificationsPage() {
  const month = currentMonthValue()
  const [cards, setCards] = useState([])
  const [budgets, setBudgets] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([listCards(), listBudgets(month), listTransactions()])
      .then(([cardRows, budgetRows, transactionRows]) => {
        if (!active) return
        setCards(cardRows)
        setBudgets(budgetRows)
        setTransactions(transactionRows)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'No se pudieron cargar los avisos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [month, refreshKey])

  function refresh() {
    setLoading(true)
    setRefreshKey((value) => value + 1)
  }

  const notices = useMemo(
    () => buildNotices({ cards, budgets, transactions, month }),
    [cards, budgets, transactions, month],
  )

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">RECORDATORIOS DE TU ACTIVIDAD</span>
          <h1>Avisos</h1>
          <p>Fechas próximas y límites que conviene revisar.</p>
        </div>
        <span className="count-pill">{loading ? 'Actualizando…' : `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}`}</span>
      </section>

      <div className="notice-info" role="note">
        <span aria-hidden="true">i</span>
        <p>Estos avisos se calculan al abrir esta sección usando tus datos. Se muestran dentro de la app; no envían correo, SMS ni notificaciones push.</p>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="panel notices-panel">
        <div className="panel-heading">
          <div><h2>Lo que requiere atención</h2><p>Pagos de tarjeta, gastos planeados y presupuestos.</p></div>
          <button aria-label="Actualizar avisos" className="icon-button" onClick={refresh} type="button">↻</button>
        </div>

        {loading ? (
          <div className="empty-state"><strong>Revisando tus datos…</strong><p>Consultando tarjetas, presupuestos y movimientos.</p></div>
        ) : notices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-mark">✓</div>
            <strong>No hay avisos próximos</strong>
            <p>Cuando una fecha de pago se acerque o un presupuesto llegue al 80%, aparecerá aquí.</p>
            <div className="notice-empty-links"><Link className="text-link" to="/app/cards">Ver tarjetas</Link><Link className="text-link" to="/app/budgets">Ver presupuestos</Link></div>
          </div>
        ) : (
          <div className="notice-list">
            {notices.map((notice) => (
              <article className={`notice-card notice-${notice.level}`} key={notice.id}>
                <span className="notice-icon" aria-hidden="true">{notice.icon}</span>
                <div className="notice-copy">
                  <div className="notice-meta"><span className="notice-tag">{notice.label}</span></div>
                  <h3>{notice.title}</h3>
                  <p>{notice.description}</p>
                </div>
                <Link className="notice-link" to={notice.href}>Abrir módulo <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
