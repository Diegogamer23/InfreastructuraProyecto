import { useState } from 'react'
import { createTransaction } from '../services/api.js'
import { useTransactions } from '../hooks/useTransactions.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const categories = ['Comida', 'Vivienda', 'Transporte', 'Servicios', 'Salud', 'Escuela', 'Ropa', 'Entretenimiento', 'Ahorro', 'Otros']

function amountOf(transaction) {
  const value = Number(transaction.amount)
  return Number.isFinite(value) ? value : 0
}

export default function MovementsPage() {
  const { transactions, loading, error, refresh } = useTransactions()
  const [form, setForm] = useState({ type: 'expense', status: 'actual', amount: '', category: 'Comida', description: '', date: today, paymentMethod: 'debit' })
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const ordered = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Escribe un monto mayor que cero.')
      return
    }
    setSaving(true)
    try {
      await createTransaction({ ...form, amount: amount.toFixed(2) })
      await refresh()
      setNotice('Movimiento guardado y consultado desde tu cuenta.')
      setForm((current) => ({ ...current, amount: '', description: '', date: today }))
    } catch (requestError) {
      setFormError(requestError.message || 'No se pudo guardar el movimiento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">INGRESOS Y GASTOS</span><h1>Movimientos</h1><p>Registra lo que ya pasó o lo que tienes previsto.</p></div>
        <span className="count-pill">{transactions.length} registrados</span>
      </section>

      <section className="movement-layout">
        <article className="panel movement-form-panel">
          <div className="panel-heading"><div><h2>Nuevo movimiento</h2><p>Tu información queda asociada a tu cuenta.</p></div><span className="panel-spark">＋</span></div>
          {formError && <div className="alert alert-error" role="alert">{formError}</div>}
          {notice && <div className="alert alert-success" role="status">{notice}</div>}
          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="segmented-control" role="group" aria-label="Tipo de movimiento">
              <button className={form.type === 'expense' ? 'selected expense-choice' : ''} type="button" onClick={() => update('type', 'expense')}>− Gasto</button>
              <button className={form.type === 'income' ? 'selected income-choice' : ''} type="button" onClick={() => update('type', 'income')}>＋ Ingreso</button>
            </div>
            <label className="field"><span>Monto (MXN)</span><div className="input-prefix"><span>$</span><input inputMode="decimal" min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0.00" required /></div></label>
            <div className="form-two-columns">
              <label className="field"><span>Categoría</span><select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((category) => <option key={category} value={category.toLowerCase()}>{category}</option>)}</select></label>
              <label className="field"><span>Fecha</span><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} required /></label>
            </div>
            <div className="form-two-columns">
              <label className="field"><span>Estado</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="actual">Realizado</option><option value="planned">Previsto</option></select></label>
              <label className="field"><span>Forma de pago</span><select value={form.paymentMethod} onChange={(event) => update('paymentMethod', event.target.value)}><option value="cash">Efectivo</option><option value="debit">Débito</option><option value="credit">Crédito</option></select></label>
            </div>
            <label className="field"><span>Descripción <small>(opcional)</small></span><input maxLength="200" value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Ej. Supermercado de la semana" /></label>
            <button className="button button-primary button-full" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar movimiento'}</button>
          </form>
        </article>

        <article className="panel movement-history-panel">
          <div className="panel-heading"><div><h2>Historial</h2><p>Hasta los últimos 100 movimientos</p></div><button className="icon-button" type="button" onClick={() => refresh().catch(() => {})} aria-label="Actualizar historial">↻</button></div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading ? <p className="empty-state">Cargando movimientos…</p> : ordered.length === 0 ? <div className="empty-state"><div className="empty-mark">↕</div><strong>Aún no hay movimientos</strong><p>Usa el formulario para registrar tu primera entrada o gasto.</p></div> : <div className="table-scroll"><table className="movement-table"><thead><tr><th>Movimiento</th><th>Fecha</th><th>Estado</th><th className="number-cell">Monto</th></tr></thead><tbody>{ordered.map((item) => <tr key={item.transactionId}>
            <td><div className="table-description"><span className={`transaction-mark small-mark ${item.type === 'income' ? 'mark-income' : 'mark-expense'}`}>{item.type === 'income' ? '＋' : '−'}</span><span><strong>{item.description || item.category || 'Movimiento'}</strong><small>{item.category || 'Sin categoría'} · {item.paymentMethod || 'pago'}</small></span></div></td>
            <td>{item.date || '—'}</td><td><span className={`status-pill ${item.status === 'planned' ? 'status-planned' : 'status-actual'}`}>{item.status === 'planned' ? 'Previsto' : 'Realizado'}</span></td><td className={`number-cell ${item.type === 'income' ? 'amount-income' : ''}`}>{item.type === 'income' ? '+' : '−'}{money.format(amountOf(item))}</td>
          </tr>)}</tbody></table></div>}
        </article>
      </section>
    </div>
  )
}
