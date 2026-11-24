# Finanzas Claras — infraestructura AWS

## Estado actual comprobado

Última evidencia del despliegue: 12 de noviembre de 2026, región `us-east-1`. La plantilla del repositorio incluye cambios posteriores que aún no se han desplegado:

| Parte | Estado actual |
|---|---|
| Pila CloudFormation `Proyectoinfrainicial` | `UPDATE_COMPLETE`, 31 recursos |
| Plantilla fuente `template.yaml` | 543 líneas; incluye la extensión para tickets pendiente de despliegue |
| Lambda | 3 funciones activas, Python 3.12, 128 MB, timeout de 10 segundos |
| API Gateway HTTP API | 6 rutas, las 6 con JWT de Cognito |
| DynamoDB usado por el MVP | 3 tablas, `PAY_PER_REQUEST` |
| Amazon Cognito | User Pool y cliente web; las cuentas revisadas aparecen confirmadas y habilitadas |
| CloudFront | Distribución habilitada, estado `Deployed` |
| Alojamiento del frontend | S3 y CloudFront, operados fuera de esta pila |

La cuenta AWS también conserva `GoalsTable` activa y separada de CloudFormation. La tabla no participa en la aplicación actual. El cambio usó `DeletionPolicy: Retain`, así que se preservaron recurso y datos.

El inventario y las pruebas de acceso actuales están en [`evidence/15-post-trim-verification.json`](evidence/15-post-trim-verification.json). Las carpetas de evidencia anteriores conservan pruebas históricas, no deben presentarse como evidencia de la versión actual.

## Diagrama

El diagrama editable en Mermaid está en [`architecture.mmd`](architecture.mmd). Resume el recorrido actual y marca con línea punteada la extensión de tickets que todavía no está desplegada.

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
| Amazon Textract | En la extensión pendiente, analiza tickets de una página y propone comercio, total, fecha e impuestos; la persona revisa antes de guardar. |

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

La plantilla fuente también declara tres rutas protegidas para tickets: `POST /receipts/upload-url`, `POST /receipts/analyze` y `GET /receipts/{receiptId}`. Aún no forman parte del despliegue comprobado arriba.

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

**Punto por mejorar:** el API desplegado todavía permite CORS desde `*`. La plantilla fuente ya propone limitarlo al origen `https://d32bc7tq7qvtgu.cloudfront.net`; esa restricción queda pendiente de desplegar y comprobar.

## Extensión propuesta: importar un ticket

La persona puede tomar una foto, elegir una imagen/PDF o, si instaló la aplicación web en un navegador compatible, compartir el archivo desde el menú de compartir del teléfono. El navegador solicita a la API un formulario de carga temporal; Lambda lo firma y el navegador carga directamente el archivo al bucket privado de S3. Después, Lambda pide a Textract leer el ticket y devuelve un borrador. La persona verifica y corrige el monto, comercio y fecha; al guardar, el movimiento actual se almacena en `TransactionsTable` con el `receiptId`. No se agrega otra tabla de DynamoDB.

- Formatos: JPG, PNG o PDF de una página; máximo 10 MB.
- El bucket bloquea acceso público, cifra los archivos y los elimina a los 30 días.
- La carga prefirmada y el enlace temporal para ver un ticket duran cinco minutos.
- `userId` viene de la sesión Cognito validada; cada archivo se guarda bajo el identificador de esa persona.
- La extracción es una sugerencia, no un registro automático: se debe revisar antes de guardar.
- Las fotos y la opción de elegir archivos funcionan sin instalar la app. Para recibir un archivo directamente desde otra aplicación por el menú del teléfono, hay que instalar Finanzas Claras como aplicación web; depende del navegador y el sistema operativo.
- El código, el bucket, los permisos y las rutas ya están descritos en el repositorio, pero la aplicación publicada y AWS no cambian hasta compilar el frontend y desplegar la plantilla.
- La plantilla agrega seis recursos de CloudFormation para esta función; si la pila coincide con el inventario de 31 recursos de la evidencia y el change set no requiere otros cambios, quedaría en 37.

La explicación de implementación, límites y costo está en [`receipt-import.md`](receipt-import.md).

## Actualizar la infraestructura

Desde la raíz del repositorio, crea una plantilla empaquetada con un bucket privado de artefactos en `us-east-1`:

```powershell
$bucketArtefactos = "NOMBRE_DE_BUCKET_PRIVADO_EN_US_EAST_1"
aws cloudformation package --template-file Proyecto_Infra/template.yaml --s3-bucket $bucketArtefactos --s3-prefix finanzas-claras/lambda --output-template-file Proyecto_Infra/template.packaged.yaml --region us-east-1
```

Carga `template.packaged.yaml` en CloudFormation, crea y revisa el change set y solo entonces ejecútalo. La pila usa recursos IAM con nombre, por lo que AWS puede pedir `CAPABILITY_NAMED_IAM`. La plantilla fuente no contiene los ZIP finales de Lambda.

Para actualizar el sitio, compila `frontend`, carga el contenido de `frontend/dist/` al bucket S3 del sitio e invalida `/*` en CloudFront. Ese proceso es independiente del despliegue de CloudFormation del backend.
