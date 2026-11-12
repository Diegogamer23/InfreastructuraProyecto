# Finanzas Claras — infraestructura AWS

## Estado actual comprobado

Revisión del 12 de noviembre de 2026, región `us-east-1`:

| Parte | Estado actual |
|---|---|
| Pila CloudFormation `Proyectoinfrainicial` | `UPDATE_COMPLETE`, 31 recursos |
| Plantilla `template.yaml` | 440 líneas |
| Lambda | 3 funciones activas, Python 3.12, 128 MB, timeout de 10 segundos |
| API Gateway HTTP API | 6 rutas, las 6 con JWT de Cognito |
| DynamoDB usado por el MVP | 3 tablas, `PAY_PER_REQUEST` |
| Amazon Cognito | User Pool y cliente web; las cuentas revisadas aparecen confirmadas y habilitadas |
| CloudFront | Distribución habilitada, estado `Deployed` |
| Alojamiento del frontend | S3 y CloudFront, operados fuera de esta pila |

La cuenta AWS también conserva `GoalsTable` activa y separada de CloudFormation. La tabla no participa en la aplicación actual. El cambio usó `DeletionPolicy: Retain`, así que se preservaron recurso y datos.

El inventario y las pruebas de acceso actuales están en [`evidence/15-post-trim-verification.json`](evidence/15-post-trim-verification.json). Las carpetas de evidencia anteriores conservan pruebas históricas, no deben presentarse como evidencia de la versión actual.

## Diagrama

El diagrama editable en Mermaid está en [`architecture.mmd`](architecture.mmd). Resume el recorrido del navegador, autenticación, API, funciones, base de datos y logs.

## Recursos y responsabilidades

| Servicio | Uso en el proyecto |
|---|---|
| S3 y CloudFront | S3 guarda los archivos estáticos de React; CloudFront los entrega por internet. El alojamiento se publica por separado de `template.yaml`. |
| Amazon Cognito | Administra el registro, confirmación de correo e inicio de sesión. Emite los tokens que usa el frontend. |
| API Gateway HTTP API | Recibe las solicitudes HTTPS y valida el JWT antes de invocar una función. |
| Lambda `DemoFunction` | Procesa `GET/POST /transactions` y usa `TransactionsTable`. |
| Lambda `BudgetsFunction` | Procesa `GET/POST /budgets` y usa `BudgetsTable`. |
| Lambda `CardsFunction` | Procesa `GET/POST /cards` y usa `CardsTable`. Los datos de tarjeta se capturan manualmente; no se guarda PAN/CVV. |
| DynamoDB | Tres tablas bajo demanda. Cada función consulta registros bajo el identificador de usuario del token. |
| IAM | Cada Lambda tiene un rol con acceso a la tabla y a los logs que necesita. |
| CloudWatch Logs | Guarda la salida de cada función; la retención configurada es de siete días. |
| CloudFormation | Mantiene declarados los recursos de la API, Cognito, las funciones, tablas, roles, permisos y logs. |

## Rutas API activas

Las seis rutas están protegidas por el autorizador JWT `Proyectoinfrainicial-CognitoJwtAuthorizer`.

| Método y ruta | Lambda | Tabla |
|---|---|---|
| `GET /transactions` | `DemoFunction` | `TransactionsTable` |
| `POST /transactions` | `DemoFunction` | `TransactionsTable` |
| `GET /budgets` | `BudgetsFunction` | `BudgetsTable` |
| `POST /budgets` | `BudgetsFunction` | `BudgetsTable` |
| `GET /cards` | `CardsFunction` | `CardsTable` |
| `POST /cards` | `CardsFunction` | `CardsTable` |

API base: `https://3wsywaa6oh.execute-api.us-east-1.amazonaws.com`

## Recorte del alcance

Se eliminó `PlanningFunction`, que reunía metas, reporte mensual y avisos. También se retiraron sus permisos, logs, integración, rutas y salidas relacionadas. La pila pasó de 43 a 31 recursos, de cuatro a tres Lambdas y de diez a seis rutas. El YAML pasó de aproximadamente 1,549 a 440 líneas.

Metas, reportes y avisos ya no forman parte de esta versión. La tabla `GoalsTable` permanece fuera de la pila por `DeletionPolicy: Retain`; la aplicación no la utiliza.

## Verificación funcional y límites

- `npm run lint` y `npm run build`: sin errores.
- Páginas públicas y rutas internas del frontend: HTTP `200`.
- Solicitudes sin token a las seis rutas: HTTP `401`, resultado esperado por el autorizador.
- AWS confirma una pila completa, tres funciones, seis rutas protegidas, tres tablas activas del MVP y una distribución CloudFront desplegada.
- Las funciones se ejercitaron con datos sintéticos en llamadas directas y los registros de prueba se limpiaron. Esto prueba la lógica de cada Lambda, pero no sustituye una prueba de inicio de sesión real desde el navegador.
- Cognito muestra las cuentas existentes confirmadas y habilitadas. No se usó ni se expuso una contraseña real para esta verificación.

**Punto por mejorar:** CORS permite `*`. Antes de invitar a usuarios externos, restringirlo a `https://d32bc7tq7qvtgu.cloudfront.net` y volver a comprobar las llamadas del frontend.

## Actualizar la infraestructura

Desde la raíz del repositorio, crea una plantilla empaquetada con un bucket privado de artefactos en `us-east-1`:

```powershell
$bucketArtefactos = "NOMBRE_DE_BUCKET_PRIVADO_EN_US_EAST_1"
aws cloudformation package --template-file Proyecto_Infra/template.yaml --s3-bucket $bucketArtefactos --s3-prefix finanzas-claras/lambda --output-template-file Proyecto_Infra/template.packaged.yaml --region us-east-1
```

Carga `template.packaged.yaml` en CloudFormation, crea y revisa el change set y solo entonces ejecútalo. La pila usa recursos IAM con nombre, por lo que AWS puede pedir `CAPABILITY_NAMED_IAM`. La plantilla fuente no contiene los ZIP finales de Lambda.

Para actualizar el sitio, compila `frontend`, carga el contenido de `frontend/dist/` al bucket S3 del sitio e invalida `/*` en CloudFront. Ese proceso es independiente del despliegue de CloudFormation del backend.
