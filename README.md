# TicketPass Studio

MVP para organizadores: crear un borrador, importar un PDF con texto, comprobar los datos y sus fuentes, guardar la revisión y confirmar la publicación en un catálogo público.

## Qué está implementado

- Frontend React con diseño responsivo: cuenta, eventos, editor, importaciones, vista previa y catálogo.
- Backend FastAPI, sesiones revocables, contraseñas PBKDF2 con salt aleatorio y separación por organizador.
- Persistencia local SQLite y archivos privados. En AWS se selecciona DynamoDB + S3 mediante configuración.
- Lectura real de PDF de hasta cinco páginas y 5 MB, sin cifrar y con texto seleccionable. No incluye OCR.
- Chat privado por evento para consultar su ficha y hasta tres PDF recientes (ficha del evento o contrato). Las respuestas usan datos guardados y fragmentos con página, sin ejecutar acciones.
- Groq sin memoria conversacional. Candidatos por campo con cita literal y página. El backend comprueba citas, valores y límites; el usuario confirma los datos.
- Las propuestas no se aplican automáticamente. Una importación antigua no puede sobrescribir una versión nueva del borrador.
- Publicación manual con validación de fecha futura, campos, precios, cupos y aforo. La ficha pública excluye documentos y análisis internos.
- Historial y CSV protegido contra fórmulas de hoja de cálculo.
- Infraestructura con Serverless Framework: API Gateway, funciones Lambda separadas, tablas propias por servicio, S3 privado y Step Functions Standard.

**No incluye:** pagos reales, compra de entradas, reembolsos, OCR, predicción de demanda ni precios de mercado. Los archivos de ejemplo son ficticios y están identificados como tales.

## Inicio local

Requiere Python 3.12+ y Node.js 20.19+ / 22.12+. Desde la raíz:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
cd frontend
npm ci
```

Terminal del backend, desde `backend/`:

```powershell
..\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

Terminal del frontend, desde `frontend/`:

```powershell
npm run dev
```

Abrir **http://127.0.0.1:5173/**. Crea una cuenta de prueba en la interfaz. No se distribuyen cuentas ni contraseñas predefinidas. Las sesiones duran 12 horas y se guardan en `sessionStorage`; cerrar sesión las invalida en el servidor.

Si `python` abre Microsoft Store, usa la ruta de un Python instalado o la del runtime disponible en Codex. Los comandos también funcionan con esa ruta absoluta en lugar de `python`.

### Activar Groq

Puedes ejecutar `scripts/Configurar-IA.ps1` para introducir la clave de forma oculta. El script guarda `.env` en la raíz, excluido de Git. Alternativamente copia `.env.example` como `.env` y completa `GROQ_API_KEY`. Reinicia el backend.

El modelo por defecto es `openai/gpt-oss-120b`, configurable por `GROQ_MODEL`. La cuenta y el modelo deben permitir JSON Schema. No se guardan claves en el frontend ni en las respuestas de la API. El despliegue recibe GROQ_API_KEY del entorno; ver docs/AWS.md.

Sin clave, el modo local puede usar `ALLOW_BASIC_EXTRACTION=true`: busca etiquetas explícitas como `Evento:`, `Fecha:` o `Lugar:`. **No es IA y la interfaz lo advierte.** En AWS está desactivado por defecto. Una revisión fallida conserva el borrador y permite completarlo manualmente.

## Demostración

1. Crear una cuenta y pulsar **Crear evento**.
2. En Asistente, seleccionar **Probar un PDF de ejemplo**. El PDF incluido tiene dos fechas distintas.
3. Ver los candidatos y sus páginas. Elegir los valores que quieras utilizar.
4. Abrir **Revisar datos encontrados** en el chat y pulsar **Guardar revisión** para confirmar. El original y el reporte permanecen privados.
5. Revisar Entradas y completar campos ausentes.
6. Abrir Revisar y publicar. Guardar cambios antes de publicar.
7. Confirmar la publicación y abrir la ficha pública.
8. Abrir Importaciones y descargar el CSV.

El ejemplo usa una fecha futura de 2027. Si se utiliza después de esa fecha, cambiarla manualmente antes de publicar.

## Pruebas

```powershell
.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
cd backend
..\.venv\Scripts\python.exe -m pytest tests -q
```

Desde frontend: `npm run build`. `docs/VERIFICACION.md` distingue pruebas realizadas de comprobaciones pendientes. `/docs` ofrece OpenAPI interactivo en la ejecución local. También hay una colección Postman en `docs/TicketPass.postman_collection.json`.

## Datos y archivos

Por defecto se guardan en `.local/` y sobreviven a reinicios. `DATA_DIR` permite cambiarlos. No incluir esa carpeta, `.env`, sesiones, credenciales o claves en Git o en el paquete de entrega. Almacenamiento privado y público se separan en la API; CORS no reemplaza la autorización.

## AWS Academy

Ver `docs/AWS.md`. `serverless.yml` define el despliegue; **no significa que esté desplegado ni que el laboratorio tenga permisos**. Antes de publicar en AWS, comprobar el rol existente, credenciales temporales, saldo, acceso a Step Functions y salida a Groq.

## Relación con el trabajo anterior

Referencia funcional y tecnológica:

- https://github.com/jesusda01/ticketpass
- https://github.com/jesusda01/proyecto-ticketpass-chat-ia
- https://github.com/utec-cdia-v5/workflow_ia

Se conserva la marca, el dominio de eventos y el enfoque React/Python/serverless. Esta implementación nueva sustituye el chat con memoria por un flujo de publicación; no usa los modelos entrenados con datos sintéticos del proyecto anterior. Serverless Framework define la infraestructura renovada en `serverless.yml`, con la misma herramienta de despliegue del proyecto anterior.

## Estructura

```text
frontend/       React + Vite, interfaz y estilos
backend/        API, autenticación, almacenamiento y pipeline
backend/tests/  Pruebas de privacidad, versiones, PDFs y publicación
backend/assets/ PDF ficticio de demostración
serverless.yml  Infraestructura Serverless Framework
docs/           Despliegue, verificación y Postman
scripts/        Configuración y generación del ejemplo
```

El prototipo es para revisión académica. Para servicio comercial: validar UX con organizadores, revisar identidad administrada, verificación de correo, recuperación de cuenta, retención de archivos, límites operativos y carga. El catálogo actual recorre eventos publicados y no es un buscador para grandes volúmenes.


## Chat del evento

Abre un evento → Asistente. Adjunta primero la ficha y luego, si lo necesitas, el contrato (un PDF por carga). Cada archivo se procesa por el workflow; consulta el historial en Importaciones. El chat puede preguntar qué fechas constan, qué dice el contrato sobre una hora o qué falta para publicar. Solo consulta la ficha **guardada**, no los cambios pendientes del formulario. Una nueva importación no borra las anteriores; el chat usa hasta tres PDF recientes y 18.000 caracteres en total.

Los mensajes aparecen durante la visita al evento; no se guardan ni se reenvía el historial al modelo. Cada consulta usa el estado actual y sus documentos. Para concretar una corrección, elige el dato encontrado o edita Información / Entradas, guarda y confirma la publicación. El chat no firma contratos ni presta asesoramiento jurídico.

Seguridad: autorización de propietario antes de cargar contexto; los IDs y documentos se eligen en el servidor, no en el mensaje; Groq solo selecciona campos y citas con JSON Schema; el servidor verifica cada cita contra su página y construye la respuesta. No se muestra texto libre generado por el modelo, no hay herramientas de escritura ni de navegación, y los PDF no pueden dar órdenes al sistema. Hay un límite de 1.000 caracteres y 10 consultas por minuto por organizador. Estos controles reducen desvíos; no implican una certificación de seguridad ni precisión perfecta de la selección.

AWS añade una función ChatApi separada, de consulta, en `POST /asistente/{event_id}`. La importación sigue coordinada por Step Functions. El laboratorio reutiliza LabRole: los permisos efectivos del rol deben revisarse, aunque la ruta de chat no ejecuta escrituras sobre eventos.

PDF adicional para probar preguntas sobre condiciones: `backend/assets/contrato-ejemplo.pdf`. Es completamente ficticio, no tiene validez contractual y distingue honorarios de precios de entrada.

Actualización de interfaz: la subida está integrada en el clip del chat y admite arrastrar un PDF sobre la conversación. El progreso aparece como documento adjunto y la revisión se abre en una ventana. Solo los mensajes tienen desplazamiento; el campo para escribir permanece fijo. La conversación se conserva al pasar a Información o Entradas y volver, durante la misma visita al evento.

También puedes entrar desde Backstage → Asistente IA: elige o busca un evento existente, o usa Nuevo evento con IA para empezar.

## Herramienta de despliegue

Se utiliza **Serverless Framework**, igual que en el proyecto anterior. Ejecutar `npm ci` en la raíz, `python scripts/package_backend.py` y `npx serverless package`. Para desplegar: `npx serverless deploy`. Las instrucciones completas y los permisos de AWS Academy están en docs/AWS.md. SAM y Docker no son necesarios.
