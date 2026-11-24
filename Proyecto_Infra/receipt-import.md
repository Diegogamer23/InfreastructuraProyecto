# Tickets y gastos desde una foto

## Qué hace

La persona toma una foto, selecciona un archivo o comparte un ticket desde otra aplicación. Finanzas Claras lo lee y prepara un borrador con datos reconocidos. Antes de guardarlo, la persona confirma o corrige el monto, el comercio y la fecha. El ticket queda asociado al movimiento para poder consultarlo después.

## Flujo técnico

1. La persona inicia sesión con Cognito. El frontend presenta el token al API Gateway, igual que en las rutas actuales.
2. `POST /receipts/upload-url` llega a `DemoFunction`. La función crea un identificador y firma una carga directa a S3 que expira en cinco minutos, limitada a 10 MB y a un tipo de archivo permitido.
3. El navegador carga el archivo directamente en `ReceiptsBucket`, sin pasar los bytes por API Gateway ni Lambda.
4. `POST /receipts/analyze` vuelve a `DemoFunction`. La función verifica que el archivo exista bajo la carpeta de la persona autenticada y llama a Textract `AnalyzeExpense`.
5. El frontend muestra los campos sugeridos. La persona los revisa y guarda el gasto usando `POST /transactions`, la ruta ya existente. DynamoDB guarda el movimiento y el `receiptId`, no una copia de la imagen.
6. Para mostrar el archivo después, `GET /receipts/{receiptId}` valida la propiedad y entrega una URL de lectura temporal de cinco minutos.

La recepción desde el menú nativo de compartir usa el estándar [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target). Para aparecer como destino, Finanzas Claras debe estar instalada como aplicación web y el navegador debe admitir esa función. La captura con cámara y la selección normal del archivo no dependen de instalarla. El archivo compartido se conserva temporalmente en el almacenamiento local del navegador hasta que se abra el formulario, y se consume una sola vez; el frontend rechaza archivos mayores de 10 MB o con más de 30 minutos de antigüedad.

## Alcance y seguridad

- Una imagen JPG/PNG o un PDF de una sola página, con máximo de 10 MB. No se incluyen tickets multipágina ni lotes.
- S3 es privado, bloquea políticas de acceso público, cifra en reposo y elimina objetos con prefijo `receipts/` después de 30 días.
- La API requiere el JWT de Cognito. `userId` se toma del claim `sub`; no se confía en un identificador enviado por el navegador.
- Las operaciones de S3 y Textract las hace la Lambda con su rol IAM, limitado al prefijo de tickets de este bucket y a `textract:AnalyzeExpense`.
- Las cargas usan una política prefirmada de S3 con tipo y tamaño del archivo acotados. No se guardan claves AWS en el frontend.
- Los tickets pueden contener información personal o financiera. No se imprime en CloudWatch el texto reconocido; conviene avisar a la persona del almacenamiento temporal y permitir eliminar el ticket asociado en una iteración posterior.
- Textract puede equivocarse, sobre todo con fotos borrosas, totales ambiguos o formatos poco comunes. La app deja el monto sin rellenar cuando la confianza del total es menor a 65 o cuando detecta otra moneda; por eso no se crea un movimiento sin confirmación.
- Las rutas, el bucket, las nuevas reglas IAM y el timeout de la integración están en `template.yaml`; están pendientes de despliegue. No se deben tratar como disponibles en el sitio publicado hasta aplicar el change set y publicar el frontend actualizado.

## Estimación de costo

La llamada nueva de mayor impacto por uso es Textract `AnalyzeExpense`, que cobra por página procesada. Consulta realizada el 24 de noviembre de 2026: la página pública de precios de AWS muestra un ejemplo de **US West (Oregon)** a **USD 0.01 por página** para el primer millón de páginas al mes; las cifras siguientes son una referencia lineal con esa tarifa:

| Tickets de una página analizados al mes | Referencia de Textract por mes |
|---:|---:|
| 100 | USD 1 |
| 1,000 | USD 10 |
| 10,000 | USD 100 |

Esas cifras **no son una cotización para `us-east-1`**. El precio real debe confirmarse para la región y fecha de despliegue en [AWS Pricing Calculator](https://calculator.aws/). AWS publica actualmente un nivel gratuito de hasta 100 páginas de Analyze Expense por mes durante tres meses para clientes nuevos; no es un beneficio permanente y la cuenta del proyecto podría no ser elegible. Cada ticket se analiza solo cuando la persona pulsa para leerlo; volver a analizarlo genera otra página cobrada.

También habrá cargos de S3 por almacenamiento, solicitudes y transferencia; Lambda y API Gateway por uso; y CloudWatch por registros. El ciclo de vida de 30 días limita cuánto tiempo se acumulan fotos, pero no elimina los cargos de análisis. La app no mantiene un servidor encendido. Si el volumen crece, vigilar gasto real en Cost Explorer, poner alertas con AWS Budgets y revisar cuántas veces se procesa cada archivo.

Referencia: [precios oficiales de Textract](https://aws.amazon.com/textract/pricing/), [API AnalyzeExpense](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeExpense.html) y [procesamiento síncrono](https://docs.aws.amazon.com/textract/latest/dg/sync.html). La API síncrona trabaja con documentos de una página y tiene máximo de 10 MB; esta primera versión acepta JPG/PNG o PDF de una sola página y máximo 10 MB.

## Qué falta para que quede activo

1. Compilar y publicar el frontend actualizado en el bucket del sitio e invalidar CloudFront.
2. Revisar en CloudFormation el change set de `template.yaml`, incluyendo el nuevo bucket, el cambio de CORS y el timeout de `DemoFunction`; desplegarlo en `us-east-1` si el equipo lo aprueba.
3. Configurar `WebAppOrigin` con el dominio real. Si cambia el dominio, el bucket de tickets debe permitir el origen correcto para la carga directa.
4. Probar con una cuenta de demostración, un ticket sintético y una cuenta de bajo riesgo; confirmar autorización, aislamiento entre usuarios, revisión manual, enlace temporal, borrado a 30 días y presupuesto/alertas antes de invitar usuarios.

Este cambio de documentación y código en GitHub no despliega ni crea recursos en AWS por sí mismo.
