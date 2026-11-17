import csv
import io
import json
import os
import time
from datetime import datetime, timezone
import storage
from agent import extract_pages, call_groq, basic_extraction, verified_result, InputError, AgentUnavailable


def now():
    return datetime.now(timezone.utc).isoformat()


def update(import_id, **fields):
    record = storage.get('imports', import_id)
    record.update(fields, updatedAt=now())
    storage.put('imports', import_id, record)
    return record


def extract_task(payload, context=None):
    record = storage.get('imports', payload['importId'])
    if record.get('pages'):
        return payload
    update(record['id'], stage='EXTRACT', message='Leyendo el texto de tu documento')
    content = storage.read_blob(record['fileKey'])
    if len(content) != record['fileSize']:
        raise InputError('El tamaño del archivo no coincide con la carga. Vuelve a subirlo.')
    pages = extract_pages(content)
    update(record['id'], pages=pages, pageCount=len(pages))
    return payload


def analyze_task(payload, context=None):
    record = storage.get('imports', payload['importId'])
    if record.get('result'):
        return payload
    update(record['id'], stage='ANALYZE', message='Preparando los campos y sus fuentes')
    basic_allowed = os.getenv('ALLOW_BASIC_EXTRACTION', 'true' if storage.STORAGE == 'sqlite' else 'false').lower() == 'true'
    if not os.getenv('GROQ_API_KEY') and basic_allowed:
        raw, mode = basic_extraction(record['pages']), 'BASIC'
    else:
        raw, mode = call_groq(record['pages']), 'GROQ'
    result = verified_result(raw, record['pages'])
    unresolved = any(len(v) > 1 for v in result['fields'].values())
    missing = [k for k in ['title', 'date', 'time', 'venue', 'description', 'capacity', 'zones'] if not result['fields'][k]]
    update(record['id'], result=result, mode=mode, missing=missing, needsReview=unresolved or bool(missing) or mode == 'BASIC', stage='REPORT', message='Guardando tu revisión')
    return payload


def report_task(payload, context=None):
    record = storage.get('imports', payload['importId'])
    output = io.StringIO(newline='')
    writer = csv.writer(output, delimiter=';')
    writer.writerow(['importacion', 'evento', 'version', 'modo', 'campo', 'valor', 'pagina', 'cita'])
    for field, candidates in record['result']['fields'].items():
        for candidate in candidates:
            cells = [record['id'], record['eventId'], record['inputVersion'], record['mode'], field, candidate['value'], candidate['page'], candidate['quote']]
            # Avoid spreadsheet formula execution when a user opens a CSV.
            writer.writerow(["'" + str(v) if str(v).lstrip().startswith(('=', '+', '-', '@')) else v for v in cells])
    key = f"reports/{record['organizerId']}/{record['id']}.csv"
    try:
        storage.write_blob(key, ('\ufeff' + output.getvalue()).encode('utf-8'))
        report_status = 'READY'
    except Exception:
        report_status, key = 'PENDING', None
    status = 'REQUIERE_REVISION' if record['needsReview'] else 'LISTA'
    update(record['id'], status=status, stage='DONE', message='Tu borrador está listo para revisar', reportKey=key, reportStatus=report_status)
    return payload


def failure_task(payload, context=None):
    import_id = payload['importId']
    error = payload.get('error', {})
    message = error.get('message') if isinstance(error, dict) else None
    if not message:
        try:
            message = json.loads(error.get('Cause', '{}')).get('errorMessage')
        except (ValueError, AttributeError):
            pass
    update(import_id, status='FALLIDA', stage='FAILED', message=message or 'No se pudo completar la importación. Tu borrador está a salvo; puedes continuar manualmente.')
    return {'importId': import_id, 'status': 'FALLIDA'}


def run_local(import_id):
    payload = {'importId': import_id}
    try:
        extract_task(payload)
        for attempt in range(3):
            try:
                analyze_task(payload)
                break
            except AgentUnavailable:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        report_task(payload)
    except (InputError, AgentUnavailable) as exc:
        failure_task({'importId': import_id, 'error': {'message': str(exc)}})
    except Exception:
        failure_task({'importId': import_id})

