# Backend serverless

Este directorio contiene el código que ejecuta AWS Lambda. La interfaz de usuario está en `../frontend/`; la definición de los recursos AWS está en `../Proyecto_Infra/`.

## Movimientos

1. El navegador llama a `GET /transactions` o `POST /transactions` desde `frontend/src/services/api.js` y adjunta el token de Cognito.
2. API Gateway verifica el JWT y entrega la solicitud a `DemoFunction`.
3. `src/transactions/handler.py` obtiene el usuario autenticado, valida el movimiento y consulta o escribe en DynamoDB.
4. Lambda devuelve JSON a API Gateway, que responde al navegador.

## Presupuestos

`src/budgets/handler.py` implementa `GET /budgets?month=YYYY-MM` y `POST /budgets`. La identidad viene del JWT validado por API Gateway; el cliente no envía `userId`. Los presupuestos se guardan en `BudgetsTable`, con claves `userId` y `budgetKey` (`mes#categoría`). El POST crea o actualiza el límite para esa categoría y mes.

CloudFormation agrega `BudgetsFunction`, su rol IAM con acceso solo a `BudgetsTable`, el grupo de logs y las rutas protegidas por el mismo autorizador JWT de Cognito.

El backend usa Lambda, por eso no mantiene un servidor Express encendido ni requiere EC2. Presupuestos es el segundo dominio; tarjetas y avisos aún no tienen endpoints ni almacenamiento en AWS.

## Mantener el código y la plantilla alineados

El despliegue usa CloudFormation con `ZipFile`. Los archivos Python de esta carpeta son la fuente editable; antes de subir `Proyecto_Infra/template.yaml` a CloudFormation, sincronízalos con:

```powershell
node backend/scripts/sync-lambda-source.mjs --write
```

Para comprobar que no haya diferencias sin modificar archivos:

```powershell
node backend/scripts/sync-lambda-source.mjs
```

Después de sincronizar, CloudFormation despliega la lógica Python actualizada y los recursos definidos en la plantilla. El sincronizador conserva la Lambda de movimientos y agrega la Lambda y tabla de presupuestos cuando se actualiza la pila.
