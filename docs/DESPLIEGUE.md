# TicketPass Studio desplegado en AWS Academy

Fecha: 17 de noviembre de 2026. Regi?n: us-east-1. Stack: ticketpass-studio-dev (UPDATE_COMPLETE).

- Web: http://ticketpass-studio-dev-frontendbucket-e0ol2hcafio7.s3-website-us-east-1.amazonaws.com/
- Cat?logo p?blico: http://ticketpass-studio-dev-frontendbucket-e0ol2hcafio7.s3-website-us-east-1.amazonaws.com/#/catalog
- API: https://b6x871pysg.execute-api.us-east-1.amazonaws.com/dev
- Demostraci?n p?blica: http://ticketpass-studio-dev-frontendbucket-e0ol2hcafio7.s3-website-us-east-1.amazonaws.com/#/catalog/evt_399e6266713c0791740c

El evento de demostraci?n es ficticio. No se venden entradas reales. Crea tu propia cuenta desde la web; no se publican credenciales de demostraci?n.

## Pruebas realizadas en AWS

- API /health: 200, DynamoDB activo, Groq configurado y extracci?n b?sica desactivada.
- Registro, creaci?n del borrador y carga del PDF ficticio mediante URL firmada a S3: correctos.
- Ejecuci?n real de Step Functions: SUCCEEDED.
- Groq detect? las dos fechas del PDF con evidencia verificable.
- Aplicaci?n de la revisi?n y publicaci?n humana expl?cita: correctas.
- Chat del evento devolvi? citas de los documentos.
- CSV descargado correctamente (1176 bytes).
- ?ndice p?blico de S3: HTTP 200; preflight CORS de la API: 200 con el origen exacto del sitio.
- FilesBucket mantiene las cuatro opciones de bloqueo p?blico activadas. Consultar una importaci?n sin sesi?n devuelve 401.

No se verific? visualmente la web desplegada porque el host del navegador de esta sesi?n no estaba disponible. La interfaz se hab?a comprobado previamente en local. No se han realizado pruebas de carga, entrevistas de UX o auditor?a de seguridad comercial.

## Restricci?n del laboratorio

El rol de Academy no permite cloudfront:CreateDistribution ni cloudfront:CreateOriginAccessControl. Por ello el frontend est? publicado como sitio est?tico HTTP de S3, al igual que el taller; CloudFront no se ha creado. Es una demostraci?n acad?mica, no un sitio de producci?n para datos reales. El backend usa HTTPS. Con permisos adecuados se puede pasar a S3 privado + CloudFront HTTPS.

La web no depende de EC2 ni de la laptop. Su disponibilidad depende de las condiciones y recursos que conserve AWS Academy. Las credenciales del laboratorio y la clave de Groq no est?n incluidas en Git ni en este informe.
