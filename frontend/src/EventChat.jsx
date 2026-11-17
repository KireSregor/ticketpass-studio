import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, LoaderCircle, ArrowRight, LockKeyhole, Paperclip, FileText, X } from 'lucide-react';
import { api, apiUrl, uploadPdf } from './api.js';

export default function EventChat({ event, dirty, onReview, record, onImport, onInspect }) {
  const [messages, setMessages] = useState([]), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [drag, setDrag] = useState(false);
  const transcript = useRef(null), input = useRef(null), follow = useRef(true), dragDepth = useRef(0);
  const processing = record?.status === 'EN_PROCESO';
  const canAttach = event.status === 'BORRADOR' && Boolean(onImport);
  useEffect(() => { if (follow.current && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; }, [messages, busy, uploading, record?.status]);
  async function ask(text) {
    if (busy || text.trim().length < 2) return;
    follow.current = true; setBusy(true); setError(''); setQuestion('');
    setMessages(current => [...current, { role: 'user', text }]);
    try {
      const response = await api(`/asistente/${event.id}`, { method: 'POST', body: { message: text } });
      setMessages(current => [...current, { role: 'assistant', text: response.answer, sources: response.sources }]);
    } catch (err) { setError(err.message); setQuestion(text); }
    finally { setBusy(false); }
  }
  async function attach(file) {
    if (!file || uploading || processing) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 5 * 1024 * 1024) { setError('Selecciona un PDF de hasta 5 MB.'); return; }
    follow.current = true; setUploading(true); setError('');
    try { onImport(await uploadPdf(event, file)); }
    catch (err) { setError(err.message); }
    finally { setUploading(false); }
  }
  async function sample() {
    try {
      const response = await fetch(apiUrl('/examples/event.pdf'));
      if (!response.ok) throw new Error();
      await attach(new File([await response.blob()], 'evento-ejemplo.pdf', { type: 'application/pdf' }));
    } catch { setError('No pudimos abrir el ejemplo. Puedes adjuntar tu propio PDF.'); }
  }
  function resetDrag() { dragDepth.current = 0; setDrag(false); }
  return <section className={`event-chat ${drag ? 'chat-dragging' : ''}`} aria-label="Asistente de este evento"
    onDragEnter={e => { if (!canAttach || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragDepth.current += 1; setDrag(true); }}
    onDragOver={e => { if (canAttach && e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
    onDragLeave={e => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) resetDrag(); }}
    onDrop={e => { e.preventDefault(); resetDrag(); if (canAttach) attach(e.dataTransfer.files[0]); }}>
    <div className="chat-heading"><span className="section-icon"><Sparkles size={20} /></span><h2>Asistente TicketPass</h2><span className="chat-private"><LockKeyhole size={13} />Privado</span></div>
    <div ref={transcript} className="chat-transcript" role="log" aria-label="Conversación del evento" aria-busy={busy || uploading || processing} onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      <article className="chat-message assistant"><strong>Asistente de TicketPass</strong><p>{canAttach ? 'Adjunta la ficha o el contrato de tu evento con el clip, o arrastra el PDF aquí. Revisaremos los datos y lo que falta antes de publicar.' : 'Consulta los datos y documentos de este evento. Te mostraré las fuentes de cada respuesta.'}</p>{canAttach && <small>PDF con texto · Hasta 5 páginas y 5 MB. El texto se procesa con Groq y el documento permanece privado en TicketPass.</small>}</article>
      {messages.map((message, index) => <article key={index} className={`chat-message ${message.role}`}><strong>{message.role === 'user' ? 'Tú' : 'Asistente de TicketPass'}</strong><p>{message.text}</p>{message.sources?.map((source, i) => <blockquote key={i}>“{source.quote}”<cite>{source.filename} · Página {source.page}</cite></blockquote>)}</article>)}
      {record && <article className="chat-document"><FileText size={21} /><div><strong>{record.filename}</strong><p>{processing ? record.message : record.status === 'FALLIDA' ? record.message : 'Documento revisado. Confirma los datos antes de guardarlos.'}</p>{onInspect && <button className="text-button" onClick={onInspect}>{processing ? 'Ver progreso' : record.status === 'FALLIDA' ? 'Ver detalle' : 'Revisar datos encontrados'}<ArrowRight size={14} /></button>}</div>{processing && <LoaderCircle className="spin" size={16} />}</article>}
      {(busy || uploading) && <div className="chat-thinking" role="status"><LoaderCircle className="spin" size={16} />{uploading ? 'Adjuntando tu documento…' : 'Revisando tu evento y sus fuentes…'}</div>}
      {dirty && <div className="notice amber">Guarda tus cambios para que el chat consulte la ficha actualizada.</div>}
      {error && <div className="error-box" role="alert"><span>{error}</span><button className="icon-button" aria-label="Cerrar error" onClick={() => setError('')}><X size={15} /></button></div>}
    </div>
    <div className="chat-controls">
      {messages.length === 0 && <div className="chat-suggestions">{['¿Cómo está mi evento?', '¿Qué falta para publicarlo?'].map(text => <button key={text} disabled={busy} onClick={() => ask(text)}>{text}</button>)}{canAttach && !record && <button disabled={uploading || processing} onClick={sample}>Probar un PDF de ejemplo</button>}</div>}
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); ask(question); }}>
        {canAttach && <><input ref={input} type="file" accept=".pdf,application/pdf" className="sr-only" aria-label="Adjuntar PDF del evento" onChange={e => { attach(e.target.files[0]); e.target.value = ''; }} /><button className="icon-button chat-attach" type="button" aria-label="Adjuntar PDF" title="Adjuntar PDF" disabled={uploading || processing} onClick={() => input.current.click()}><Paperclip size={20} /></button></>}
        <label className="sr-only" htmlFor={`chat-${event.id}`}>Consulta sobre este evento</label><textarea id={`chat-${event.id}`} value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} rows={2} placeholder="Pregunta sobre tu evento…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(question); } }} />
        <button className="button primary" type="submit" disabled={busy || question.trim().length < 2} aria-label="Enviar consulta"><Send size={17} /></button>
      </form>
      <div className="chat-footer"><span>Solo este evento y sus documentos</span>{onReview && <button className="text-button" onClick={onReview}>Revisar ficha<ArrowRight size={14} /></button>}</div>
    </div>
    {drag && <div className="chat-drop-overlay"><Paperclip size={28} /><strong>Suelta tu PDF aquí</strong></div>}
  </section>;
}
