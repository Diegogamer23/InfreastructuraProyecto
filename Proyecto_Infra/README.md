# Finanzas Claras — infraestructura

**Último despliegue comprobado:** 11 de noviembre de 2026 · `us-east-1` · `Proyectoinfrainicial` (`UPDATE_COMPLETE`, 43 recursos). Ese despliegue aún tiene 4 Lambdas y 10 rutas; el recorte del repositorio requiere una actualización posterior en AWS.

## Arquitectura desplegada

La aplicación React se publica en S3 y CloudFront. Cognito proporciona registro e inicio de sesión. API Gateway valida JWT de Cognito y enruta seis operaciones a tres Lambdas Python 3.12. Las funciones leen y escriben datos en tres tablas DynamoDB bajo demanda. CloudWatch recibe los logs. La plantilla reducida de CloudFormation administra la API, Cognito, tablas, funciones, roles, permisos e infraestructura de logs; el bucket y la distribución del sitio se publican por separado.

El código fuente del diagrama está en [`architecture.mmd`](architecture.mmd) y la plantilla ejecutable en [`template.yaml`](template.yaml).

## Componentes y relaciones

| Servicio o recurso | Función y configuración | Relación |
|---|---|---|
| Amazon S3 + CloudFront | Alojan y entregan los archivos estáticos de React por HTTPS. | El navegador carga el sitio a través del dominio CloudFront. Su creación/publicación está separada de `template.yaml`. |
| Amazon Cognito | User Pool y cliente web público para registro, confirmación, inicio y cierre de sesión. | API Gateway valida tokens JWT emitidos por el User Pool. |
| API Gateway HTTP API | Seis rutas con `AuthorizationType: JWT`, autorizador `dor0bd`, integración Lambda proxy y etapa `$default`. | Envía la solicitud autenticada a la Lambda de cada dominio. |
| Lambda `DemoFunction` | Python 3.12, 128 MB, timeout 10 s, handler `handler.handler`; ZIP desde `backend/src/transactions`. Procesa ingresos y gastos. | `GET/POST /transactions`; usa `TransactionsTable`. |
| Lambda `BudgetsFunction` | Python 3.12, 128 MB, timeout 10 s, handler `handler.handler`; ZIP desde `backend/src/budgets`. Guarda y consulta presupuestos por mes/categoría. | `GET/POST /budgets`; usa `BudgetsTable`. |
| Lambda `CardsFunction` | Python 3.12, 128 MB, timeout 10 s, handler `handler.handler`. Valida y guarda datos manuales de tarjetas. El código se empaqueta como ZIP desde `backend/src/cards`. | `GET/POST /cards`; usa `CardsTable`. Los recursos existentes se adoptaron en CloudFormation mediante un change set de importación, sin recrearlos. |
| Amazon DynamoDB | Tres tablas `PAY_PER_REQUEST`, con `userId` como clave de partición y una clave de ordenación por tipo de dato. | Los roles IAM de las funciones limitan operaciones y tablas. El identificador de cada usuario procede del claim `sub` del JWT validado. |
| AWS IAM | Un rol por función; permisos limitados a DynamoDB requerido y CloudWatch Logs. | Lambda asume su rol al ejecutar. Las rutas de tarjetas tienen permisos de invocación de Lambda separados por método. |
| Amazon CloudWatch Logs | Un grupo por Lambda, retención de siete días. | Se usa para investigar fallos y confirmar invocaciones. |
| AWS CloudFormation | La plantilla fuente queda en aproximadamente 485 líneas y 31 recursos después del recorte. El despliegue anterior de 43 recursos aún aparece en la evidencia guardada. | Fuente de verdad para recursos de aplicación declarados en `template.yaml`. |

## Rutas API

| Ruta | Lambda | Autorización |
|---|---|---|
| `GET /transactions`, `POST /transactions` | `DemoFunction` | JWT Cognito |
| `GET /budgets`, `POST /budgets` | `BudgetsFunction` | JWT Cognito |
| `GET /cards`, `POST /cards` | `CardsFunction` | JWT Cognito |

**API base:** `https://3wsywaa6oh.execute-api.us-east-1.amazonaws.com`

## Evidencias y comprobaciones

- La evidencia del 11 de noviembre registra el despliegue anterior: `UPDATE_COMPLETE`, 43 recursos, 4 funciones, 4 tablas y 10 rutas. La versión reducida todavía no está desplegada ni verificada en AWS.
- `CardsFunction` se invocó con una consulta GET controlada y devolvió `200` con una tarjeta del usuario sintético `lambda-read-test`; la invocación final no tuvo error.
- La evidencia vigente de inventario, rutas, configuración, permisos de invocación y pruebas de humo es [`evidence/14-final-deployment-verification.json`](evidence/14-final-deployment-verification.json).
- El grupo `/aws/lambda/Proyectoinfrainicial-CardsFunction` conserva sus logs por siete días.
- El equipo había comprobado desde la aplicación el registro/inicio de sesión, la creación y consulta de movimientos, la persistencia de una tarjeta y los avisos en pantalla de la versión anterior.
- Las capturas de `evidence/capturas/` son de la etapa inicial y no muestran los 43 recursos actuales; consérvalas solo como evidencia histórica. Los JSON de `evidence/09` a `evidence/13` también son históricos; en particular, las pruebas de `09` y `10` usaron IAM antes de que la API pasara a Cognito JWT.

## Problemas técnicos corregidos

1. **Tarjetas fuera de IaC:** tabla, función, rol, política, integración y rutas existían manualmente. Se importaron a la pila sin reemplazar recursos ni perder los datos; después se sincronizó el código con la plantilla.
2. **Empaquetado de las Lambdas:** cada función usa el handler `handler.handler` dentro de un ZIP que AWS CLI genera desde la carpeta fuente. Antes de actualizar CloudFormation, se debe crear `template.packaged.yaml` con `aws cloudformation package`.
3. **Reducción de alcance:** la versión nueva elimina el servicio de planeación y las rutas de metas, avisos y reporte mensual. La tabla `GoalsTable` tiene `DeletionPolicy: Retain`; al retirarla de la plantilla, CloudFormation la conserva y la separa de la pila.

## Empaquetar handlers

Las carpetas `backend/src/transactions`, `backend/src/budgets` y `backend/src/cards` contienen los handlers Python. `aws cloudformation package` crea y sube sus ZIPs al bucket de artefactos, y genera la plantilla que se debe cargar en CloudFormation. El bucket debe existir, ser privado y estar en `us-east-1`:

```powershell
$bucketArtefactos = "NOMBRE_DE_BUCKET_PRIVADO_EN_US_EAST_1"
aws cloudformation package --template-file Proyecto_Infra/template.yaml --s3-bucket $bucketArtefactos --s3-prefix finanzas-claras/lambda --output-template-file Proyecto_Infra/template.packaged.yaml --region us-east-1
```

No uses el bucket público del sitio para guardar los paquetes de Lambda. El comando necesita AWS CLI autenticado y no despliega la pila.

## Actualizar la pila en la consola

1. Ejecuta el empaquetado anterior y confirma que se generó `Proyecto_Infra/template.packaged.yaml`.
2. Abre **CloudFormation → Stacks → `Proyectoinfrainicial` → Update** y carga `template.packaged.yaml`.
3. Crea un change set y revisa las rutas, funciones y recursos que AWS propone eliminar. Incluye `CAPABILITY_NAMED_IAM` cuando AWS lo solicite.
4. Ejecuta el change set y espera `UPDATE_COMPLETE`; después verifica las seis rutas y las tres Lambdas.

La tabla de metas tiene `DeletionPolicy: Retain`, así que AWS conservará sus datos al separarla de la pila. El bucket del sitio y CloudFront se actualizan por separado: compila `frontend`, carga `frontend/dist/` a S3 e invalida `/*` en CloudFront.

## Alcance

Los datos se ingresan manualmente; no hay conexión con instituciones bancarias ni almacenamiento de PAN/CVV. Las metas, reportes mensuales y avisos se retiraron de esta versión. Es una demostración académica; los costos dependen del uso y deben revisarse en AWS Billing.
