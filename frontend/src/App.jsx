import EventChat from './EventChat.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, ArrowLeft, Plus, Search, LayoutGrid, FileText, LogOut, Ticket, Sparkles, Check, Calendar, MapPin, ChevronRight, Download, X, AlertCircle, CheckCircle2, Menu, ExternalLink, LockKeyhole, LoaderCircle, Clock3, Users, Trash2, Eye, Save, Layers, FileCheck2 } from 'lucide-react';
import { api, apiUrl, token, setToken, downloadReport } from './api.js';
import { sameReviewValue, startTime } from './review.js';

const INITIAL = { title: '', category: 'Concierto', date: '', time: '', timezone: 'America/Lima', venue: '', city: '', description: '', capacity: 0, zones: [], theme: 'violet' };
const LABELS = { title: 'Nombre del evento', date: 'Fecha', time: 'Hora', venue: 'Lugar', city: 'Ciudad', description: 'Descripción', capacity: 'Aforo total', zones: 'Zonas y entradas' };
const money = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 2 }).format(n);
function route() { return location.hash.slice(1) || '/events'; }
function go(path) { location.hash = path; }
function dateLabel(date) { if (!date) return 'Fecha por definir'; const d = new Date(`${date}T12:00:00`); return isNaN(d) ? date : d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fieldsOf(event) { return Object.fromEntries(Object.keys(INITIAL).map(key => [key, event[key] ?? INITIAL[key]])); }
function Badge({ status }) { const published = status === 'PUBLICADO'; return <span className={`badge ${published ? 'green' : 'amber'}`}><span />{published ? 'Publicado' : 'Borrador'}</span>; }
function Spinner({ text = 'Cargando…' }) { return <div className="loading-state"><LoaderCircle className="spin" size={22} /><span>{text}</span></div>; }
function ErrorBox({ error }) { return error ? <div className="error-box" role="alert"><AlertCircle size={18} /><div>{error.message || error}{error.issues?.length > 0 && <ul>{error.issues.map(i => <li key={i}>{i}</li>)}</ul>}</div></div> : null; }
function Field({ label, hint, children, required }) { return <label className="field"><span>{label}{required && <i> *</i>}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Brand({ small = false }) { return <span className={`brand ${small ? 'small' : ''}`}><span className="brand-mark"><Ticket size={23} strokeWidth={1.7} /></span><span>ticketpass<span className="brand-dot">.</span>{!small && <em>STUDIO</em>}</span></span>; }
function Poster({ event, compact = false }) { return <div className={`poster ${event.theme || 'violet'} ${compact ? 'compact' : ''}`}><div className="poster-orb orb-one" /><div className="poster-orb orb-two" /><div className="poster-top"><span>TICKETPASS PRESENTA</span><Ticket size={20} /></div><div className="poster-title">{event.title || 'Tu próximo\ngran evento'}</div><div className="poster-bottom"><span>{event.category || 'Concierto'}</span><span>{event.date ? dateLabel(event.date) : 'PRÓXIMAMENTE'}</span></div></div>; }
function EventPreview({ event }) { return <aside className="editor-preview"><div className="preview-label"><Eye size={14} />ASÍ VA TOMANDO FORMA</div><Poster event={event} /><div className="preview-info"><strong>{event.title || 'El nombre de tu evento'}</strong><p><Calendar size={14} />{dateLabel(event.date)}{event.time && ` · ${event.time}`}</p><p><MapPin size={14} />{event.venue || 'Tu lugar por confirmar'}</p>{event.zones.length > 0 && <div className="preview-price">Desde <strong>{money(Math.min(...event.zones.map(z => z.price)))}</strong></div>}</div><p className="preview-help">{event.status === 'PUBLICADO' ? 'Esta ficha ya aparece en el catálogo público.' : 'Vista previa. Tú confirmas cuándo publicar.'}</p></aside>; }
function Modal({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => { const old = document.activeElement; const el = ref.current; el?.focus(); function key(e) { if (e.key === 'Escape') close(); if (e.key === 'Tab') { const list = [...el.querySelectorAll('button,input,select,textarea,a[href]')].filter(n => !n.disabled); if (!list.length) { e.preventDefault(); return; } if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); } } } el?.addEventListener('keydown', key); return () => { el?.removeEventListener('keydown', key); old?.focus(); }; }, []);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Cerrar" onClick={close}><X size={20} /></button></div>{children}</section></div>;
}

function EventLifecycleDialog({ event, dirty = false, close, onChanged }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const published = event.status === 'PUBLICADO';
  const label = published ? 'Retirar del catálogo' : 'Eliminar borrador';

  function dismiss() {
    if (!pending.current) close();
  }

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const action = published ? 'retirar' : 'eliminar';
      const updated = await api(`/eventos/${event.id}/${action}`, { method: 'POST', body: { version: event.version } });
      onChanged(event.id, updated);
      close();
    } catch (err) {
      setError(err);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <Modal title={label} close={dismiss}>
    <p className="modal-copy"><strong>{event.title || 'Evento sin título'}</strong></p>
    <p className="modal-copy">{published
      ? 'La ficha dejará de verse en el catálogo y volverá a Mis eventos como borrador. Puedes editarla y publicarla de nuevo. Sus documentos seguirán disponibles.'
      : 'El borrador y sus importaciones se quitarán de tu espacio. Esta acción no se puede deshacer desde Backstage.'}</p>
    {dirty && <p className="modal-copy">Los cambios que tienes sin guardar también se perderán.</p>}
    <ErrorBox error={error} />
    <div className="panel-actions">
      <button className="button secondary" onClick={dismiss} disabled={busy}>Cancelar</button>
      <button className={`button ${published ? 'primary' : 'danger'}`} onClick={confirm} disabled={busy}>
        {busy ? 'Procesando…' : label}
      </button>
    </div>
  </Modal>;
}

function Auth({ onLogin }) {
  const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(e) { e.preventDefault(); setBusy(true); setError(null); const data = Object.fromEntries(new FormData(e.currentTarget)); try { const result = await api(signup ? '/auth/registro' : '/auth/login', { method: 'POST', body: { ...data, name: data.name || 'Organizador' } }); setToken(result.token); onLogin(result.user); } catch (err) { setError(err); } finally { setBusy(false); } }
  return <main className="auth"><section className="auth-story"><Brand /><div className="auth-copy"><span className="eyebrow">HECHO PARA QUIENES HACEN QUE PASE</span><h1>Grandes ideas.<br /><em>Eventos inolvidables.</em></h1><p>Tu espacio para preparar cada detalle y darle a tu próximo evento el comienzo que merece.</p><div className="auth-ticket"><div><span>TU PRÓXIMO EVENTO</span><strong>Una idea lista<br />para salir al mundo.</strong></div><Ticket size={54} strokeWidth={1} /><div className="ticket-dashes" /></div></div><span className="auth-bottom">Tú pones la idea. Nosotros te ayudamos con el resto.</span></section><section className="auth-form"><div className="auth-form-inner"><span className="mini-label">BIENVENIDO A TU BACKSTAGE</span><h2>{signup ? 'Comienza a crear.' : 'Qué bueno verte.'}</h2><p>{signup ? 'Crea tu cuenta de organizador y prepara tu primer evento.' : 'Ingresa a tu espacio de organizador.'}</p><form onSubmit={submit}>{signup && <Field label="Tu nombre o productora"><input name="name" autoComplete="organization" placeholder="Ej. Productora Ritmo" minLength={2} maxLength={80} required /></Field>}<Field label="Correo electrónico"><input name="email" type="email" autoComplete="email" placeholder="tu@productora.com" required /></Field><Field label="Contraseña" hint={signup ? 'Usa al menos 10 caracteres.' : null}><input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={10} maxLength={128} required placeholder="Tu contraseña" /></Field><ErrorBox error={error} /><button className="button primary wide" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : signup ? 'Crear mi cuenta' : 'Entrar a Studio'}{!busy && <ArrowRight size={18} />}</button></form><p className="auth-switch">{signup ? '¿Ya tienes cuenta?' : '¿Es tu primera vez?'} <button onClick={() => { setSignup(!signup); setError(null); }}>{signup ? 'Inicia sesión' : 'Crea una cuenta'}</button></p><a className="text-link" href="#/catalog"><ArrowUpRight size={16} />Explorar el catálogo público</a></div><span className="auth-foot"><LockKeyhole size={13} />Tus documentos permanecen privados.</span></section></main>;
}

function AssistantHome({ events, refresh, notify }) {
  const [query, setQuery] = useState(''), [creating, setCreating] = useState(false);
  const filtered = events.filter(event => (event.title || 'Evento sin título').toLowerCase().includes(query.toLowerCase()));
  async function create() {
    setCreating(true);
    try { const event = await api('/eventos', { method: 'POST', body: INITIAL }); await refresh(); go(`/assistant/${event.id}`); }
    catch (err) { notify(err.message, 'error'); }
    finally { setCreating(false); }
  }
  return <><div className="page-heading"><div><span className="eyebrow muted">TU BACKSTAGE</span><h1>Asistente IA</h1><p>Elige el evento con el que quieres trabajar.</p></div><button className="button primary" disabled={creating} onClick={create}><Plus size={17} />Nuevo evento con IA</button></div><section className="assistant-hub"><div className="assistant-hub-intro"><span className="section-icon"><Sparkles size={23} /></span><div><h2>Todo empieza con una conversación.</h2><p>Revisa documentos, confirma datos y prepara tu publicación. Cada evento tiene su propio chat.</p></div></div>{events.length > 0 && <label className="search"><Search size={17} /><input aria-label="Buscar evento para el asistente" placeholder="Busca tu evento…" value={query} onChange={e => setQuery(e.target.value)} /></label>}<div className="assistant-event-list">{filtered.map(event => <a className="assistant-event-row" key={event.id} href={`#/assistant/${event.id}`}><span className={`assistant-event-icon ${event.theme}`}><Ticket size={23} /></span><div><strong>{event.title || 'Evento sin título'}</strong><p>{dateLabel(event.date)}{event.city ? ` · ${event.city}` : ''}</p></div><Badge status={event.status} /><ArrowRight size={18} /></a>)}</div>{!filtered.length && <div className="assistant-hub-empty"><p>{events.length ? 'No encontramos un evento con ese nombre.' : 'Crea tu primer evento para empezar. Podrás adjuntar su PDF directamente en el chat.'}</p>{!events.length && <button className="text-button" disabled={creating} onClick={create}>Comenzar mi evento<ArrowRight size={15} /></button>}</div>}</section></>;
}

function Dashboard({ events, refresh, user, notify, onEventChanged }) {
  const [manageEvent, setManageEvent] = useState(null);
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('Todos'), [creating, setCreating] = useState(false);
  async function create() { setCreating(true); try { const event = await api('/eventos', { method: 'POST', body: INITIAL }); await refresh(); go(`/events/${event.id}`); } catch (err) { notify(err.message, 'error'); } finally { setCreating(false); } }
  const filtered = events.filter(e => (filter === 'Todos' || e.status === (filter === 'Publicados' ? 'PUBLICADO' : 'BORRADOR')) && e.title.toLowerCase().includes(query.toLowerCase()));
  const published = events.filter(e => e.status === 'PUBLICADO').length;
  return <><div className="page-heading"><div><div className="eyebrow muted">TU ESPACIO DE ORGANIZADOR</div><h1>Mis eventos<span className="count">{events.length}</span></h1><p>Cada gran experiencia empieza con una buena idea.</p></div><button className="button primary" onClick={create} disabled={creating}><Plus size={18} />Crear evento</button></div>
    <section className="welcome-banner"><div className="welcome-content"><span className="eyebrow">MENOS FORMULARIOS. MÁS POSIBILIDADES.</span><h2>Tu próximo evento,<br /><em>un paso más cerca.</em></h2><p>Sube el documento de tu evento y prepara una publicación con los datos en su lugar. Tú tienes la última palabra.</p><a className="button white" href="#/assistant"><Sparkles size={17} />Abrir Asistente IA<ArrowUpRight size={17} /></a></div><div className="banner-art" aria-hidden="true"><div className="art-ticket back"><span>BACKSTAGE PASS</span><Ticket size={64} strokeWidth={.8} /></div><div className="art-ticket front"><div className="art-ticket-top"><span>BUENAS IDEAS<br />GRANDES MOMENTOS</span><Sparkles size={21} /></div><strong>Make<br /><em>it happen.</em></strong><div className="art-barcode">|||| || ||| |||| ||| || ||||</div><span className="art-serial">TICKETPASS STUDIO / 001</span></div><span className="art-spark"><Sparkles size={32} /></span></div></section>
    <section className="stats-row" aria-label="Resumen de eventos"><div><span className="stat-icon"><Layers size={19} /></span><span><small>Eventos creados</small><strong>{events.length.toString().padStart(2, '0')}</strong></span></div><div><span className="stat-icon"><FileText size={19} /></span><span><small>En preparación</small><strong>{(events.length - published).toString().padStart(2, '0')}</strong></span></div><div><span className="stat-icon mint"><CheckCircle2 size={19} /></span><span><small>Publicados</small><strong>{published.toString().padStart(2, '0')}</strong></span></div><div className="stats-caption">Tu siguiente gran momento<br /><strong>empieza aquí.</strong><ArrowUpRight size={20} /></div></section>
    <div className="events-toolbar"><div className="tabs" role="tablist" aria-label="Filtrar eventos">{['Todos', 'Borradores', 'Publicados'].map(t => <button key={t} role="tab" aria-selected={filter === t} onClick={() => setFilter(t)} className={filter === t ? 'active' : ''}>{t}</button>)}</div><label className="search"><Search size={17} /><input aria-label="Buscar eventos" placeholder="Buscar un evento…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {filtered.length ? <div className="event-grid">{filtered.map(event => <article className="event-card" key={event.id}><button className="poster-link" onClick={() => go(`/events/${event.id}`)} aria-label={`Abrir ${event.title || 'borrador'}`}><Poster event={event} compact /></button><div className="event-card-body"><div className="event-card-meta"><span>{event.category}</span><Badge status={event.status} /></div><h3><button onClick={() => go(`/events/${event.id}`)}>{event.title || 'Tu evento sin título'}</button></h3><p><Calendar size={14} />{dateLabel(event.date)}</p><p><MapPin size={14} />{[event.venue, event.city].filter(Boolean).join(', ') || 'Lugar por definir'}</p><div className="event-card-bottom"><span>{event.zones.length ? `Desde ${money(Math.min(...event.zones.map(z => z.price)))}` : 'Entradas por definir'}</span><button className="circle-button" aria-label={`Abrir ${event.title || 'evento'}`} onClick={() => go(`/events/${event.id}`)}><ArrowUpRight size={18} /></button></div>
      <button type="button" className="event-manage-action" onClick={() => setManageEvent(event)}>
        {event.status === 'PUBLICADO' ? <Layers size={15} /> : <Trash2 size={15} />}
        {event.status === 'PUBLICADO' ? 'Retirar del catálogo' : 'Eliminar borrador'}
      </button></div></article>)}</div> : <section className="empty-state"><span className="empty-icon"><Ticket size={30} strokeWidth={1.2} /></span><h3>{events.length ? 'No encontramos eventos con ese filtro' : 'El escenario está listo para ti'}</h3><p>{events.length ? 'Prueba con otro nombre o cambia el estado.' : 'Crea tu primer evento. Puedes empezar con un PDF o ir a tu ritmo con el formulario.'}</p>{!events.length && <button className="text-button" onClick={create}>Crear mi primer evento<ArrowRight size={16} /></button>}</section>}
    {manageEvent && <EventLifecycleDialog event={manageEvent} close={() => setManageEvent(null)} onChanged={onEventChanged} />}
  </>;
}

function normalizeCandidate(field, candidate) {
  const value = candidate.parsed ?? candidate.value;
  if (field === 'zones') return Array.isArray(value) ? value : null;
  if (field === 'capacity') { const n = Number(String(value).replace(/\D/g, '')); return n || 0; }
  if (field === 'date') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const months = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
    const match = String(value).toLowerCase().match(/(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/);
    if (match && months[match[2]]) return `${match[3]}-${String(months[match[2]]).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    const numeric = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (numeric) return `${numeric[3]}-${numeric[2]}-${numeric[1]}`;
    return null;
  }
  if (field === 'time') return startTime(value);
  return value;
}

function SourceQuote({ quote, highlight, page }) {
  const start = highlight ? quote.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  const end = start + (highlight?.length ?? 0);
  return <blockquote>
    “{start === -1 ? quote : <>{quote.slice(0, start)}<mark>{quote.slice(start, end)}</mark>{quote.slice(end)}</>}”
    <cite>Página {page}</cite>
  </blockquote>;
}

function ImportReview({ record, event, choices, onChoose, onRemove, onApply, busy, dirty, error, notify }) {
  if (!record) return null;
  const running = record.status === 'EN_PROCESO'; const stale = record.inputVersion !== event.version;
  if (running) return <div className="progress-panel" role="status"><LoaderCircle className="spin" size={24} /><div><h3>{record.message}</h3><p>Tu documento se procesa en segundo plano. El borrador está guardado.</p><div className="progress-track"><span /></div></div></div>;
  if (record.status === 'FALLIDA') return <div className="error-box"><AlertCircle size={22} /><div><strong>No pudimos completar esta importación</strong><p>{record.message}</p><small>Puedes subir otro archivo o completar los campos manualmente.</small></div></div>;
  const basic = record.mode === 'BASIC';
  const count = Object.keys(choices).length;
  return <section className="review-panel">
    <div className="section-title">
      <span className="section-icon"><FileCheck2 size={20} /></span>
      <div>
        <h2>{basic ? 'Datos básicos extraídos' : 'Revisa las propuestas del PDF'}</h2>
        <p>{record.filename} · {record.pageCount} {record.pageCount === 1 ? 'página' : 'páginas'}</p>
      </div>
    </div>
    {basic && <div className="notice amber"><AlertCircle size={17} /><span>Esta revisión se realizó con extracción básica, sin IA. Revisa todos los campos.</span></div>}
    {stale && <div className="notice amber"><Clock3 size={17} /><span>El borrador se actualizó después de este análisis. Tus datos guardados están en el formulario. Para aplicar nuevas propuestas, importa el documento otra vez.</span></div>}
    {record.result.warnings.filter(w => !w.startsWith('Extracción básica')).map(warning => <div className="review-warning" key={warning}>{warning}</div>)}
    <div className="source-list">
      {Object.entries(record.result.fields).filter(([, values]) => values.length).map(([field, values]) =>
        <div className="source-field" key={field}>
          <div className="source-field-title">
            <strong>{LABELS[field]}</strong>
            <span className={values.length > 1 ? 'source-conflict' : 'source-found'}>{values.length > 1 ? 'Confirma una opción' : 'Encontrado'}</span>
          </div>
          {values.map((candidate, i) => {
            const value = normalizeCandidate(field, candidate);
            const selected = choices[field]?.index === i;
            const saved = sameReviewValue(field, value, event[field]);
            const displayed = field === 'time' && value ? value : candidate.value;
            const highlight = ['zones', 'description'].includes(field) ? '' : displayed;
            return <div className={`source-candidate${selected ? ' source-candidate-selected' : ''}`} key={i}>
              <div className="source-value">{field === 'zones' && value ? value.map(z =>
                <div className="source-zone" key={z.name}>{z.name}: {z.capacity} cupos · {money(z.price)}</div>
              ) : displayed}</div>
              <SourceQuote quote={candidate.quote} highlight={highlight} page={candidate.page} />
              <div className="review-candidate-actions">
                {selected ? <>
                  <span className="review-selected"><Check size={15} />Seleccionado</span>
                  <button type="button" className="text-button" disabled={stale || busy} onClick={() => onRemove(field)} aria-label={`Quitar ${LABELS[field]}`}><X size={14} />Quitar</button>
                </> : value === null ? <span className="muted-copy">Completa este dato en {field === 'zones' ? 'Entradas' : 'Información'}.</span> : saved && !choices[field] ?
                  <span className="review-selected"><Check size={15} />Ya guardado</span> :
                  <button type="button" className="text-button" disabled={stale || busy} onClick={() => onChoose(field, value, i)} aria-label={`Usar este dato: ${LABELS[field]}`}>Usar este dato<ArrowRight size={14} /></button>}
              </div>
            </div>;
          })}
        </div>)}
    </div>
    {record.missing?.length > 0 && <p className="muted-copy">Sin propuesta del PDF: {record.missing.map(k => LABELS[k]).join(', ')}. Puedes completar esos campos en el formulario.</p>}
    <ErrorBox error={error} />
    <div className="panel-actions">
      <span className="review-selection-count" role="status">{count === 1 ? '1 campo seleccionado' : `${count} campos seleccionados`}</span>
      <button className="button secondary" onClick={() => downloadReport(record.id).catch(err => notify(err.message, 'error'))} disabled={record.reportStatus !== 'READY'}><Download size={16} />Descargar CSV</button>
      <button className="button primary" onClick={onApply} disabled={busy || stale || !dirty}><Check size={16} />Guardar revisión</button>
    </div>
    <small className="helper">Las propuestas se guardan en el borrador cuando confirmas la revisión.</small>
  </section>;
}

function Editor({ id, refresh, notify, onEventChanged, backTo = '/events' }) {
  const [manageEvent, setManageEvent] = useState(false);
  const publishInFlight = useRef(false);
  const [event, setEvent] = useState(null), [form, setForm] = useState(INITIAL), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(null), [activeImport, setActiveImport] = useState(null), [tab, setTab] = useState('assistant'), [preview, setPreview] = useState(false), [confirm, setConfirm] = useState(false), [inspectImport, setInspectImport] = useState(false);
  const [choices, setChoices] = useState({});
  const dirty = Boolean(event && Object.keys(INITIAL).some(key => !sameReviewValue(key, form[key], event[key] ?? INITIAL[key])));
  useEffect(() => { let alive = true; setLoading(true); api(`/eventos/${id}`).then(data => { if (alive) { setEvent(data); setForm(fieldsOf(data)); setChoices({}); } }).catch(err => alive && setError(err)).finally(() => alive && setLoading(false)); api('/importaciones').then(data => { if (alive) setActiveImport(data.items.find(row => row.eventId === id) || null); }).catch(() => {}); return () => { alive = false; }; }, [id]);
  useEffect(() => { if (activeImport?.status !== 'EN_PROCESO') return; let alive = true; const interval = setInterval(() => api(`/importaciones/${activeImport.id}`).then(data => alive && setActiveImport(data)).catch(err => { if (alive) { setError(err); clearInterval(interval); } }), 1400); return () => { alive = false; clearInterval(interval); }; }, [activeImport?.id, activeImport?.status]);
  useEffect(() => { function warn(e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } } window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  function change(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setChoices(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  async function persistDraft(fromImport) {
    const saved = await api(fromImport ? `/importaciones/${activeImport.id}/aplicar` : `/eventos/${id}`, {
      method: fromImport ? 'POST' : 'PATCH',
      body: { ...form, version: event.version },
    });
    setEvent(saved);
    setForm(fieldsOf(saved));
    setChoices({});
    return saved;
  }

  async function save(fromImport = false) {
    setBusy(true);
    setError(null);
    try {
      const saved = await persistDraft(fromImport);
      refresh().catch(() => {});
      notify('Borrador guardado. Tus cambios están a salvo.');
      return saved;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function closePublish() {
    if (publishInFlight.current) return;
    setConfirm(false);
    setError(null);
  }

  async function publish() {
    if (publishInFlight.current) return;
    publishInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const draft = dirty ? await persistDraft(false) : event;
      const published = await api(`/eventos/${id}/publicar`, {
        method: 'POST',
        body: { version: draft.version },
      });
      setEvent(published);
      setConfirm(false);
      notify('Tu evento ya está publicado.');
    } catch (err) {
      setError(err);
    } finally {
      refresh().catch(() => {});
      publishInFlight.current = false;
      setBusy(false);
    }
  }
  function choose(field, value, index) {
    setChoices(current => ({
      ...current,
      [field]: { index, previous: current[field]?.previous ?? form[field] },
    }));
    setForm(current => ({ ...current, [field]: value }));
  }
  function removeChoice(field) {
    if (choices[field]) change(field, choices[field].previous);
  }
  function onImport(record) {
    setChoices({});
    setActiveImport(record);
  }
  function onLifecycleChanged(eventId, updated) {
    onEventChanged(eventId, updated);
    setChoices({});
    if (!updated) {
      go(backTo);
      return;
    }
    setEvent(updated);
    setForm(fieldsOf(updated));
    setTab('details');
  }
  if (loading) return <Spinner text="Abriendo tu evento…" />;
  if (!event) return <ErrorBox error={error || new Error('No encontramos el evento.')} />;
  const published = event.status === 'PUBLICADO';
  return <><button className="back-link" onClick={() => { if (!dirty || window.confirm('Tienes cambios sin guardar. ¿Quieres salir?')) go(backTo); }}><ArrowLeft size={16} />{backTo === '/assistant' ? 'Asistente IA' : 'Mis eventos'}</button><div className="page-heading editor-heading"><div><div className="eyebrow muted">{published ? 'TU EVENTO ESTÁ EN EL CATÁLOGO' : 'DALE FORMA A TU PRÓXIMO EVENTO'}</div><h1>{form.title || 'Un nuevo comienzo'}</h1><p><Badge status={event.status} /><span className="save-state">{dirty ? 'Cambios sin guardar' : `Versión ${event.version} · Todo guardado`}</span></p></div><div className="heading-actions"><button className="button secondary" onClick={() => setPreview(true)}><Eye size={17} />Vista previa</button>{published ? <a className="button primary" href={`#/catalog/${id}`}><ExternalLink size={16} />Ver publicación</a> : <button className="button primary" onClick={() => save()} disabled={busy || !dirty}><Save size={16} />Guardar borrador</button>}</div></div><ErrorBox error={error} />
    <button type="button" className="event-manage-action editor-manage-action" disabled={busy} onClick={() => setManageEvent(true)}>
      {published ? <Layers size={15} /> : <Trash2 size={15} />}
      {published ? 'Retirar del catálogo' : 'Eliminar borrador'}
    </button>
    {manageEvent && <EventLifecycleDialog event={event} dirty={dirty} close={() => setManageEvent(false)} onChanged={onLifecycleChanged} />}
    {published ? <><div className="notice green"><CheckCircle2 size={20} /><span>Tu evento ya es público. Esta versión queda protegida contra cambios.</span></div><div className="editor-layout assistant-workspace"><div className="editor-main"><EventChat event={event} dirty={false} /></div><EventPreview event={event} /></div></> : <>
      <div className="editor-tabs tabs"><button className={tab === 'assistant' ? 'active' : ''} onClick={() => setTab('assistant')}><span>01</span>Asistente</button><button className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}><span>02</span>Información</button><button className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}><span>03</span>Entradas</button><button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}><span>04</span>Publicar</button></div>
      <div className={`editor-layout ${tab === 'assistant' ? 'assistant-workspace' : ''}`}><div className="editor-main">
      <div className="assistant-pane" hidden={tab !== 'assistant'}><EventChat event={event} dirty={dirty} onReview={() => setTab('details')} record={activeImport} onImport={onImport} onInspect={() => { setError(null); setInspectImport(true); }} /></div>
      {tab === 'details' && <><section className="form-panel"><div className="section-title"><div><h2>Los detalles que hacen la diferencia</h2><p>Completa o ajusta la información de tu evento.</p></div></div><Field label="Nombre del evento" required><input value={form.title} maxLength={140} onChange={e => change('title', e.target.value)} placeholder="Ej. Noche de Salsa" /></Field><div className="form-grid"><Field label="Categoría"><select value={form.category} onChange={e => change('category', e.target.value)}>{['Concierto', 'Festival', 'Teatro', 'Conferencia', 'Taller', 'Deporte', 'Otro'].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Ciudad" required><input value={form.city} maxLength={80} onChange={e => change('city', e.target.value)} placeholder="Ej. Lima" /></Field><Field label="Fecha" required><input type="date" value={form.date} onChange={e => change('date', e.target.value)} /></Field><Field label="Hora de inicio" required><input type="time" value={form.time} onChange={e => change('time', e.target.value)} /></Field></div><Field label="Zona horaria"><select value={form.timezone} onChange={e => change('timezone', e.target.value)}>{['America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'].map(x => <option key={x}>{x}</option>)}</select></Field><Field label="Lugar" required><input value={form.venue} maxLength={150} onChange={e => change('venue', e.target.value)} placeholder="Nombre del local o recinto" /></Field><Field label="Cuéntale al público qué lo espera" required hint="Usa información confirmada. No incluyas datos privados del documento."><textarea rows={5} value={form.description} maxLength={5000} onChange={e => change('description', e.target.value)} placeholder="Música en vivo, una noche para compartir…" /></Field><div className="panel-actions"><button className="button secondary" onClick={() => save()} disabled={busy || !dirty}>Guardar cambios</button><button className="button primary" onClick={() => setTab('tickets')}>Continuar con entradas<ArrowRight size={16} /></button></div></section></>}
      {tab === 'tickets' && <section className="form-panel"><div className="section-title"><div><h2>Un lugar para cada experiencia</h2><p>Define las zonas y los precios que verá el público.</p></div></div><Field label="Aforo total del evento" required hint="La suma de cupos de las zonas no puede superar este número."><input type="number" min="0" max="1000000" value={form.capacity || ''} onChange={e => change('capacity', Number(e.target.value))} placeholder="Ej. 500" /></Field><div className="zones-label"><h3>Zonas de entrada</h3><span>{form.zones.length}/5 zonas</span></div>{form.zones.length === 0 && <div className="inline-empty"><Ticket size={24} /><p>Agrega tu primera zona, por ejemplo General o VIP.</p></div>}{form.zones.map((zone, i) => <div className="zone-row" key={i}><Field label="Nombre"><input value={zone.name} maxLength={60} placeholder="General" onChange={e => change('zones', form.zones.map((z, j) => i === j ? { ...z, name: e.target.value } : z))} /></Field><Field label="Cupos"><input type="number" min="1" value={zone.capacity || ''} onChange={e => change('zones', form.zones.map((z, j) => i === j ? { ...z, capacity: Number(e.target.value) } : z))} /></Field><Field label="Precio (S/) "><input type="number" min="0.01" step="0.01" value={zone.price || ''} onChange={e => change('zones', form.zones.map((z, j) => i === j ? { ...z, price: Number(e.target.value) } : z))} /></Field><button className="icon-button danger" aria-label={`Eliminar zona ${zone.name || i + 1}`} onClick={() => change('zones', form.zones.filter((_, j) => i !== j))}><Trash2 size={17} /></button></div>)}{form.zones.length < 5 && <button className="button secondary" onClick={() => change('zones', [...form.zones, { name: '', capacity: 1, price: 1 }])}><Plus size={16} />Agregar zona</button>}<div className={`capacity-summary ${form.zones.reduce((n, z) => n + z.capacity, 0) > form.capacity ? 'over' : ''}`}><Users size={18} />{form.zones.reduce((n, z) => n + z.capacity, 0)} cupos asignados de {form.capacity || 0}</div><p className="helper">Los precios los defines tú. Este MVP publica la oferta; todavía no procesa pagos ni vende entradas.</p><div className="panel-actions"><button className="button secondary" onClick={() => save()} disabled={busy || !dirty}>Guardar entradas</button><button className="button primary" onClick={() => setTab('review')}>Revisar publicación<ArrowRight size={16} /></button></div></section>}
      {tab === 'review' && <section className="form-panel"><div className="section-title"><div><h2>Un último vistazo antes de salir</h2><p>Comprueba tus datos y elige cómo se verá tu evento.</p></div></div><div className="review-checklist">{[['Nombre del evento', form.title], ['Fecha y hora', form.date && form.time], ['Lugar y ciudad', form.venue && form.city], ['Descripción', form.description], ['Entradas y aforo', form.zones.length && form.capacity && form.zones.every(z => z.name && z.capacity > 0 && z.price > 0) && form.zones.reduce((n, z) => n + z.capacity, 0) <= form.capacity]].map(([name, value]) => <div key={name}>{value ? <CheckCircle2 size={19} className="success-icon" /> : <AlertCircle size={19} className="warning-icon" />}<span>{name}</span><small>{value ? 'Completado' : 'Por completar'}</small></div>)}</div><h3>Una identidad para tu publicación</h3><div className="theme-picker">{['violet', 'peach', 'forest', 'midnight'].map(theme => <button className={`theme-swatch ${theme} ${form.theme === theme ? 'selected' : ''}`} aria-label={`Estilo ${theme}`} aria-pressed={form.theme === theme} key={theme} onClick={() => change('theme', theme)}>{form.theme === theme && <Check size={17} />}</button>)}</div><div className="notice"><LockKeyhole size={18} /><span>Solo se publican los datos del formulario. El PDF, las fuentes y las observaciones permanecen privados.</span></div><div className="panel-actions"><button className="button secondary" onClick={() => setPreview(true)}><Eye size={16} />Ver ficha completa</button><button className="button primary" disabled={busy} onClick={() => { setError(null); setConfirm(true); }}>
        {dirty ? 'Guardar y publicar' : 'Publicar evento'}<ArrowUpRight size={16} />
      </button></div></section>}
      </div><EventPreview event={form} /></div>
    </>}
    {inspectImport && <Modal title="Revisión del documento" close={() => setInspectImport(false)}><ImportReview record={activeImport} event={event} choices={choices} onChoose={choose} onRemove={removeChoice} onApply={async () => { const saved = await save(true); if (saved) setInspectImport(false); }} busy={busy} dirty={dirty} error={error} notify={notify} /></Modal>}
    {preview && <Modal title="Vista previa de tu publicación" close={() => setPreview(false)}><div className="modal-preview"><Poster event={form} /><h2>{form.title || 'Tu evento'}</h2><p>{dateLabel(form.date)} · {form.time || 'Hora por definir'} · {form.timezone}</p><p>{form.venue || 'Lugar por definir'}{form.city && `, ${form.city}`}</p><p className="description-text">{form.description || 'La descripción de tu evento aparecerá aquí.'}</p>{form.zones.map((z, i) => <div className="ticket-price" key={i}><span>{z.name || 'Zona'}</span><strong>{money(z.price)}</strong></div>)}<p className="helper">Las compras aún no están habilitadas en este MVP.</p></div></Modal>}
    {confirm && <Modal title={dirty ? '¿Guardar y publicar?' : '¿Publicar evento?'} close={closePublish}>
      <p className="modal-copy">
        {dirty ? 'Guardaremos tus cambios y publicaremos ' : 'Publicaremos '}
        <strong>{form.title || 'tu evento'}</strong> en el catálogo.
      </p>
      <div className="notice"><LockKeyhole size={18} />Tu documento y la revisión permanecen privados.</div>
      <ErrorBox error={error} />
      <div className="panel-actions">
        <button className="button secondary" onClick={closePublish} disabled={busy}>Seguir revisando</button>
        <button className="button primary" onClick={publish} disabled={busy}>
          {busy ? 'Publicando…' : dirty ? 'Sí, guardar y publicar' : 'Sí, publicar evento'}<ArrowUpRight size={16} />
        </button>
      </div>
    </Modal>}
  </>;
}

function History({ notify }) {
  const [items, setItems] = useState(null), [error, setError] = useState(null);
  useEffect(() => { api('/importaciones').then(data => setItems(data.items)).catch(setError); }, []);
  return <><div className="page-heading"><div><div className="eyebrow muted">CADA REVISIÓN, EN SU LUGAR</div><h1>Importaciones</h1><p>Consulta tus documentos y los resultados de cada revisión.</p></div></div><ErrorBox error={error} />{!items ? !error && <Spinner /> : items.length ? <div className="history-list">{items.map(row => <article className="history-row" key={row.id}><span className="history-icon"><FileText size={22} /></span><div><h3>{row.filename}</h3><p>{row.eventTitle || 'Evento sin título'} · Versión {row.inputVersion} · {new Date(row.createdAt).toLocaleDateString('es-PE')}</p><span className="history-status">{row.status === 'FALLIDA' ? 'Importación fallida' : row.status === 'EN_PROCESO' ? 'En proceso' : 'Lista para revisar'}{row.mode === 'BASIC' && ' · Extracción básica, sin IA'}</span></div><div className="history-actions"><button className="button secondary" onClick={() => go(`/events/${row.eventId}`)}>Ver evento<ArrowUpRight size={15} /></button><button className="icon-button" aria-label={`Descargar reporte de ${row.filename}`} disabled={row.reportStatus !== 'READY'} onClick={() => downloadReport(row.id).catch(err => notify(err.message, 'error'))}><Download size={18} /></button></div></article>)}</div> : <section className="empty-state"><span className="empty-icon"><FileText size={29} /></span><h3>Tu historial comienza con el primer documento</h3><p>Crea un evento y sube su PDF. Las revisiones aparecerán aquí.</p><button className="text-button" onClick={() => go('/events')}>Ir a mis eventos<ArrowRight size={16} /></button></section>}</>;
}

function Catalog({ id, user }) {
  const [data, setData] = useState(null), [error, setError] = useState(null);
  useEffect(() => { setData(null); setError(null); api(id ? `/catalogo/${id}` : '/catalogo').then(setData).catch(setError); }, [id]);
  return <div className="public-page"><header className="public-header"><a href="#/catalog"><Brand small /></a><a className="button secondary" href="#/events">{user ? 'Mi Studio' : 'Organiza tu evento'}<ArrowUpRight size={16} /></a></header><main className="public-content"><ErrorBox error={error} />{!data ? !error && <Spinner /> : id ? <><a className="back-link" href="#/catalog"><ArrowLeft size={16} />Todos los eventos</a><div className="public-detail"><Poster event={data} /><section><span className="eyebrow muted">{data.category} · {data.city}</span><h1>{data.title}</h1><p className="public-meta"><Calendar size={18} />{dateLabel(data.date)} · {data.time}<small>{data.timezone}</small></p><p className="public-meta"><MapPin size={18} />{data.venue}, {data.city}</p><p className="public-organizer">Organizado por <strong>{data.organizerName}</strong></p><p className="description-text">{data.description}</p><div className="public-tickets"><h3>Elige tu experiencia</h3>{data.zones.map((zone, i) => <div className="ticket-price" key={i}><span><Ticket size={17} />{zone.name}</span><strong>{money(zone.price)}</strong></div>)}<div className="notice"><Clock3 size={18} /><span>Evento publicado. La compra de entradas todavía no está habilitada en este MVP.</span></div></div></section></div></> : <><div className="catalog-heading"><span className="eyebrow">HAY ALGO BUENO POR VIVIR</span><h1>Tu próximo<br /><em>gran momento.</em></h1><p>Descubre los eventos que sus organizadores ya confirmaron.</p></div>{data.items.length ? <div className="event-grid">{data.items.map(event => <article className="event-card" key={event.id}><a href={`#/catalog/${event.id}`}><Poster event={event} compact /></a><div className="event-card-body"><span className="event-category">{event.category}</span><h3><a href={`#/catalog/${event.id}`}>{event.title}</a></h3><p><Calendar size={14} />{dateLabel(event.date)}</p><p><MapPin size={14} />{event.venue}</p><div className="event-card-bottom"><span>Desde {money(Math.min(...event.zones.map(z => z.price)))}</span><a href={`#/catalog/${event.id}`} className="circle-button" aria-label={`Ver ${event.title}`}><ArrowUpRight size={18} /></a></div></div></article>)}</div> : <section className="empty-state"><Ticket size={32} /><h3>Pronto habrá algo que celebrar</h3><p>Los eventos aparecerán cuando sus organizadores los publiquen.</p></section>}</>}</main><footer className="public-footer"><Brand small /><span>Hecho para los momentos que importan.</span></footer></div>;
}

export default function App() {
  const [path, setPath] = useState(route()), [user, setUser] = useState(null), [authLoading, setAuthLoading] = useState(Boolean(token())), [events, setEvents] = useState([]), [eventsLoading, setEventsLoading] = useState(false), [loadError, setLoadError] = useState(null), [toast, setToast] = useState(null), [mobileOpen, setMobileOpen] = useState(false), [health, setHealth] = useState(null);
  const toastTimer = useRef();
  function notify(message, type = 'success') { clearTimeout(toastTimer.current); setToast({ message, type }); toastTimer.current = setTimeout(() => setToast(null), 5500); }
  useEffect(() => { const handler = () => { setPath(route()); setMobileOpen(false); window.scrollTo(0, 0); }; window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => { if (!token()) return; api('/auth/me').then(setUser).catch(err => { if (err.status === 401) setToken(''); }).finally(() => setAuthLoading(false)); }, []);
  async function refresh() { const data = await api('/eventos'); setEvents(data.items); setLoadError(null); }
  function onEventChanged(eventId, updated) {
    setEvents(current => updated
      ? current.map(event => event.id === eventId ? updated : event)
      : current.filter(event => event.id !== eventId));
    notify(updated ? 'Retirado del catálogo. Puedes editar el borrador.' : 'Borrador eliminado.');
  }
  useEffect(() => { if (!user) return; setEventsLoading(true); refresh().catch(setLoadError).finally(() => setEventsLoading(false)); api('/health').then(setHealth).catch(() => {}); }, [user]);
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setToken(''); setUser(null); setEvents([]); go('/events'); }
  if (path.startsWith('/catalog')) return <Catalog id={path.split('/')[2]} user={user} />;
  if (authLoading) return <Spinner text="Abriendo tu espacio…" />;
  if (!user) return <Auth onLogin={setUser} />;
  const editorId = path.startsWith('/events/') || path.startsWith('/assistant/') ? path.split('/')[2] : null;
  return <div className="studio-shell"><a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Saltar al contenido</a>{mobileOpen && <button className="sidebar-overlay" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)} />}<aside className={`sidebar ${mobileOpen ? 'open' : ''}`}><a className="sidebar-brand" href="#/events"><Brand /></a><span className="workspace-label">TU BACKSTAGE</span><nav aria-label="Navegación principal"><a href="#/events" className={path.startsWith('/events') ? 'active' : ''}><LayoutGrid size={18} />Mis eventos<span className="nav-count">{events.length}</span></a><a href="#/assistant" className={path.startsWith('/assistant') ? 'active' : ''}><Sparkles size={18} />Asistente IA</a><a href="#/imports" className={path === '/imports' ? 'active' : ''}><FileText size={18} />Importaciones</a><a href="#/catalog"><ArrowUpRight size={18} />Catálogo público</a></nav><div className="sidebar-guide"><span><Sparkles size={17} />UN POCO DE AYUDA</span><p>Tu documento puede ser el comienzo de tu próximo evento.</p><a href={apiUrl('/examples/event.pdf')} download="evento-ejemplo.pdf">Descargar PDF de ejemplo<ArrowUpRight size={14} /></a></div><div className="sidebar-user"><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>Organizador</small></span><button className="icon-button" onClick={logout} aria-label="Cerrar sesión"><LogOut size={17} /></button></div></aside><div className="studio-main"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Studio</span><ChevronRight size={13} /><strong>{editorId ? 'Preparar evento' : path === '/imports' ? 'Importaciones' : path === '/assistant' ? 'Asistente IA' : 'Mis eventos'}</strong></div><span className="topbar-note"><span className="status-dot" />Tu próximo gran momento</span><span className="avatar small">{user.name.slice(0, 1).toUpperCase()}</span></header><main id="main" tabIndex={-1} className="main-content">{health && !health.aiConfigured && <div className="configuration-note"><span>{health.storage === "sqlite" ? "Modo local" : "Conexión pendiente"}</span>{health.basicExtraction ? "La revisión de PDF usa extracción básica hasta conectar Groq." : "Configura Groq para revisar documentos con IA."} Tus eventos y publicaciones funcionan normalmente.</div>}<ErrorBox error={loadError} />{loadError && <button className="text-button" onClick={() => refresh().catch(setLoadError)}>Reintentar carga</button>}{editorId ? <Editor key={editorId} id={editorId} refresh={refresh} notify={notify} onEventChanged={onEventChanged} backTo={path.startsWith('/assistant/') ? '/assistant' : '/events'} /> : path === '/imports' ? <History notify={notify} /> : eventsLoading ? <Spinner text="Preparando tus eventos…" /> : path === '/assistant' ? <AssistantHome events={events} refresh={refresh} notify={notify} /> : <Dashboard events={events} refresh={refresh} user={user} notify={notify} onEventChanged={onEventChanged} />}<footer className="studio-footer"><span>TicketPass Studio</span><span>Para quienes crean experiencias.</span></footer></main></div>{toast && <div className={`toast ${toast.type}`} role="status">{toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Cerrar notificación"><X size={16} /></button></div>}</div>;
}
