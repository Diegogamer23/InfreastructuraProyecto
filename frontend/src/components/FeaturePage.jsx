export default function FeaturePage({ eyebrow, title, description, icon, bullets, phase }) {
  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <span className="count-pill">Siguiente módulo</span>
      </section>
      <section className="feature-panel panel">
        <div className="feature-orbit" aria-hidden="true"><span>{icon}</span></div>
        <div className="feature-copy">
          <span className="status-pill status-planned">En desarrollo</span>
          <h2>{phase}</h2>
          <p>La sección ya está preparada en la navegación del producto. Para guardar información real por usuario, falta definir su modelo de datos, permisos y endpoints en AWS.</p>
          <ul>{bullets.map((bullet) => <li key={bullet}><span aria-hidden="true">✓</span>{bullet}</li>)}</ul>
          <div className="feature-architecture"><strong>Próximo paso de infraestructura</strong><span>Diseñar el recurso DynamoDB y la Lambda de este módulo; conectarlo mediante una ruta propia de API Gateway.</span></div>
        </div>
      </section>
    </div>
  )
}
