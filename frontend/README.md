# Finanzas Claras — frontend

Interfaz React de la aplicación financiera. La autenticación usa Amazon Cognito y las llamadas autenticadas llegan al backend mediante API Gateway HTTP API.

## Secciones

- `src/pages/`: inicio de sesión, registro, confirmación, dashboard, movimientos, presupuestos y tarjetas.
- `src/auth/`: contexto de sesión, registro, confirmación, login y logout de Cognito.
- `src/services/api.js`: cliente HTTP que adjunta el JWT a API Gateway.
- `src/components/`: navegación, protección de rutas y pantallas de carga.
- `src/hooks/`: estado y consulta de movimientos.

La aplicación trabaja con datos capturados manualmente. No se conecta a bancos, procesa pagos ni solicita números de tarjeta o CVV.

## Configurar el entorno

Requiere Node.js y npm.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Configura `.env.local` con los identificadores públicos de Cognito y el endpoint de API del entorno. No agregues claves IAM, secretos, contraseñas ni tokens. `.env.local` está excluido de Git.

## Verificar y compilar

```powershell
npm run lint
npm run build
```

Vite escribe el sitio estático en `dist/`. Para publicarlo, carga el contenido de `dist/` al bucket S3 del sitio y crea una invalidación `/*` en CloudFront. El bucket y la distribución se administran aparte de la plantilla principal de CloudFormation.
