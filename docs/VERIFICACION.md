# Verificación del MVP

Fecha: 17 de noviembre de 2026. Entorno: Windows, ejecución local con SQLite y archivos privados locales.

## Realizado

- 18 pruebas automatizadas aprobadas del backend: autenticación y cierre de sesión, aislamiento entre organizadores, publicación y campos públicos, control de versiones, idempotencia, PDFs incompatibles, evidencia literal y escape CSV. Ejecutar `python -m pytest tests -q` en backend.
- Compilación de producción del frontend con `npm run build`.
- Configuración Serverless Framework validada con `serverless package` y plantilla CloudFormation generada validada con cfn-lint.
- Llamada real a Groq con respuesta estructurada, modelo `openai/gpt-oss-120b`. Se corrigió el bloqueo 403 del cliente HTTP enviando User-Agent explícito. No se almacenó la clave en el código ni en este paquete.
- Recorrido en navegador: cuenta ficticia, borrador, carga del PDF de ejemplo, revisión por Groq, detección de dos fechas contradictorias con cita/página, selección del 19/12/2027, guardado y publicación explícita. Se conservó el borrador ante una llamada fallida anterior.
- Verificación visual del escritorio y de la ficha pública; panel y ficha probados también a 390 × 844, sin desbordamiento horizontal y con menú móvil funcional.

## Alcance y pendientes

La ejecución local usa tareas en segundo plano y SQLite. La infraestructura Serverless usa Step Functions, Lambda, API Gateway, DynamoDB y S3. Ya se despleg? en AWS Academy; consultar DESPLIEGUE.md para la evidencia real y las restricciones. La validación estática no verifica esos permisos, conectividad o cuotas.

La colección Postman está preparada, pero no se ha ejecutado dentro de la aplicación Postman. Las pruebas automatizadas equivalentes y el recorrido de navegador no sustituyen las capturas Postman que pide el docente.

No se ha medido ahorro de tiempo, precisión global, usabilidad con organizadores reales ni capacidad bajo carga. No hay OCR, pagos, venta efectiva de entradas, predicción de ventas o correo de resultados. El CSV y la web permiten consultar los resultados. Los límites son 5 MB, 5 páginas, texto seleccionable y 18.000 caracteres.

No afirmar que una extracción exitosa valida todos los documentos. La IA propone y la persona confirma. La publicación contiene solo los campos públicos del formulario.

## Chat añadido

Cinco pruebas adicionales verifican autorización entre organizadores, contexto elegido por servidor, rechazo de cambios de rol, omisión de citas inventadas, respuesta solo con datos guardados, límite de consultas y falta de conexión honesta. Recorrido real con Groq: consulta de fechas del PDF y recuperación de las dos fechas con página. El chat conserva la ficha sin cambios.

Prueba adicional real: una consulta ajena al evento (receta) fue rechazada por el asistente. La carga de un contrato ficticio nuevo no pudo verificarse en navegador: se denegó el permiso de subida. No se sustituyó por otra vía. El ejemplo de contrato está incluido para una prueba manual posterior.

## Ajuste de interfaz

Se eliminó el panel separado de subida. Clip y arrastre se integran en el chat, y los resultados se revisan en una ventana. En navegador se midió la misma posición del cuadro de escritura antes y después de enviar una consulta (756 px en escritorio); el alto del documento coincide con el viewport (883 px), sin desplazamiento exterior. En móvil 390 × 844 el documento mide 390 × 844 y el cuadro permanece visible. La conversación se conserva al abrir Información y volver. Se verificó la compilación del frontend. No se repitió la prueba de subir un archivo, cuyo permiso había sido denegado.

Vista lateral recuperada: en escritorio se muestra la ficha junto al chat, tanto para borradores como para eventos publicados. La página mantiene el alto del viewport (883 px). En 390 × 844 el panel lateral se oculta, no hay desbordamiento y el botón Vista previa abre correctamente la ficha en una ventana. Compilación de producción aprobada.

Acceso desde Backstage añadido: menú Asistente IA y enlace en el banner de Mis eventos. Se verificó búsqueda de evento y apertura del chat seleccionado por la ruta /assistant/{id}; conserva autorización por evento en el backend. Compilación aprobada.

## Migración de la herramienta de despliegue

Se eliminó template.yaml y se adoptó serverless.yml con Serverless Framework 3.40.0, Python 3.11 en Lambda y empaquetado de wheels Linux sin Docker. La caché global de Serverless no fue escribible en este entorno incluso tras autorizarla; para la validación se aisló la caché en work mediante un adaptador de prueba, sin modificar el framework ni el código publicado. `serverless package` y cfn-lint pasaron sin credenciales reales y sin crear recursos AWS.

## Verificaci?n posterior al despliegue

Las pruebas reales del 17/11/2026, incluida una ejecuci?n SUCCEEDED de Step Functions y el chat con Groq, est?n en DESPLIEGUE.md. Se corrigi? el bootstrap de Serverless usando un bucket privado externo de artefactos; las funciones de API tienen timeout de 28 segundos y las tareas del workflow conservan 45 segundos. La opci?n publicWebsite solo afecta al frontend est?tico.


Chat conversacional: 24 pruebas locales aprobadas. Verificado en AWS: saludos y agradecimientos sin llamada al modelo, resumen coloquial del evento y rechazo de consultas ajenas o cambios de instrucciones. Se mantiene la comprobación de citas y el acceso por organizador.
