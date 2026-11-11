# Backend serverless

El navegador llama a API Gateway desde `frontend/src/services/api.js`. AWS Cognito firma cada solicitud con un JWT; API Gateway lo valida antes de invocar la Lambda correspondiente. Las Lambdas obtienen el `userId` del claim `sub` validado y acceden a DynamoDB con roles separados.

## Dominios

### Movimientos

- Código: `src/transactions/handler.py` (fuente sincronizada dentro de `Proyecto_Infra/template.yaml`).
- Función desplegada: `Proyectoinfrainicial-DemoFunction`, Python 3.12, handler `index.handler`.
- API: `GET /transactions`, `POST /transactions`.
- Tabla: `Proyectoinfrainicial-TransactionsTable-1ODW83QPL6141`, claves `userId` y `transactionId`, modo `PAY_PER_REQUEST`.
- IAM: `PutItem` y `Query` sobre esta tabla; permisos de CloudWatch Logs.

### Presupuestos

- Código: `src/budgets/handler.py`, sincronizado con `Proyecto_Infra/template.yaml`.
- Función: `Proyectoinfrainicial-BudgetsFunction`, Python 3.12, handler `index.handler`.
- API: `GET /budgets?month=YYYY-MM`, `POST /budgets`.
- Tabla: `Proyectoinfrainicial-BudgetsTable-7V3OBYTQDKGO`, claves `userId` y `budgetKey` (`mes#categoría`), modo `PAY_PER_REQUEST`.
- IAM: `PutItem` y `Query` limitados a la tabla; permisos de logs.
- El POST crea o actualiza el límite de una categoría para un mes. La app calcula el gasto comparando con movimientos reales.

### Tarjetas

- Código: `src/cards/handler.py`.
- Función: `Proyectoinfrainicial-CardsFunction`, Python 3.12, handler `lambda_function.handler`.
- API: `GET /cards`, `POST /cards`.
- Tabla: `Proyectoinfrainicial-CardsTable`, claves `userId` y `cardId`, modo `PAY_PER_REQUEST`.
- IAM: `GetItem`, `PutItem` y `Query` limitados a la tabla, además de permisos de CloudWatch Logs.
- Estos recursos se configuraron manualmente desde la consola y no están incluidos en la pila CloudFormation actual.

La pantalla de tarjetas solo almacena nombre para identificarla, emisor, límite, saldo actual y días de corte/pago. No solicita número de tarjeta ni CVV. La app calcula avisos de pago en el frontend; no envía correo/SMS/push.

## Sincronizar y desplegar movimientos/presupuestos

Los handlers de transacciones y presupuestos son la fuente editable. Desde la raíz del repositorio:

```powershell
node backend/scripts/sync-lambda-source.mjs --write
node backend/scripts/sync-lambda-source.mjs
```

El primer comando actualiza los bloques inline de `Proyecto_Infra/template.yaml`; el segundo comprueba que estén sincronizados. Luego carga la plantilla con CloudFormation, crea un change set y revísalo antes de ejecutarlo. La plantilla actual no importa ni administra los recursos manuales de tarjetas.

## Seguridad

- API Gateway requiere el autorizador JWT de Cognito en las seis rutas.
- El `userId` no se recibe del cuerpo del navegador: se obtiene de `requestContext.authorizer.jwt.claims.sub`.
- Los roles de ejecución de Lambda deben permitir acciones solo sobre su tabla y su grupo de logs.
- Nunca añadas credenciales IAM, tokens JWT o contraseñas al frontend o al repositorio.
