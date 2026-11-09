# Finanzas Claras — frontend

Interfaz React para la aplicación de salud financiera. El frontend se comunica con los servicios del backend definidos en `../Proyecto_Infra/template.yaml`.

## Módulos

- `src/pages/`: login, registro, confirmación, resumen, movimientos, presupuestos, tarjetas y avisos; cada pantalla tiene su propio archivo.
- `src/components/`: distribución, navegación, protección de rutas y estados compartidos.
- `src/auth/`: estado de sesión y operaciones de Amazon Cognito.
- `src/services/api.js`: llamadas HTTP autenticadas a API Gateway.
- `src/hooks/useTransactions.js`: carga y actualización de movimientos.

El flujo desplegado y comprobado desde la interfaz es registro e inicio de sesión con Cognito, más consulta y creación de movimientos por API Gateway, Lambda y DynamoDB. Presupuestos ya tiene pantalla, Lambda y tabla definidos en el código local; falta desplegar la actualización de CloudFormation. Tarjetas y avisos son módulos posteriores y aún no guardan datos en AWS.

## Preparar el entorno local

1. Instala Node.js y npm.
2. En esta carpeta, instala las dependencias con `npm install`.
3. Copia `.env.example` como `.env.local` y conserva los valores correctos del entorno AWS del equipo.
4. Inicia la interfaz con `npm run dev` y abre la dirección local que muestre Vite.

No agregues credenciales de IAM ni claves de acceso de AWS al frontend. Los identificadores del User Pool y del cliente web son configuración pública; el usuario inicia sesión en Cognito y la aplicación envía el token JWT a API Gateway.

## Comprobaciones locales

- `npm run lint`
- `npm run build`

El despliegue del sitio en S3/CloudFront y la ampliación de la API son pasos de infraestructura separados.
