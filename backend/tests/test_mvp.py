import io
import os
import sys
from pathlib import Path
from datetime import datetime
import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['STORAGE'] = 'sqlite'
import storage
import workflow
from agent import extract_pages, verified_result, basic_extraction, InputError, FIELDS
from api import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, 'DATA_DIR', tmp_path)
    monkeypatch.setenv('ALLOW_BASIC_EXTRACTION', 'true')
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    return TestClient(app)


def account(client, email='a@example.com'):
    response = client.post('/auth/registro', json={'email': email, 'password': 'ClaveSegura123!', 'name': 'Productora Ritmo'})
    assert response.status_code == 201, response.text
    return {'Authorization': f"Bearer {response.json()['token']}"}


def event(client, headers):
    response = client.post('/eventos', headers=headers, json={'title': 'Salsa en vivo'})
    assert response.status_code == 201
    return response.json()


def pdf_bytes(lines=None, pages=1):
    stream = io.BytesIO()
    pdf = canvas.Canvas(stream)
    for i in range(pages):
        text = pdf.beginText(40, 780)
        for line in lines or ['Evento: Salsa en vivo', f'Fecha: 2030-12-{12 + i:02}', 'Lugar: Salón Central', 'Aforo: 300']:
            text.textLine(line)
        pdf.drawText(text)
        pdf.showPage()
    pdf.save()
    return stream.getvalue()


def upload_and_import(client, headers, ev, content=None, key='request-001'):
    content = content or pdf_bytes()
    signed = client.post('/archivos/url-carga', headers=headers, json={'eventId': ev['id'], 'filename': 'evento.pdf', 'size': len(content)}).json()
    assert client.put(signed['uploadUrl'], headers={**headers, 'Content-Type': 'application/pdf'}, content=content).status_code == 204
    body = {'eventId': ev['id'], 'version': ev['version'], 'fileId': signed['fileId']}
    response = client.post('/importaciones', headers={**headers, 'Idempotency-Key': key}, json=body)
    assert response.status_code == 202, response.text
    return response.json(), body


def editable_fields(ev):
    return {k: v for k, v in ev.items() if k in ['title', 'category', 'date', 'time', 'timezone', 'venue', 'city', 'description', 'capacity', 'zones', 'theme', 'version']}


def test_authentication_login_and_revocation(client):
    headers = account(client)
    assert client.get('/auth/me', headers=headers).json()['name'] == 'Productora Ritmo'
    assert client.post('/auth/login', json={'email': 'a@example.com', 'password': 'wrongpassword'}).status_code == 401
    assert client.post('/auth/logout', headers=headers).status_code == 204
    assert client.get('/eventos', headers=headers).status_code == 401


def test_other_organizer_cannot_access_private_resources(client):
    a, b = account(client), account(client, 'b@example.com')
    ev = event(client, a)
    imp, _ = upload_and_import(client, a, ev)
    for path in [f"/eventos/{ev['id']}", f"/importaciones/{imp['id']}", f"/importaciones/{imp['id']}/reporte"]:
        assert client.get(path, headers=b).status_code == 404
    assert client.get('/eventos', headers=b).json()['items'] == []


def test_import_extracts_real_pdf_with_page_evidence(client):
    headers = account(client)
    ev = event(client, headers)
    imp, _ = upload_and_import(client, headers, ev, pdf_bytes(pages=2))
    result = client.get(f"/importaciones/{imp['id']}", headers=headers).json()
    assert result['status'] == 'REQUIERE_REVISION'
    assert result['mode'] == 'BASIC'
    assert len(result['result']['fields']['date']) == 2
    assert {c['page'] for c in result['result']['fields']['date']} == {1, 2}
    assert 'pages' not in result and 'fileKey' not in result
    assert client.get(f"/eventos/{ev['id']}", headers=headers).json()['date'] == ''


def test_idempotency_reuses_import_and_rejects_changed_payload(client):
    headers = account(client)
    ev = event(client, headers)
    imp, body = upload_and_import(client, headers, ev)
    same = client.post('/importaciones', headers={**headers, 'Idempotency-Key': 'request-001'}, json=body)
    assert same.status_code == 202 and same.json()['id'] == imp['id']
    changed = client.post('/importaciones', headers={**headers, 'Idempotency-Key': 'request-001'}, json={**body, 'version': 2})
    assert changed.status_code == 409


def test_stale_import_cannot_overwrite_manual_edits(client):
    headers = account(client)
    ev = event(client, headers)
    imp, _ = upload_and_import(client, headers, ev)
    fields = editable_fields(ev)
    response = client.patch(f"/eventos/{ev['id']}", headers=headers, json={**fields, 'title': 'Cambio manual'})
    assert response.status_code == 200
    result = client.post(f"/importaciones/{imp['id']}/aplicar", headers=headers, json={**fields, 'title': 'Desde la IA'})
    assert result.status_code == 409
    assert client.get(f"/eventos/{ev['id']}", headers=headers).json()['title'] == 'Cambio manual'


def test_publication_requires_data_and_catalog_never_exposes_private_data(client):
    headers = account(client)
    ev = event(client, headers)
    url = f"/eventos/{ev['id']}"
    assert client.post(url + '/publicar', headers=headers, json={'version': 1}).status_code == 422
    assert not client.get('/catalogo').json()['items']
    fields = {**editable_fields(ev), 'date': '2030-12-12', 'time': '20:00', 'city': 'Lima', 'venue': 'Salón', 'description': 'Concierto confirmado.', 'capacity': 100, 'zones': [{'name': 'General', 'capacity': 100, 'price': 50}]}
    assert client.patch(url, headers=headers, json=fields).status_code == 200
    response = client.post(url + '/publicar', headers=headers, json={'version': 2})
    assert response.status_code == 200
    public = client.get(f"/catalogo/{ev['id']}").json()
    assert public['title'] == ev['title']
    assert all(k not in public for k in ['organizerId', 'fileKey', 'password', 'result', 'version'])
    assert client.patch(url, headers=headers, json={**fields, 'version': 3}).status_code == 409


def test_invalid_zones_and_capacity_are_not_published(client):
    headers = account(client)
    ev = event(client, headers)
    fields = {**editable_fields(ev), 'capacity': 10, 'zones': [{'name': 'General', 'capacity': 20, 'price': 50}]}
    assert client.patch(f"/eventos/{ev['id']}", headers=headers, json=fields).status_code == 200
    response = client.post(f"/eventos/{ev['id']}/publicar", headers=headers, json={'version': 2})
    assert any('aforo' in x for x in response.json()['detail']['issues'])
    assert client.patch(f"/eventos/{ev['id']}", headers=headers, json={**fields, 'version': 2, 'zones': [{'name': 'General', 'capacity': 10, 'price': -1}]}).status_code == 422


def test_deleted_draft_disappears_from_private_event_and_import_routes(client):
    owner, other = account(client), account(client, 'otro@example.com')
    draft = event(client, owner)
    imp, body = upload_and_import(client, owner, draft)
    path = f"/eventos/{draft['id']}"
    delete = path + '/eliminar'
    assert client.post(delete, headers=other, json={'version': 1}).status_code == 404
    assert client.post(delete, headers=owner, json={'version': 2}).status_code == 409
    assert client.post(delete, headers=owner, json={'version': 1}).status_code == 204
    assert client.get('/eventos', headers=owner).json()['items'] == []
    assert client.get('/importaciones', headers=owner).json()['items'] == []
    for url in [path, f"/importaciones/{imp['id']}", f"/importaciones/{imp['id']}/reporte"]:
        assert client.get(url, headers=owner).status_code == 404
    assert client.post('/importaciones', headers={**owner, 'Idempotency-Key': 'request-001'}, json=body).status_code == 404


def test_withdrawal_returns_published_event_to_draft_and_keeps_its_imports(client):
    owner, other = account(client), account(client, 'otro@example.com')
    draft = event(client, owner)
    path = f"/eventos/{draft['id']}"
    public = f"/catalogo/{draft['id']}"
    fields = {**editable_fields(draft), 'date': '2030-12-12', 'time': '20:00', 'city': 'Lima', 'venue': 'Sala', 'description': 'Concierto confirmado.', 'capacity': 100, 'zones': [{'name': 'General', 'capacity': 100, 'price': 50}]}
    saved = client.patch(path, headers=owner, json=fields).json()
    imp, _ = upload_and_import(client, owner, saved)
    published = client.post(path + '/publicar', headers=owner, json={'version': saved['version']}).json()
    version = published['version']
    assert client.get(public).status_code == 200
    assert client.post(path + '/eliminar', headers=owner, json={'version': version}).status_code == 409
    assert client.post(path + '/retirar', headers=other, json={'version': version}).status_code == 404
    assert client.post(path + '/retirar', headers=owner, json={'version': version - 1}).status_code == 409
    withdrawn = client.post(path + '/retirar', headers=owner, json={'version': version})
    assert withdrawn.status_code == 200 and withdrawn.json()['status'] == 'BORRADOR'
    assert withdrawn.json()['zones'] == fields['zones']
    assert client.get(public).status_code == 404
    assert client.get('/catalogo').json()['items'] == []
    assert client.get(f"/importaciones/{imp['id']}/reporte", headers=owner).status_code == 200
    assert client.post(path + '/publicar', headers=owner, json={'version': withdrawn.json()['version']}).status_code == 200


def test_malformed_encrypted_scanned_and_long_pdfs_rejected():
    with pytest.raises(InputError): extract_pages(b'not a pdf')
    with pytest.raises(InputError): extract_pages(pdf_bytes(pages=6))
    from pypdf import PdfWriter
    writer = PdfWriter(); writer.add_blank_page(width=500, height=500)
    blank = io.BytesIO(); writer.write(blank)
    with pytest.raises(InputError): extract_pages(blank.getvalue())
    writer.encrypt('secret'); locked = io.BytesIO(); writer.write(locked)
    with pytest.raises(InputError): extract_pages(locked.getvalue())


def test_hallucinated_quote_and_value_are_rejected():
    pages = [{'page': 1, 'text': 'Evento: Noche de Salsa. Fecha: 2030-12-12.'}]
    fields = {key: [] for key in FIELDS}
    fields['title'] = [{'value': 'Bad Bunny', 'page': 1, 'quote': 'Evento: Noche de Salsa.'}]
    fields['date'] = [{'value': '2030-12-19', 'page': 2, 'quote': 'Fecha: 2030-12-19.'}]
    result = verified_result({'fields': fields, 'warnings': []}, pages)
    assert result['fields']['title'] == [] and result['fields']['date'] == []


def test_missing_zone_proposals_recover_complete_ticket_table_with_citation():
    table = 'ZONA\nCUPOS\nPRECIO POR ENTRADA\nGeneral\n600\nS/ 65.00\nVIP\n200\nS/ 120.00'
    raw = {'fields': {}, 'warnings': ['Las zonas requieren revisión manual de cupos y precios.']}
    result = verified_result(raw, [{'page': 1, 'text': f'Entradas y distribución\n{table}\n'}])
    [candidate] = result['fields']['zones']
    assert candidate['page'] == 1
    assert candidate['quote'] == table.split('PRECIO POR ENTRADA\n')[1]
    assert candidate['parsed'] == [
        {'name': 'General', 'capacity': 600, 'price': 65},
        {'name': 'VIP', 'capacity': 200, 'price': 120},
    ]
    assert result['warnings'] == []
    incomplete_table = table.replace('S/ 120.00', 'Por confirmar')
    assert not verified_result(raw, [{'page': 1, 'text': incomplete_table}])['fields']['zones']


def test_missing_groq_is_honest_failure_without_basic_mode(client, monkeypatch):
    monkeypatch.setenv('ALLOW_BASIC_EXTRACTION', 'false')
    monkeypatch.setattr(workflow.time, 'sleep', lambda _: None)
    headers = account(client); ev = event(client, headers)
    imp, _ = upload_and_import(client, headers, ev)
    row = client.get(f"/importaciones/{imp['id']}", headers=headers).json()
    assert row['status'] == 'FALLIDA' and 'no está configurada' in row['message']
    assert client.get(f"/eventos/{ev['id']}", headers=headers).json()['title'] == ev['title']


def test_csv_formula_injection_is_escaped(client):
    headers = account(client); ev = event(client, headers)
    imp, _ = upload_and_import(client, headers, ev, pdf_bytes(['Evento: =HYPERLINK("evil")', 'Fecha: 2030-12-12']))
    response = client.get(f"/importaciones/{imp['id']}/reporte", headers=headers)
    assert response.status_code == 200
    assert "'=HYPERLINK" in response.text


def test_persisted_events_survive_new_client(client):
    headers = account(client); ev = event(client, headers)
    with TestClient(app) as other:
        assert other.get(f"/eventos/{ev['id']}", headers=headers).status_code == 200


def test_groq_request_uses_structured_schema_and_explicit_client(monkeypatch):
    import json
    import agent
    monkeypatch.setenv('GROQ_API_KEY', 'test-key')
    result = {'fields': {field: [] for field in FIELDS}, 'warnings': []}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({'choices': [{'message': {'content': json.dumps(result)}}]}).encode()

    def request(req, timeout):
        assert req.get_header('User-agent') == 'TicketPass-Studio/1.0'
        assert req.get_header('Authorization') == 'Bearer test-key'
        payload = json.loads(req.data)
        assert payload['response_format']['json_schema']['strict'] is True
        assert payload['messages'][1]['role'] == 'user'
        assert timeout == 35
        return Response()

    monkeypatch.setattr(agent, 'urlopen', request)
    assert agent.call_groq([{'page': 1, 'text': 'Evento: Salsa'}]) == result
