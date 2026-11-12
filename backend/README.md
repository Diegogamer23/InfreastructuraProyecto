# Backend serverless

El frontend llama a API Gateway desde `frontend/src/services/api.js`. Amazon Cognito entrega un JWT de sesión y API Gateway valida el token antes de invocar una función. Cada handler deriva el `userId` del claim validado `sub` y usa un rol IAM independiente.

## Funciones y rutas

| Carpeta fuente | Lambda desplegada | Rutas | Tabla(s) |
|---|---|---|---|
| `src/transactions/handler.py` | `Proyectoinfrainicial-DemoFunction` | `GET/POST /transactions` | `TransactionsTable` |
| `src/budgets/handler.py` | `Proyectoinfrainicial-BudgetsFunction` | `GET/POST /budgets` | `BudgetsTable` |
| `src/cards/handler.py` | `Proyectoinfrainicial-CardsFunction` | `GET/POST /cards` | `CardsTable` |

Las tres funciones usan Python 3.12 y el handler `handler.handler`. Sus carpetas contienen el módulo `handler.py`; AWS CLI las empaqueta como ZIP antes de actualizar CloudFormation.

## Tablas

| Tabla | Clave de partición | Clave de ordenación | Capacidad |
|---|---|---|---|
| `Proyectoinfrainicial-TransactionsTable-1ODW83QPL6141` | `userId` | `transactionId` | `PAY_PER_REQUEST` |
| `Proyectoinfrainicial-BudgetsTable-7V3OBYTQDKGO` | `userId` | `budgetKey` (`YYYY-MM#categoría`) | `PAY_PER_REQUEST` |
| `Proyectoinfrainicial-CardsTable` | `userId` | `cardId` | `PAY_PER_REQUEST` |

El grupo de logs de cada función tiene retención de siete días. La plantilla administra tres tablas, tres funciones, sus roles/permisos, API Gateway y Cognito. Al actualizar la pila para retirar metas, `GoalsTable` se conserva por `DeletionPolicy: Retain` y queda fuera de CloudFormation.

## Empaquetar las Lambdas

Los archivos `src/*/handler.py` son las fuentes editables. La propiedad `Code` de cada Lambda apunta a su carpeta local y requiere empaquetarse antes de usar CloudFormation. Desde la raíz del repositorio, con AWS CLI autenticado y un bucket privado existente en `us-east-1`:

```powershell
$bucketArtefactos = "NOMBRE_DE_BUCKET_PRIVADO_EN_US_EAST_1"
aws cloudformation package --template-file Proyecto_Infra/template.yaml --s3-bucket $bucketArtefactos --s3-prefix finanzas-claras/lambda --output-template-file Proyecto_Infra/template.packaged.yaml --region us-east-1
```

El comando sube los paquetes ZIP y crea `Proyecto_Infra/template.packaged.yaml` con sus ubicaciones S3. Carga esa plantilla empaquetada en CloudFormation; no cargues la plantilla fuente sin empaquetar.

## Despliegue

Consulta el procedimiento completo en [`../Proyecto_Infra/README.md`](../Proyecto_Infra/README.md). En AWS Console se usa CloudFormation, se revisa el change set y se ejecuta solo si los cambios son los esperados. La plantilla requiere `CAPABILITY_NAMED_IAM`.

## Seguridad

- Las seis rutas requieren JWT del User Pool Cognito.
- El `userId` se obtiene de `requestContext.authorizer.jwt.claims.sub`, no del cuerpo de la solicitud.
- Cada función tiene un rol IAM propio, con acciones DynamoDB limitadas a las tablas que utiliza y permisos para sus logs.
- Las tarjetas solo guardan nombre, emisor, límite, saldo y días de corte/pago. No se guardan PAN ni CVV.
- Nunca añadas access keys, claves secretas, contraseñas o JWT al frontend ni al repositorio.
