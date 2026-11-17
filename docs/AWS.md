# Despliegue con Serverless Framework en AWS Academy

La configuración única de infraestructura es `serverless.yml`. No requiere SAM ni Docker. Serverless Framework está fijado a 3.40.0 en package-lock.json para este laboratorio; la actualización del framework debe evaluarse antes de uso comercial.

## Recursos

API Gateway REST, AuthApi, EventsApi, ImportsApi y ChatApi en Lambda; tablas EventsTable, ImportsTable y AuthTable; documentos privados en S3; Step Functions Standard con ExtractPdf → EvaluateDocument → GenerateReport y MarkFailure. El frontend usa un bucket privado y CloudFront opcional. El chat consulta el evento autorizado sin memoria de mensajes ni permisos de publicación. La publicación sigue siendo una acción autenticada y explícita del organizador.

Se reutiliza el rol existente LabRole; no se crean roles IAM nuevos. El laboratorio debe permitir pasar ese rol y su trust policy debe admitir Lambda y Step Functions. Las credenciales temporales deben estar vigentes. La región por defecto es us-east-1.

## Preparación (sin Docker)

Requisitos: Node.js 20+, Python 3.12+ y AWS CLI con el perfil del laboratorio configurado localmente. Desde la raíz:

```powershell
npm ci
python scripts/package_backend.py
python scripts/prepare_deployment_bucket.py --region us-east-1
npx serverless package --stage dev --region us-east-1 --param="deploymentBucket=NOMBRE_BUCKET"
```

El script descarga únicamente wheels para Python 3.11 / Linux x86_64 y crea `.build/backend.zip`. No copia entornos Windows, tests, archivos .env ni datos de organizadores. Si Python no está en PATH, usa la ruta absoluta del intérprete instalado. `.build/`, `.serverless/` y `node_modules/` están excluidos de Git.

Antes de desplegar, comprobar identidad y rol con `aws sts get-caller-identity` y la consola del laboratorio. Un empaquetado correcto no verifica permisos efectivos, saldo, conectividad o cuotas de AWS.

## Clave Groq

La clave se entrega mediante la variable de entorno GROQ_API_KEY del proceso de despliegue. No escribirla en el comando ni en serverless.yml. Ejemplo para introducirla sin eco en PowerShell:

```powershell
$groqSecure = Read-Host 'Clave Groq' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $groqSecure).Password
npx serverless deploy --stage dev --region us-east-1 --param="deploymentBucket=NOMBRE_BUCKET"
Remove-Item Env:GROQ_API_KEY
```

Serverless pasa el valor al parámetro CloudFormation GroqApiKey, marcado NoEcho. Solo ChatApi y EvaluateDocument lo reciben. Los artefactos locales de `.serverless/` pueden contener parámetros sensibles: no publicarlos ni compartirlos. No ejecutar `serverless print` con claves reales configuradas. Sin clave, las revisiones fallan de forma explícita; la ficha manual sigue funcionando.

## Despliegue

```powershell
npx serverless deploy --stage dev --region us-east-1 --param="deploymentBucket=NOMBRE_BUCKET"
npx serverless info --stage dev --region us-east-1
```

Parámetros opcionales: `--param="labRole=LabRole"`, `--param="frontendOrigin=https://tu-dominio"`, `--param="cloudFront=true"`. CloudFront solo debe habilitarse si el laboratorio lo permite. El stage predeterminado es dev; cambiarlo crea otro stack.

Outputs: ApiUrl, WorkflowArn, FrontendBucketName y FrontendUrl cuando CloudFront está habilitado. Para pruebas locales, configurar `frontend/.env.local` con `VITE_API_BASE=<ApiUrl>` y reiniciar Vite. Los eventos locales no se migran automáticamente a DynamoDB.

Para hosting HTTPS: desplegar con CloudFront, obtener FrontendUrl, volver a desplegar con frontendOrigin igual a ese origen exacto (CORS de API y S3), compilar frontend con VITE_API_BASE de AWS y subir únicamente frontend/dist al bucket frontend. Los PDF privados nunca se suben a ese bucket.

## Validación pendiente en AWS

El paquete puede validarse localmente sin crear recursos. Falta comprobar el despliegue real, permisos del rol, salida a Groq, ejecución de Step Functions, carga firmada a S3 y consulta de resultados en la web. Si Step Functions no está permitido, no se considera demostrado el nivel 4.

El chat mantiene el límite de 10 consultas por minuto por organizador. El API Gateway generado usa las cuotas de la cuenta; no se ha configurado un límite global adicional de stage en esta versión.

Fuentes: [recursos de Serverless](https://www.serverless.com/framework/docs/providers/aws/guide/resources), [empaquetado](https://www.serverless.com/framework/docs/providers/aws/guide/packaging).

Lambda utiliza Python 3.11, compatible con la versión fijada de Serverless Framework. El script puede ejecutarse con un Python local 3.12 o superior porque descarga los wheels de destino explícitamente.


## Primer despliegue y bucket de artefactos

`prepare_deployment_bucket.py` utiliza las credenciales est?ndar de boto3/AWS CLI y devuelve el nombre del bucket. Reemplaza NOMBRE_BUCKET por ese resultado. El bucket queda privado y cifrado. Es externo al stack, se reutiliza entre despliegues y no debe eliminarse mientras el stack lo utilice. Evita el fallo inicial de Serverless 3 al pasar stackParameters a su plantilla provisional de bootstrap.

## Hosting de la web cuando Academy no permite CloudFront

Si el rol no permite CloudFront, puede habilitarse exclusivamente el sitio est?tico p?blico de S3 con `--param="publicWebsite=true"`. Esto publica solo el bucket FrontendBucket mediante GET; FilesBucket, documentos y reportes permanecen privados. El sitio S3 es HTTP, no HTTPS; no es una soluci?n para producci?n con datos reales. CloudFront se mantiene como opci?n HTTPS cuando la cuenta tenga permisos.

Despu?s del primer despliegue, consulta FrontendBucketName y configura frontendOrigin al origen HTTP exacto del sitio. Vuelve a desplegar usando los mismos par?metros, deploymentBucket y clave Groq. Compila frontend con VITE_API_BASE=ApiUrl y sube solo frontend/dist a FrontendBucket. No subas .env ni archivos locales de usuarios. Revisar tanto CORS de API como CORS de S3.
