# Finanzas Claras — infraestructura

**Estado verificado:** 11 de noviembre de 2026 · **Región:** `us-east-1` · **Pila:** `Proyectoinfrainicial` (`UPDATE_COMPLETE`, 43 recursos)

## Arquitectura desplegada

La aplicación React está publicada en S3 y CloudFront. Cognito proporciona registro e inicio de sesión. API Gateway valida JWT de Cognito y enruta las diez operaciones a cuatro Lambdas Python 3.12. Las funciones leen y escriben datos en cuatro tablas DynamoDB bajo demanda. CloudWatch recibe los logs. La plantilla de CloudFormation administra la API, Cognito, tablas, funciones, roles, permisos e infraestructura de logs; el bucket y la distribución del sitio se configuraron por separado.

El código fuente del diagrama está en [`architecture.mmd`](architecture.mmd) y la plantilla ejecutable en [`template.yaml`](template.yaml).

## Componentes y relaciones

| Servicio o recurso | Función y configuración | Relación |
|---|---|---|
| Amazon S3 + CloudFront | Alojan y entregan los archivos estáticos de React por HTTPS. | El navegador carga el sitio a través del dominio CloudFront. Su creación/publicación está separada de `template.yaml`. |
| Amazon Cognito | User Pool y cliente web público para registro, confirmación, inicio y cierre de sesión. | API Gateway valida tokens JWT emitidos por el User Pool. |
| API Gateway HTTP API | Diez rutas con `AuthorizationType: JWT`, autorizador `dor0bd`, integración Lambda proxy y etapa `$default`. | Envía la solicitud autenticada a la Lambda de cada dominio. |
| Lambda `DemoFunction` | Python 3.12, 128 MB, timeout 10 s. Procesa ingresos y gastos. | `GET/POST /transactions`; usa `TransactionsTable`. |
| Lambda `BudgetsFunction` | Python 3.12, 128 MB, timeout 10 s. Guarda y consulta presupuestos por mes/categoría. | `GET/POST /budgets`; usa `BudgetsTable`. |
| Lambda `CardsFunction` | Python 3.12, 128 MB, timeout 10 s, handler `index.handler`. Valida y guarda datos manuales de tarjetas. | `GET/POST /cards`; usa `CardsTable`. Los recursos existentes se adoptaron en CloudFormation mediante un change set de importación, sin recrearlos. |
| Lambda `PlanningFunction` | Python 3.12, 128 MB, timeout 15 s. Atiende metas, avisos y reporte mensual. | `GET/POST /goals`, `GET /notifications`, `GET /reports/monthly`; consulta las tablas necesarias. |
| Amazon DynamoDB | Cuatro tablas `PAY_PER_REQUEST`, con `userId` como clave de partición y una clave de ordenación por tipo de dato. | Los roles IAM de las funciones limitan operaciones y tablas. El identificador de cada usuario procede del claim `sub` del JWT validado. |
| AWS IAM | Un rol por función; permisos limitados a DynamoDB requerido y CloudWatch Logs. | Lambda asume su rol al ejecutar. Las rutas de tarjetas tienen permisos de invocación de Lambda separados por método. |
| Amazon CloudWatch Logs | Un grupo por Lambda, retención de siete días. | Se usa para investigar fallos y confirmar invocaciones. |
| AWS CloudFormation | Pila `Proyectoinfrainicial`, 43 recursos, estado actual `UPDATE_COMPLETE`. | Fuente de verdad para recursos de aplicación declarados en `template.yaml`. |

## Rutas API

| Ruta | Lambda | Autorización |
|---|---|---|
| `GET /transactions`, `POST /transactions` | `DemoFunction` | JWT Cognito |
| `GET /budgets`, `POST /budgets` | `BudgetsFunction` | JWT Cognito |
| `GET /cards`, `POST /cards` | `CardsFunction` | JWT Cognito |
| `GET /goals`, `POST /goals` | `PlanningFunction` | JWT Cognito |
| `GET /notifications` | `PlanningFunction` | JWT Cognito |
| `GET /reports/monthly` | `PlanningFunction` | JWT Cognito |

**API base:** `https://3wsywaa6oh.execute-api.us-east-1.amazonaws.com`

## Evidencias y comprobaciones

- La pila terminó `UPDATE_COMPLETE`; hay 43 recursos, incluidas 4 funciones, 4 tablas y 10 rutas. Las cuatro funciones están `Active` y su estado de última actualización es `Successful`.
- Las diez rutas usan el autorizador JWT de Cognito `dor0bd`.
- `CardsFunction` se invocó con una consulta GET controlada y devolvió `200` con una tarjeta del usuario sintético `lambda-read-test`; la invocación final no tuvo error.
- La evidencia vigente de inventario, rutas, configuración, permisos de invocación y pruebas de humo es [`evidence/14-final-deployment-verification.json`](evidence/14-final-deployment-verification.json).
- El grupo `/aws/lambda/Proyectoinfrainicial-CardsFunction` conserva sus logs por siete días.
- El equipo había comprobado desde la aplicación el registro/inicio de sesión, la creación y consulta de movimientos, la persistencia de una tarjeta y los avisos en pantalla.
- Las capturas de `evidence/capturas/` son de la etapa inicial y no muestran los 43 recursos actuales; consérvalas solo como evidencia histórica. Los JSON de `evidence/09` a `evidence/13` también son históricos; en particular, las pruebas de `09` y `10` usaron IAM antes de que la API pasara a Cognito JWT.

## Problemas técnicos corregidos

1. **Tarjetas fuera de IaC:** tabla, función, rol, política, integración y rutas existían manualmente. Se importaron a la pila sin reemplazar recursos ni perder los datos; después se sincronizó el código con la plantilla.
2. **Error de importación de módulo de Lambda:** la función inline intentaba cargar `lambda_function`, pero CloudFormation publica el contenido como `index.py`. Se actualizó a `index.handler` y CloudWatch confirmó la lectura exitosa con `200`.
3. **Cambio en cadena no deseado:** una revisión de plantilla proponía modificaciones al rol, función e integración de planeación. Se restauraron las referencias originales y el change set final dejó intactos esos componentes.

## Sincronizar handlers

Desde la raíz del repositorio:

```powershell
node backend/scripts/sync-lambda-source.mjs --write
node backend/scripts/sync-lambda-source.mjs
```

El primer comando copia los cuatro handlers fuente a sus bloques `ZipFile` y el segundo comprueba que no haya diferencias.

## Actualizar la pila en la consola

1. Abre **CloudFormation → Stacks → `Proyectoinfrainicial` → Update**.
2. Selecciona la opción para reemplazar la plantilla y carga `Proyecto_Infra/template.yaml`.
3. Incluye `CAPABILITY_NAMED_IAM` cuando AWS lo solicite.
4. Revisa y crea un change set. Verifica que no haya reemplazos de tablas, Cognito ni API que no se hayan planeado.
5. Ejecuta el change set aprobado y espera `UPDATE_COMPLETE`.

Las tablas de tarjetas y recursos importados tienen `DeletionPolicy: Retain` para reducir el riesgo de borrado accidental. El bucket y la distribución del sitio se actualizan fuera de esta pila: compila `frontend`, carga el contenido de `frontend/dist/` a S3 e invalida `/*` en CloudFront.

## Alcance

Los datos se ingresan manualmente; no hay conexión con instituciones bancarias ni almacenamiento de PAN/CVV. Los avisos se calculan al consultar la aplicación y no se envían por correo, SMS o push. Es una demostración académica; los costos dependen del uso y deben revisarse en AWS Billing.
