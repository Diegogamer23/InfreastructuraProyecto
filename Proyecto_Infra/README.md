# Finanzas Claras — avance funcional Serverless

**Estado del despliegue:** <code>UPDATE_COMPLETE</code><br>
**Fecha de verificación:** 5 de noviembre de 2026 (hora de Cancún)<br>
**Región:** <code>us-east-1</code> (US East, N. Virginia)<br>
**Pila:** <code>Proyectoinfrainicial</code><br>

## Alcance logrado en este avance

Se integró y probó un flujo funcional para registrar y consultar movimientos de demostración:

**Cliente firmado con IAM → API Gateway HTTP API → Lambda → DynamoDB → respuesta HTTP**

La aplicación puede crear un movimiento con <code>POST /transactions</code> y consultarlo con <code>GET /transactions?userId=demo-user</code>. Las dos rutas requieren autenticación AWS IAM con Signature Version 4 (SigV4). Una solicitud sin firmar recibió <code>403</code>, como se esperaba.

Esta entrega comprueba una funcionalidad de extremo a extremo. El dashboard S3 y el inicio de sesión Cognito todavía no forman parte del despliegue actual. Se usaron datos ficticios; no ingresen información financiera real.

## Arquitectura desplegada

~~~mermaid
flowchart LR
    Client[Postman o cliente de prueba]
    IAM[Grupo IAM Proyecto_Infraestructura<br/>4 integrantes]
    API[API Gateway HTTP API<br/>GET y POST /transactions<br/>Autorización AWS_IAM SigV4]
    Lambda[Lambda DemoFunction<br/>Python 3.12]
    Role[LambdaExecutionRole<br/>PutItem y Query limitados a la tabla]
    DDB[(DynamoDB TransactionsTable<br/>PK userId, SK transactionId<br/>PAY_PER_REQUEST)]
    Logs[CloudWatch Logs<br/>retención 7 días]
    CFN[CloudFormation<br/>Proyectoinfrainicial]

    Client -->|solicitud SigV4| API
    IAM -. permiso para invocar, heredado de AdministratorAccess .-> API
    API -->|Lambda permission| Lambda
    Lambda -. asume .-> Role
    Role -->|PutItem y Query| DDB
    Lambda -->|logs de ejecución| Logs
    CFN -. administra .-> API
    CFN -. administra .-> Lambda
    CFN -. administra .-> DDB
    CFN -. administra .-> Role
    CFN -. administra .-> Logs

    subgraph Siguiente fase no desplegada
      S3[Dashboard estático en S3]
      Cognito[Amazon Cognito]
      S3 -. interfaz .-> API
      Cognito -. futuro JWT authorizer .-> API
    end
~~~

El archivo fuente del diagrama está en <code>architecture.mmd</code>.

## Componentes y relaciones

| Servicio / recurso | Función y configuración actual | Relación |
|---|---|---|
| AWS CloudFormation | Mantiene la infraestructura como código en <code>template.yaml</code>. La pila está en <code>UPDATE_COMPLETE</code>. | Administra la tabla, la Lambda, el rol, los logs y la API. |
| API Gateway HTTP API | Endpoint <code>https://3wsywaa6oh.execute-api.us-east-1.amazonaws.com</code>. Tiene <code>POST /transactions</code> y <code>GET /transactions</code>; ambas rutas usan <code>AWS_IAM</code>. | Valida SigV4 y solo entonces invoca Lambda. |
| AWS Lambda | <code>Proyectoinfrainicial-DemoFunction</code>, Python 3.12, memoria 128 MB, timeout 10 s. Maneja las dos rutas. | Usa la variable de entorno <code>TABLE_NAME</code>, escribe y consulta DynamoDB. |
| Amazon DynamoDB | Tabla bajo demanda, cifrado en reposo, clave compuesta <code>userId</code> y <code>transactionId</code>. La consulta de prueba devolvió 6 movimientos de <code>demo-user</code>. | Lambda escribe con <code>PutItem</code> y consulta por <code>userId</code> con <code>Query</code>. |
| AWS IAM | El grupo <code>Proyecto_Infraestructura</code> tiene cuatro integrantes y la política existente <code>AdministratorAccess</code>. El rol de ejecución de Lambda tiene permisos de datos limitados a la tabla. | Los integrantes firman las llamadas con SigV4; Lambda asume su propio rol al trabajar con DynamoDB y CloudWatch. |
| Amazon CloudWatch Logs | Grupo <code>/aws/lambda/Proyectoinfrainicial-DemoFunction</code>, retención de 7 días. | Recibe logs de inicio, fin y errores de Lambda. |

### Modelo de datos

La tabla requiere estas claves en cada elemento:

- <code>userId</code> — clave de partición, de tipo cadena.
- <code>transactionId</code> — clave de ordenamiento, de tipo cadena y única por movimiento.

El movimiento agrega <code>amount</code> (número decimal), <code>type</code>, <code>category</code>, <code>description</code>, <code>date</code> y <code>createdAt</code>. La Lambda usa una fecha UTC y un UUID para que cada movimiento tenga una clave distinta.

### Rutas de la API

| Método y ruta | Autenticación | Resultado comprobado |
|---|---|---|
| <code>POST /transactions</code> | IAM SigV4 | <code>201 Created</code>; guarda el movimiento de demostración. |
| <code>GET /transactions?userId=demo-user</code> | IAM SigV4 | <code>200 OK</code>; devuelve los movimientos del usuario de demostración. |

Para llamar desde Postman, selecciona autenticación **AWS Signature**, región <code>us-east-1</code>, servicio <code>execute-api</code> y usa credenciales locales de IAM. No guardes claves en este repositorio. Las llamadas desde una identidad sin firma se rechazan con <code>403</code>.

## Evidencia de pruebas y métricas

La validación en AWS confirmó:

- <code>POST</code> firmado por IAM: **201**.
- <code>GET</code> firmado por IAM: **200**, y la respuesta incluyó el movimiento creado.
- <code>GET</code> sin firma: **403**, acceso no autorizado rechazado.
- Elementos consultados para <code>demo-user</code>: **6**.
- En la última hora observada: **8 invocaciones Lambda, 0 errores y 0 throttles**.
- Duración Lambda promedio observada: **132.4 ms**; máxima: **293.54 ms**.
- Un POST con monto negativo recibió **400** y no se escribió en DynamoDB.
- CloudWatch Logs devolvió **35 eventos** en la ventana consultada.
- La simulación de políticas permitió GET y POST a los cuatro miembros del grupo IAM; las llamadas firmadas se ejecutaron con el perfil Diego_Villa.

La evidencia JSON de la simulación de acceso IAM está en <code>evidence/13-iam-team-access.json</code>. Los resultados API, métricas, logs y estado de CloudFormation también se guardan en <code>evidence/</code>. El reporte visual está en <code>evidence/reporte-end-to-end.html</code>.

## Problemas técnicos detectados y resueltos

| Problema | Causa encontrada | Corrección | Comprobación |
|---|---|---|---|
| Una nueva escritura podía reemplazar un movimiento anterior. | La primera Lambda usaba siempre <code>demo-transaction-001</code>. | Se genera <code>transactionId</code> con fecha UTC y UUID. | DynamoDB conserva el registro anterior y muestra movimientos nuevos con IDs distintos. |
| La consulta <code>GET</code> no tenía permiso suficiente. | El rol inicial solo permitía <code>dynamodb:PutItem</code>. | Se agregó <code>dynamodb:Query</code> limitado al ARN de la tabla del stack. | <code>GET</code> firmado devuelve <code>200</code> y los movimientos esperados. |
| El clon del repositorio tenía una plantilla con rutas públicas, distinta de la pila activa. | <code>AuthorizationType: NONE</code> no coincide con el despliegue AWS_IAM y podía abrir las rutas en otro despliegue. | Se alineó la plantilla del repositorio con la pila activa; ambas rutas usan <code>AuthorizationType: AWS_IAM</code>. | GET sin firma recibió <code>403</code>; las rutas firmadas funcionaron. |

La IA se utilizó para revisar el código y la política IAM, identificar las causas, proponer las correcciones y preparar casos de prueba. Las verificaciones se realizaron contra los recursos desplegados en AWS.

## Despliegue y seguridad

El archivo <code>template.yaml</code> es la fuente IaC actual. Para actualizar recursos existentes:

1. En CloudFormation, abre <code>Proyectoinfrainicial</code>.
2. Crea un change set usando <strong>Replace existing template</strong> y carga <code>template.yaml</code>.
3. Revisa primero los recursos y la columna de reemplazo. La tabla DynamoDB no debe marcarse para reemplazo.
4. Ejecuta el change set y espera <code>UPDATE_COMPLETE</code>.

No uses credenciales de AWS en el código, en el HTML ni en GitHub. El grupo IAM actual tiene permisos administrativos amplios porque así fue configurado para el equipo; es suficiente para la práctica, pero no es un modelo de mínimo privilegio para producción.

## Costos y límites de este avance

No se usa EC2 ni NAT Gateway. DynamoDB está en modo <code>PAY_PER_REQUEST</code>, Lambda usa 128 MB y el grupo de logs conserva datos siete días. Estos servicios cobran según uso y región; el nivel gratuito depende de la cuenta y de las condiciones vigentes, por lo que no se promete costo cero.

No se desplegaron S3, CloudFront, Cognito, recordatorios, reportes programados ni integración bancaria. La API actual es un prototipo para un usuario ficticio; el siguiente paso para usuarios finales es integrar Cognito como emisor de JWT, obtener el identificador de usuario desde el token y alojar el dashboard en S3. No se deben usar credenciales IAM de larga duración en un navegador.
