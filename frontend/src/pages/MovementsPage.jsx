import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeReceipt,
  createReceiptUpload,
  createTransaction,
  getReceiptUrl,
  uploadReceiptFile,
} from '../services/api.js'
import { useTransactions } from '../hooks/useTransactions.js'
import { consumeSharedReceipt } from '../services/sharedReceipt.js'

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const categories = ['Comida', 'Vivienda', 'Transporte', 'Servicios', 'Salud', 'Escuela', 'Ropa', 'Entretenimiento', 'Ahorro', 'Otros']
const receiptTypes = new Set(['image/jpeg', 'image/png', 'application/pdf'])

function normalizeReceiptFile(file) {
  const extensionType = /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.png$/i.test(file.name) ? 'image/png' : /\.pdf$/i.test(file.name) ? 'application/pdf' : ''
  const type = receiptTypes.has(file.type) ? file.type : extensionType
  return type ? (file.type === type ? file : new File([file], file.name || 'ticket', { type })) : null
}

const sharedReceiptErrors = {
  size: 'El ticket compartido supera el límite de 10 MB.',
  type: 'Comparte una foto JPG o PNG, o un PDF de una página.',
  file: 'No se pudo recibir el archivo compartido. Inténtalo de nuevo.',
}

function initialReceiptError() {
  const sharedTicket = new URLSearchParams(window.location.search).get('sharedTicket')
  return sharedTicket && sharedTicket !== '1' ? (sharedReceiptErrors[sharedTicket] || sharedReceiptErrors.file) : ''
}

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
  const [receiptId, setReceiptId] = useState('')
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [receiptError, setReceiptError] = useState(initialReceiptError)
  const [receiptMessage, setReceiptMessage] = useState('')
  const [receiptUrls, setReceiptUrls] = useState({})
  const sharedReceiptHandled = useRef(false)
  const ordered = [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'type' && value === 'income' && receiptId) {
      setReceiptId('')
      setReceiptMessage('El ticket no se asociará al ingreso.')
    }
  }

  const processReceiptFile = useCallback(async (file) => {
    setReceiptError('')
    setReceiptMessage('')
    setReceiptId('')
    const receiptFile = normalizeReceiptFile(file)
    if (!receiptFile) {
      setReceiptError('Elige una foto JPG o PNG, o un PDF de una página.')
      return
    }
    if (receiptFile.size < 1 || receiptFile.size > 10 * 1024 * 1024) {
      setReceiptError('El archivo debe pesar 10 MB o menos.')
      return
    }

    setReceiptBusy(true)
    try {
      const upload = await createReceiptUpload(receiptFile)
      await uploadReceiptFile(receiptFile, upload)
      const result = await analyzeReceipt(upload.receiptId)
      const draft = result.draft || {}
      const currencyCode = String(draft.currency || '').toUpperCase()
      const foreignCurrency = Boolean(currencyCode && currencyCode !== 'MXN')
      const lowConfidence = Number(draft.confidence) < 65
      const detectedAmount = draft.amount && !foreignCurrency && !lowConfidence ? money.format(Number(draft.amount)) : ''
      const dateNote = draft.rawDate && !draft.date ? ` La fecha detectada fue ${draft.rawDate}; revísala.` : ''
      const currencyNote = foreignCurrency ? ` El ticket está en ${currencyCode}; no hice conversión. Captura el equivalente en MXN.` : ''
      const unknownCurrencyNote = !currencyCode && draft.amount ? ' No pude confirmar la moneda; verifica que el monto corresponda a MXN.' : ''
      const confidenceNote = lowConfidence ? ' La lectura del total tuvo poca confianza; no lo cargué automáticamente. Captúralo manualmente.' : ''

      setReceiptId(upload.receiptId)
      setForm((current) => ({
        ...current,
        type: 'expense',
        status: 'actual',
        amount: foreignCurrency || lowConfidence ? current.amount : (draft.amount || current.amount),
        category: 'otros',
        description: draft.merchant || current.description || receiptFile.name,
        date: draft.date || current.date,
      }))
      setReceiptMessage(
        detectedAmount
          ? `Ticket leído. Total reconocido: ${detectedAmount}. Revisa y corrige los datos antes de guardar.${dateNote}`
          : `Ticket leído. Revisa los datos antes de guardar.${confidenceNote}${currencyNote}${unknownCurrencyNote}${dateNote}`,
      )
    } catch (requestError) {
      setReceiptError(requestError.message || 'No se pudo leer el ticket. Captura el gasto manualmente.')
    } finally {
      setReceiptBusy(false)
    }
  }, [])

  useEffect(() => {
    if (sharedReceiptHandled.current) return
    const url = new URL(window.location.href)
    const sharedTicket = url.searchParams.get('sharedTicket')
    if (!sharedTicket) return

    sharedReceiptHandled.current = true
    url.searchParams.delete('sharedTicket')
    window.history.replaceState(window.history.state, '', url)
    if (sharedTicket !== '1') return

    consumeSharedReceipt()
      .then((file) => {
        if (file) return processReceiptFile(file)
        setReceiptError('No se encontró el ticket compartido. Vuelve a compartirlo desde tu dispositivo.')
      })
      .catch((requestError) => setReceiptError(requestError.message || 'No se pudo recibir el ticket compartido.'))
  }, [processReceiptFile])

  function handleReceiptChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) processReceiptFile(file)
  }

  async function openReceipt(id) {
    const previewWindow = window.open('about:blank', '_blank')
    if (previewWindow) previewWindow.opener = null
    try {
      const result = await getReceiptUrl(id)
      if (previewWindow) {
        previewWindow.location.replace(result.url)
      } else {
        setReceiptUrls((current) => ({ ...current, [id]: result.url }))
      }
    } catch (requestError) {
      if (previewWindow) previewWindow.close()
      setReceiptError(requestError.message || 'No se pudo abrir el ticket.')
    }
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
      await createTransaction({
        ...form,
        amount: amount.toFixed(2),
        ...(receiptId ? { receiptId } : {}),
      })
      await refresh()
      setNotice(receiptId ? 'Gasto guardado con su ticket.' : 'Movimiento guardado y consultado desde tu cuenta.')
      setForm((current) => ({ ...current, amount: '', description: '', date: today }))
      setReceiptId('')
      setReceiptMessage('')
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
          <div className="receipt-capture">
            <label className="field">
              <span>Tomar foto o adjuntar ticket <small>(opcional)</small></span>
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                capture="environment"
                onChange={handleReceiptChange}
                disabled={receiptBusy || saving}
                aria-describedby="receipt-help"
              />
            </label>
            <small id="receipt-help" className="receipt-help">Toma una foto, elige una imagen o PDF de una página (hasta 10 MB), o comparte el archivo desde otra app. Para compartirlo directamente, instala Finanzas Claras desde el navegador. El ticket se guarda en privado y se elimina después de 30 días.</small>
            {receiptBusy && <p className="receipt-status" role="status">Subiendo y leyendo el ticket…</p>}
            {receiptError && <div className="alert alert-error" role="alert">{receiptError}</div>}
            {receiptMessage && <div className="alert alert-success" role="status">{receiptMessage}</div>}
          </div>
          <form className="form-stack" onSubmit={handleSubmit}>
            <div className="segmented-control" role="group" aria-label="Tipo de movimiento">
              <button className={form.type === 'expense' ? 'selected expense-choice' : ''} type="button" onClick={() => update('type', 'expense')}>− Gasto</button>
            <button className={form.type === 'income' ? 'selected income-choice' : ''} type="button" onClick={() => update('type', 'income')} disabled={receiptBusy}>＋ Ingreso</button>
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
            <button className="button button-primary button-full" type="submit" disabled={saving || receiptBusy}>{saving ? 'Guardando…' : receiptBusy ? 'Leyendo ticket…' : 'Guardar movimiento'}</button>
          </form>
        </article>

        <article className="panel movement-history-panel">
          <div className="panel-heading"><div><h2>Historial</h2><p>Hasta los últimos 100 movimientos</p></div><button className="icon-button" type="button" onClick={() => refresh().catch(() => {})} aria-label="Actualizar historial">↻</button></div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {loading ? <p className="empty-state">Cargando movimientos…</p> : ordered.length === 0 ? <div className="empty-state"><div className="empty-mark">↕</div><strong>Aún no hay movimientos</strong><p>Usa el formulario para registrar tu primera entrada o gasto.</p></div> : <div className="table-scroll"><table className="movement-table"><thead><tr><th>Movimiento</th><th>Fecha</th><th>Estado</th><th className="number-cell">Monto</th></tr></thead><tbody>{ordered.map((item) => <tr key={item.transactionId}>
            <td><div className="table-description"><span className={`transaction-mark small-mark ${item.type === 'income' ? 'mark-income' : 'mark-expense'}`}>{item.type === 'income' ? '＋' : '−'}</span><span><strong>{item.description || item.category || 'Movimiento'}</strong><small>{item.category || 'Sin categoría'} · {item.paymentMethod || 'pago'}</small>{item.receiptId && (receiptUrls[item.receiptId] ? <a className="text-button receipt-view-link" href={receiptUrls[item.receiptId]} target="_blank" rel="noreferrer">Abrir ticket</a> : <button className="text-button receipt-view-link" type="button" onClick={() => openReceipt(item.receiptId)}>Ver ticket</button>)}</span></div></td>
            <td>{item.date || '—'}</td><td><span className={`status-pill ${item.status === 'planned' ? 'status-planned' : 'status-actual'}`}>{item.status === 'planned' ? 'Previsto' : 'Realizado'}</span></td><td className={`number-cell ${item.type === 'income' ? 'amount-income' : ''}`}>{item.type === 'income' ? '+' : '−'}{money.format(amountOf(item))}</td>
          </tr>)}</tbody></table></div>}
        </article>
      </section>
    </div>
  )
}
