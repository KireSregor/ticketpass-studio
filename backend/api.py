import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import FastAPI, Request, Depends, Header, HTTPException, BackgroundTasks
from fastapi.responses import Response, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from config import STORAGE, MAX_PDF_BYTES, ALLOWED_ORIGINS, ROOT
from models import Account, EventFields, UpdateEvent, VersionRequest, FileRequest, ImportRequest, ChatRequest
import storage
import workflow

app = FastAPI(title='TicketPass Studio API', version='1.0.0', description='Eventos, importaciones privadas de PDF y catálogo público.')
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_credentials=False, allow_methods=['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'], allow_headers=['Authorization', 'Content-Type', 'Idempotency-Key'])


@app.exception_handler(storage.Conflict)
async def conflict_handler(request, exc):
    return JSONResponse(status_code=409, content={'detail': 'El registro cambió. Recarga para revisar la versión actual.'})


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse(status_code=422, content={'detail': 'Revisa los campos y los límites indicados.', 'fields': ['.'.join(str(x) for x in e['loc'][1:]) for e in exc.errors()]})


@app.middleware('http')
async def service_boundary(request, call_next):
    service = os.getenv('SERVICE_NAME', 'local')
    prefixes = {'events': ('/eventos', '/catalogo'), 'imports': ('/importaciones', '/archivos', '/examples', '/health'), 'auth': ('/auth',), 'chat': ('/asistente/',)}
    if service in prefixes and request.method != 'OPTIONS' and not request.url.path.startswith(prefixes[service]):
        return JSONResponse(status_code=404, content={'detail': 'Ruta no disponible en este servicio.'})
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if not request.url.path.startswith('/catalogo'):
        response.headers['Cache-Control'] = 'no-store'
    return response


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def identifier(prefix):
    return f'{prefix}_{secrets.token_hex(10)}'


def current_user(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Inicia sesión para continuar.')
    digest = hashlib.sha256(authorization[7:].encode()).hexdigest()
    session = storage.get('sessions', digest)
    if not session or session['expiresAt'] <= time.time():
        raise HTTPException(401, 'Tu sesión terminó. Inicia sesión nuevamente.')
    return {'id': session['organizerId'], 'name': session['name'], 'email': session['email'], 'sessionKey': digest}


def public_user(user):
    return {key: user[key] for key in ['id', 'name', 'email']}


def create_session(user):
    token = secrets.token_urlsafe(40)
    digest = hashlib.sha256(token.encode()).hexdigest()
    storage.put('sessions', digest, {'organizerId': user['id'], 'name': user['name'], 'email': user['email'], 'expiresAt': int(time.time() + 43200), 'createdAt': utcnow()})
    return {'token': token, 'user': public_user(user)}


def email_key(email):
    email = email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise HTTPException(422, 'Ingresa un correo electrónico válido.')
    return email


@app.post('/auth/registro', status_code=201)
def register(payload: Account):
    email = email_key(payload.email)
    salt = secrets.token_bytes(16)
    password = hashlib.pbkdf2_hmac('sha256', payload.password.encode(), salt, 600000).hex()
    user = {'id': identifier('org'), 'name': payload.name.strip(), 'email': email, 'salt': salt.hex(), 'password': password, 'createdAt': utcnow()}
    user['organizerId'] = user['id']
    try:
        storage.put('users', email, user, create=True)
    except storage.Conflict:
        raise HTTPException(409, 'Ya existe una cuenta con ese correo. Inicia sesión.')
    return create_session(user)


@app.post('/auth/login')
def login(payload: Account):
    user = storage.get('users', email_key(payload.email))
    salt = bytes.fromhex(user['salt']) if user else bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', payload.password.encode(), salt, 600000).hex()
    if not user or not hmac.compare_digest(user['password'], digest):
        raise HTTPException(401, 'El correo o la contraseña no coinciden.')
    return create_session(user)


@app.get('/auth/me')
def me(user=Depends(current_user)):
    return public_user(user)


@app.post('/auth/logout', status_code=204)
def logout(user=Depends(current_user)):
    session = storage.get('sessions', user['sessionKey'])
    storage.put('sessions', user['sessionKey'], {**session, 'expiresAt': 0})
    return Response(status_code=204)


def owned(kind, key, user):
    row = storage.get(kind, key)
    if not row or row.get('organizerId') != user['id']:
        raise HTTPException(404, 'No encontramos ese registro en tu cuenta.')
    return row


def editable(event, version):
    if event['status'] != 'BORRADOR':
        raise HTTPException(409, 'El evento ya está publicado y no puede editarse en este MVP.')
    if event['version'] != version:
        raise HTTPException(409, 'El borrador cambió. Recarga antes de aplicar los cambios.')


def validate_schedule(fields):
    if fields['date']:
        try:
            datetime.strptime(fields['date'], '%Y-%m-%d')
        except ValueError:
            raise HTTPException(422, 'La fecha debe tener formato año-mes-día.')
    if fields['time']:
        try:
            datetime.strptime(fields['time'], '%H:%M')
        except ValueError:
            raise HTTPException(422, 'La hora debe tener formato de 24 horas.')
    try:
        ZoneInfo(fields['timezone'])
    except ZoneInfoNotFoundError:
        raise HTTPException(422, 'Selecciona una zona horaria válida.')
    if len({z['name'].strip().casefold() for z in fields['zones']}) != len(fields['zones']):
        raise HTTPException(422, 'Cada zona debe tener un nombre diferente.')


def publication_issues(event):
    issues = []
    labels = {'title': 'nombre', 'date': 'fecha', 'time': 'hora', 'venue': 'lugar', 'city': 'ciudad', 'description': 'descripción'}
    for key, label in labels.items():
        if not event.get(key, '').strip():
            issues.append(f'Completa el campo {label}.')
    if not event['capacity']:
        issues.append('Indica el aforo total del evento.')
    if not event['zones']:
        issues.append('Agrega al menos una zona con cupos y precio.')
    if sum(z['capacity'] for z in event['zones']) > event['capacity']:
        issues.append('Los cupos de las zonas superan el aforo total.')
    if event['date'] and event['time']:
        scheduled = datetime.fromisoformat(f"{event['date']}T{event['time']}").replace(tzinfo=ZoneInfo(event['timezone']))
        if scheduled <= datetime.now(timezone.utc):
            issues.append('La fecha y hora del evento deben estar en el futuro.')
    return issues


@app.get('/eventos')
def events(user=Depends(current_user)):
    return {'items': storage.list_records('events', user['id'])}


@app.post('/eventos', status_code=201)
def create_event(payload: EventFields, user=Depends(current_user)):
    fields = payload.model_dump()
    validate_schedule(fields)
    event = {**fields, 'id': identifier('evt'), 'organizerId': user['id'], 'organizerName': user['name'], 'version': 1, 'status': 'BORRADOR', 'createdAt': utcnow(), 'updatedAt': utcnow()}
    storage.put('events', event['id'], event, create=True)
    return event


@app.get('/eventos/{event_id}')
def get_event(event_id: str, user=Depends(current_user)):
    event = owned('events', event_id, user)
    return {**event, 'publicationIssues': publication_issues(event)}


@app.patch('/eventos/{event_id}')
def update_event(event_id: str, payload: UpdateEvent, user=Depends(current_user)):
    event = owned('events', event_id, user)
    editable(event, payload.version)
    fields = payload.model_dump(exclude={'version'})
    validate_schedule(fields)
    result = {**event, **fields, 'version': event['version'] + 1, 'updatedAt': utcnow()}
    storage.put('events', event_id, result, expected_version=payload.version)
    return result


@app.post('/eventos/{event_id}/publicar')
def publish(event_id: str, payload: VersionRequest, user=Depends(current_user)):
    event = owned('events', event_id, user)
    if event['status'] == 'PUBLICADO':
        return event
    editable(event, payload.version)
    issues = publication_issues(event)
    if issues:
        raise HTTPException(422, detail={'message': 'El evento necesita algunos ajustes antes de publicar.', 'issues': issues})
    event.update(status='PUBLICADO', version=event['version'] + 1, publishedAt=utcnow(), updatedAt=utcnow())
    storage.put('events', event_id, event, expected_version=payload.version)
    return event


PUBLIC_FIELDS = ['id', 'title', 'category', 'date', 'time', 'timezone', 'venue', 'city', 'description', 'zones', 'theme', 'organizerName', 'publishedAt']


@app.get('/catalogo')
def catalog():
    return {'items': [{k: event.get(k) for k in PUBLIC_FIELDS} for event in storage.list_records('events') if event['status'] == 'PUBLICADO']}


@app.get('/catalogo/{event_id}')
def catalog_event(event_id: str):
    event = storage.get('events', event_id)
    if not event or event['status'] != 'PUBLICADO':
        raise HTTPException(404, 'Este evento todavía no está disponible.')
    return {k: event.get(k) for k in PUBLIC_FIELDS}


@app.post('/archivos/url-carga')
def file_upload_url(payload: FileRequest, user=Depends(current_user)):
    event = owned('events', payload.eventId, user)
    editable(event, event['version'])
    if not payload.filename.lower().endswith('.pdf'):
        raise HTTPException(422, 'Selecciona un archivo PDF.')
    file_id = identifier('file')
    key = f"uploads/{user['id']}/{file_id}.pdf"
    storage.put('files', file_id, {'id': file_id, 'organizerId': user['id'], 'eventId': event['id'], 'key': key, 'size': payload.size, 'filename': payload.filename, 'createdAt': utcnow()})
    if STORAGE == 'dynamodb':
        import boto3
        url = boto3.client('s3').generate_presigned_url('put_object', Params={'Bucket': os.environ['FILES_BUCKET'], 'Key': key, 'ContentType': 'application/pdf'}, ExpiresIn=180)
    else:
        url = f'/archivos/local/{file_id}'
    return {'fileId': file_id, 'uploadUrl': url, 'method': 'PUT', 'headers': {'Content-Type': 'application/pdf'}}


@app.put('/archivos/local/{file_id}', status_code=204)
async def local_upload(file_id: str, request: Request, user=Depends(current_user)):
    if STORAGE != 'sqlite':
        raise HTTPException(404)
    file = owned('files', file_id, user)
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > MAX_PDF_BYTES:
            raise HTTPException(413, 'El PDF supera el límite de 5 MB.')
    if len(content) != file['size'] or not content.lstrip().startswith(b'%PDF-'):
        raise HTTPException(422, 'El contenido no coincide con el PDF seleccionado.')
    storage.write_blob(file['key'], bytes(content))
    return Response(status_code=204)


def import_view(row):
    return {k: v for k, v in row.items() if k not in ['pages', 'fileKey', 'fileSize', 'idempotencyKey']}


@app.post('/importaciones', status_code=202)
def start_import(payload: ImportRequest, background: BackgroundTasks, user=Depends(current_user), idempotency_key: str = Header(alias='Idempotency-Key', min_length=8, max_length=120)):
    event = owned('events', payload.eventId, user)
    file = owned('files', payload.fileId, user)
    if file['eventId'] != event['id']:
        raise HTTPException(422, 'Ese archivo no pertenece al evento.')
    fingerprint = hashlib.sha256(f"{user['id']}:{idempotency_key}".encode()).hexdigest()[:28]
    import_id = f'imp_{fingerprint}'
    previous = storage.get('imports', import_id)
    if previous:
        if previous['eventId'] != payload.eventId or previous['fileId'] != payload.fileId or previous['inputVersion'] != payload.version:
            raise HTTPException(409, 'La clave de solicitud ya se utilizó con otros datos.')
        return import_view(previous)
    editable(event, payload.version)
    record = {'id': import_id, 'organizerId': user['id'], 'eventId': event['id'], 'eventTitle': event['title'], 'inputVersion': payload.version, 'fileId': file['id'], 'fileKey': file['key'], 'fileSize': file['size'], 'filename': file['filename'], 'status': 'EN_PROCESO', 'stage': 'QUEUED', 'message': 'Tu documento está en la fila de revisión', 'promptVersion': 'event-extraction-v1', 'createdAt': utcnow(), 'updatedAt': utcnow()}
    try:
        storage.put('imports', import_id, record, create=True)
    except storage.Conflict:
        return import_view(storage.get('imports', import_id))
    if STORAGE == 'dynamodb':
        import boto3
        try:
            boto3.client('stepfunctions').start_execution(stateMachineArn=os.environ['WORKFLOW_ARN'], name=import_id, input=json.dumps({'importId': import_id}))
        except Exception:
            workflow.failure_task({'importId': import_id, 'error': {'message': 'No se pudo iniciar el proceso. Vuelve a intentarlo con una nueva importación.'}})
            raise HTTPException(503, 'No se pudo iniciar la importación. Tu evento permanece guardado.')
    else:
        background.add_task(workflow.run_local, import_id)
    return import_view(record)


@app.get('/importaciones')
def imports(user=Depends(current_user)):
    return {'items': [import_view(row) for row in storage.list_records('imports', user['id'])]}


@app.get('/importaciones/{import_id}')
def get_import(import_id: str, user=Depends(current_user)):
    return import_view(owned('imports', import_id, user))


@app.get('/importaciones/{import_id}/reporte')
def report(import_id: str, user=Depends(current_user)):
    row = owned('imports', import_id, user)
    if not row.get('reportKey'):
        raise HTTPException(409, 'El reporte aún no está disponible. Puedes consultar los resultados en pantalla.')
    return Response(content=storage.read_blob(row['reportKey']), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': 'attachment; filename="ticketpass-revision.csv"'})


@app.post('/importaciones/{import_id}/aplicar')
def apply_import(import_id: str, payload: UpdateEvent, user=Depends(current_user)):
    row = owned('imports', import_id, user)
    if row['status'] not in ('LISTA', 'REQUIERE_REVISION'):
        raise HTTPException(409, 'La importación todavía no tiene un resultado para aplicar.')
    if row['inputVersion'] != payload.version:
        raise HTTPException(409, 'Las propuestas corresponden a otra versión. Revisa el evento antes de aplicarlas.')
    return update_event(row['eventId'], payload, user)


@app.get('/examples/event.pdf')
def sample_pdf():
    return FileResponse(ROOT / 'assets' / 'evento-ejemplo.pdf', media_type='application/pdf', filename='evento-ejemplo.pdf')


@app.get('/health')
def health():
    return {'status': 'ok', 'aiConfigured': bool(os.getenv('GROQ_API_KEY')) or os.getenv('GROQ_ENABLED') == 'true', 'basicExtraction': os.getenv('ALLOW_BASIC_EXTRACTION', 'true' if STORAGE == 'sqlite' else 'false').lower() == 'true', 'storage': STORAGE}


from mangum import Mangum
handler = Mangum(app, lifespan='off')



@app.post('/asistente/{event_id}')
def chat_event(event_id: str, payload: ChatRequest, user=Depends(current_user)):
    from chat import answer_event
    from agent import AgentUnavailable
    event = owned('events', event_id, user)
    minute = int(time.time() // 60)
    limit_key = f"{user['id']}:{minute}"
    counter = storage.get('chat_limits', limit_key)
    if counter and counter['version'] >= 10:
        raise HTTPException(429, 'Llegaste al límite de 10 consultas por minuto. Espera un momento.')
    try:
        storage.put('chat_limits', limit_key, {'organizerId': user['id'], 'version': counter['version'] + 1 if counter else 1, 'expiresAt': (minute + 2) * 60, 'createdAt': utcnow()}, create=not counter, expected_version=counter['version'] if counter else None)
    except storage.Conflict:
        raise HTTPException(429, 'Hay otra consulta en curso. Espera un momento e inténtalo otra vez.')
    records = [row for row in storage.list_records('imports', user['id']) if row['eventId'] == event_id and row.get('pages')][:3]
    documents, remaining = [], 18000
    for record in records:
        pages = []
        for page in record['pages']:
            text = page['text'][:remaining]
            remaining -= len(text)
            if text:
                pages.append({'page': page['page'], 'text': text})
        documents.append({'id': record['id'], 'filename': record['filename'], 'pages': pages})
    try:
        response = answer_event(payload.message.strip(), event, documents, publication_issues(event))
    except AgentUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    return {**response, 'eventId': event_id, 'version': event['version'], 'documents': [{'id': d['id'], 'filename': d['filename']} for d in documents]}
