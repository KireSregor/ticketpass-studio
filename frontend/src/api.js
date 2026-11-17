const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');
export function token() { return sessionStorage.getItem('ticketpass-token') || ''; }
export function setToken(value) { value ? sessionStorage.setItem('ticketpass-token', value) : sessionStorage.removeItem('ticketpass-token'); }
export const apiUrl = (path) => `${BASE}${path}`;
export async function api(path, options = {}) {
  const headers = { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers };
  if (options.body && typeof options.body !== 'string') { options.body = JSON.stringify(options.body); headers['Content-Type'] = 'application/json'; }
  const response = await fetch(apiUrl(path), { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = data.detail;
    const error = new Error(typeof detail === 'string' ? detail : detail?.message || 'No se pudo completar la solicitud. Inténtalo nuevamente.');
    error.status = response.status; error.issues = detail?.issues || []; error.fields = data.fields || [];
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}
export async function uploadPdf(event, file) {
  const signed = await api('/archivos/url-carga', { method: 'POST', body: { eventId: event.id, filename: file.name, size: file.size } });
  const local = signed.uploadUrl.startsWith('/');
  const response = await fetch(local ? apiUrl(signed.uploadUrl) : signed.uploadUrl, { method: 'PUT', headers: { ...signed.headers, ...(local ? { Authorization: `Bearer ${token()}` } : {}) }, body: file });
  if (!response.ok) throw new Error('No pudimos subir el archivo. Revisa que sea un PDF válido y vuelve a intentarlo.');
  return api('/importaciones', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: { eventId: event.id, version: event.version, fileId: signed.fileId } });
}
export async function downloadReport(id) {
  const response = await fetch(apiUrl(`/importaciones/${id}/reporte`), { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new Error('El reporte aún no está disponible. Puedes revisar los resultados en pantalla.');
  const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ticketpass-revision.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}
