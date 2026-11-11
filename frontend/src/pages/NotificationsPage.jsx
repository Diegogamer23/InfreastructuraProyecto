import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getNotifications } from '../services/api.js'

export default function NotificationsPage() {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotices(await getNotifications())
    } catch (requestError) {
      setError(requestError.message || 'No se pudieron cargar los avisos.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getNotifications()
      .then((rows) => { if (active) setNotices(rows) })
      .catch((requestError) => { if (active) setError(requestError.message || 'No se pudieron cargar los avisos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">RECORDATORIOS DE TU ACTIVIDAD</span><h1>Avisos</h1><p>Fechas próximas y límites que conviene revisar.</p></div>
        <span className="count-pill">{loading ? 'Actualizando…' : `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}`}</span>
      </section>

      <div className="notice-info" role="note"><span aria-hidden="true">i</span><p>Lambda revisa tus datos de AWS al abrir esta sección. Los avisos son dentro de la app; no envían correo, SMS ni notificaciones push.</p></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <section className="panel notices-panel">
        <div className="panel-heading"><div><h2>Lo que requiere atención</h2><p>Pagos de tarjeta, gastos planeados, presupuestos y metas.</p></div><button aria-label="Actualizar avisos" className="icon-button" onClick={refresh} type="button">↻</button></div>
        {loading ? <div className="empty-state"><strong>Revisando tus datos…</strong><p>Consultando tus registros protegidos por Cognito.</p></div> : notices.length === 0 ? (
          <div className="empty-state"><div className="empty-mark">✓</div><strong>No hay avisos próximos</strong><p>Cuando una fecha de pago se acerque o un presupuesto llegue al 80%, aparecerá aquí.</p><div className="notice-empty-links"><Link className="text-link" to="/app/cards">Ver tarjetas</Link><Link className="text-link" to="/app/budgets">Ver presupuestos</Link><Link className="text-link" to="/app/goals">Ver metas</Link></div></div>
        ) : (
          <div className="notice-list">{notices.map((notice) => <article className={`notice-card notice-${notice.level}`} key={notice.id}>
            <span className="notice-icon" aria-hidden="true">{notice.icon}</span>
            <div className="notice-copy"><div className="notice-meta"><span className="notice-tag">{notice.label}</span></div><h3>{notice.title}</h3><p>{notice.description}</p></div>
            <Link className="notice-link" to={notice.href}>Abrir módulo <span aria-hidden="true">→</span></Link>
          </article>)}</div>
        )}
      </section>
    </div>
  )
}
