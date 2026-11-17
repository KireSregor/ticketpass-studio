# Despliegue previsto en AWS Academy

## Estado

La plantilla existe y puede validarse estáticamente. El despliegue en una cuenta real y sus permisos deben verificarse con las credenciales del laboratorio. No se incluye ninguna credencial.

## Recursos

| Componente | Recurso |
|---|---|
| Autenticación | AuthApi Lambda + AuthTable (usuarios, sesiones y metadatos privados de archivos) |
| Eventos y catálogo | EventsApi Lambda + EventsTable |
| Importaciones y reportes | ImportsApi Lambda + ImportsTable |
| Documentos | FilesBucket S3 privado, cargas firmadas con vencimiento |
| Coordinación | ImportWorkflow Step Functions Standard |
| Etapas | ExtractPdf → EvaluateDocument → GenerateReport; errores a MarkFailure |
| Frontend | FrontendBucket privado, CloudFront opcional para HTTPS |

Cada Lambda de API atiende solo las rutas de su servicio (`SERVICE_NAME`). En local, una única app reúne esas rutas para facilitar las pruebas. La verificación de sesión y propiedad se ejecuta en el backend en ambas modalidades.

Las tareas del workflow acceden a la capa de almacenamiento compartida de Importaciones; **no existe un endpoint público del agente**. Esta es una simplificación frente al diagrama de planificación que mostraba una API de agente independiente. Se mantienen las APIs de Eventos e Importaciones con sus bases de datos propias y la orquestación con Step Functions.

Los candidatos quedan separados del evento. El organizador los aplica mediante `POST /importaciones/{id}/aplicar` con versión esperada. Publicar es una llamada diferente, explícita y autenticada.

## Requisitos del laboratorio

- AWS CLI y AWS SAM CLI. Docker para `sam build --use-container`, que empaqueta dependencias Python para Linux.
- Credenciales temporales vigentes y región `us-east-1`.
- Un rol existente (por defecto `LabRole`) con permisos de DynamoDB, S3, Lambda y Step Functions para los recursos del stack.
- Su trust policy debe admitir los servicios Lambda y Step Functions. El stack no modifica ese rol ni crea políticas amplias automáticamente.
- CloudFormation debe poder crear los recursos declarados y pasar el rol a los servicios.
- Salida HTTPS de Lambda a Groq. Las tareas no se conectan a una VPC.
- CloudFront es opcional; si no está permitido, el frontend puede ejecutarse localmente contra la API AWS. El bucket permanece privado.

Si Step Functions no está permitido, el nivel 4 no queda validado. No se presenta la ejecución local como evidencia de ejecución AWS.

## Pasos

Desde la raíz:

```text
sam validate --lint
sam build --use-container
sam deploy --guided
```

Indicar región y nombre de stack. Configurar `LabRoleName`, `FrontendOrigin` y la clave `GroqApiKey` mediante el formulario/prompt seguro de despliegue, no en argumentos visibles de shell. La clave se declara `NoEcho` y solo se entrega a la función EvaluateDocument. No versionar parámetros con secretos. También puede configurarse después en las variables de entorno de esa Lambda desde la consola autorizada.

Outputs: `ApiUrl`, `WorkflowArn`, `FrontendBucketName` y, si se habilitó, `FrontendUrl`.

Para probar desde Vite local, guardar en `frontend/.env.local`:

```dotenv
VITE_API_BASE=https://ID.execute-api.us-east-1.amazonaws.com/dev
```

Para hosting HTTPS:

1. Desplegar con `EnableCloudFront=true` si está permitido.
2. Obtener `FrontendUrl` y actualizar `FrontendOrigin` a ese origen exacto. Redeploy para actualizar CORS de API y S3.
3. Configurar `VITE_API_BASE` y ejecutar `npm run build`.
4. Subir el contenido de `frontend/dist` al bucket frontend devuelto por el stack. No subir `.env` ni los documentos privados a ese bucket.
5. Abrir la URL HTTPS e invalidar la caché de `index.html` cuando se publique una versión nueva.

S3 website no ofrece HTTPS; esta plantilla utiliza S3 privado como origen de CloudFront, no un website público HTTP.

## Persistencia y estados

Las tablas contienen `id`, `organizerId`, `createdAt`, `version` y `data` (JSON). El índice `ByOwner` permite listar recursos de un organizador. La representación JSON facilita compartir lógica local/AWS en este MVP; no es un esquema optimizado para todo tipo de consultas. AuthTable activa TTL en `expiresAt`; la API valida además el vencimiento de la sesión en cada petición.

- Evento: BORRADOR / PUBLICADO.
- Importación: EN_PROCESO / LISTA / REQUIERE_REVISION / FALLIDA.
- Etapa: QUEUED / EXTRACT / ANALYZE / REPORT / DONE / FAILED.
- Reporte: READY / PENDING. Un fallo de CSV no borra los candidatos.

Reintentos de Groq acotados en Step Functions. Los errores de documento no se reintentan. Las tareas reutilizan resultados ya persistidos; el inicio usa una clave de idempotencia. El timeout global necesita monitorización operativa antes de uso comercial; no se ha probado cancelación o interrupción del servicio AWS.

## Costos

La plantilla no crea presupuesto ni una estimación en Calculator. Deben medirse transiciones, solicitudes, tiempos Lambda, unidades DynamoDB, objetos/tráfico S3, logs, hosting y tokens Groq. Las cifras de la presentación son supuestos previos, no una factura ni costo validado de este despliegue.

Fuentes: [SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html), [Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html), [S3 firmado](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html), [Groq JSON Schema](https://console.groq.com/docs/structured-outputs).


Actualización: el chat privado usa ChatApi (`POST /asistente/{event_id}`), independiente del procesamiento de PDF con Step Functions. ChatApi y EvaluateDocument reciben GROQ_API_KEY. El chat usa el contexto del evento autorizado sin guardar historial conversacional; no modifica eventos ni publica.
