# Backend serverless

El frontend llama a API Gateway desde `frontend/src/services/api.js`. Amazon Cognito entrega un JWT de sesión y API Gateway valida el token antes de invocar una función. Cada handler deriva el `userId` del claim validado `sub` y usa un rol IAM independiente.

## Funciones y rutas

| Carpeta fuente | Lambda desplegada | Rutas | Tabla(s) |
|---|---|---|---|
| `src/transactions/handler.py` | `Proyectoinfrainicial-DemoFunction` | `GET/POST /transactions` | `TransactionsTable` |
| `src/budgets/handler.py` | `Proyectoinfrainicial-BudgetsFunction` | `GET/POST /budgets` | `BudgetsTable` |
| `src/cards/handler.py` | `Proyectoinfrainicial-CardsFunction` | `GET/POST /cards` | `CardsTable` |
| `src/planning/handler.py` | `Proyectoinfrainicial-PlanningFunction` | `GET/POST /goals`, `GET /notifications`, `GET /reports/monthly` | `GoalsTable`, `TransactionsTable`, `BudgetsTable`, `CardsTable` |

Las cuatro funciones usan Python 3.12. `CardsFunction` usa el handler `index.handler` porque su código se entrega en línea con `Code.ZipFile` de CloudFormation.

## Tablas

| Tabla | Clave de partición | Clave de ordenación | Capacidad |
|---|---|---|---|
| `Proyectoinfrainicial-TransactionsTable-1ODW83QPL6141` | `userId` | `transactionId` | `PAY_PER_REQUEST` |
| `Proyectoinfrainicial-BudgetsTable-7V3OBYTQDKGO` | `userId` | `budgetKey` (`YYYY-MM#categoría`) | `PAY_PER_REQUEST` |
| `Proyectoinfrainicial-CardsTable` | `userId` | `cardId` | `PAY_PER_REQUEST` |
| `Proyectoinfrainicial-GoalsTable-1W00JX2OLNLUI` | `userId` | `goalId` | `PAY_PER_REQUEST` |

El grupo de logs de cada función tiene retención de siete días. La pila CloudFormation `Proyectoinfrainicial` administra las funciones, tablas, roles, permisos, API Gateway y Cognito. Los recursos de tarjetas se importaron a la pila para que las actualizaciones futuras queden controladas por IaC.

## Sincronización de fuente y plantilla

Los archivos `src/*/handler.py` son las fuentes editables. Desde la raíz del repositorio:

```powershell
node backend/scripts/sync-lambda-source.mjs --write
node backend/scripts/sync-lambda-source.mjs
```

`--write` actualiza los bloques inline de `Proyecto_Infra/template.yaml`; sin `--write`, el script verifica que fuente y plantilla sigan sincronizadas. Revisa el diff antes de cargar la plantilla en CloudFormation.

## Despliegue

Consulta el procedimiento completo en [`../Proyecto_Infra/README.md`](../Proyecto_Infra/README.md). En AWS Console se usa CloudFormation, se revisa el change set y se ejecuta solo si los cambios son los esperados. La plantilla requiere `CAPABILITY_NAMED_IAM`.

## Seguridad

- Las diez rutas requieren JWT del User Pool Cognito.
- El `userId` se obtiene de `requestContext.authorizer.jwt.claims.sub`, no del cuerpo de la solicitud.
- Cada función tiene un rol IAM propio, con acciones DynamoDB limitadas a las tablas que utiliza y permisos para sus logs.
- Las tarjetas solo guardan nombre, emisor, límite, saldo y días de corte/pago. No se guardan PAN ni CVV.
- Nunca añadas access keys, claves secretas, contraseñas o JWT al frontend ni al repositorio.
