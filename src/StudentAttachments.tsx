import { useState } from 'react';
import { api, type Submission } from './api';
import { useAcademy } from './AcademyContext';
import { ResourceState, useResource } from './ui';
import { attachmentMime, ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES } from '../shared/attachments.js';

export default function StudentAttachments({ lessonId }: { lessonId:number }) {
  const { user } = useAcademy();
  const resource = useResource<Submission[]>('/lessons/' + lessonId + '/submissions');
  const [busy,setBusy] = useState(false), [note,setNote] = useState(''), [error,setError] = useState(''), [success,setSuccess] = useState('');
  if(user?.role !== 'student') return null;
  const upload = async (file:File) => {
    setError(''); setSuccess('');
    const mime = attachmentMime(file.name);
    if(!mime) { setError('Selecciona un PDF, Excel (.xlsx) o Word (.docx).'); return; }
    if(!file.size) { setError('El archivo está vacío.'); return; }
    if(file.size > MAX_ATTACHMENT_BYTES) { setError('El archivo supera 10 MB. Reduce su tamaño antes de enviarlo.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/uploads',{method:'POST',credentials:'same-origin',headers:{'Content-Type':mime,'X-File-Name':encodeURIComponent(file.name)},body:file});
      const raw = await response.text(); let result:{url?:string;name?:string;error?:string};
      try { result=JSON.parse(raw); } catch { throw Error('No se pudo subir el archivo. Inténtalo nuevamente.'); }
      if(!response.ok || !result.url) throw Error(result.error || 'No se pudo subir el archivo.');
      await api('/lessons/' + lessonId + '/submissions','POST',{file_url:result.url,file_name:result.name || file.name,note});
      setNote(''); resource.reload(); setSuccess('Archivo enviado al profesor: ' + file.name);
    } catch(cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="academy-submission-box"><div><p className="academy-eyebrow">ENTREGA AL PROFESOR</p><h3>Adjunta tu trabajo</h3><p className="academy-muted">PDF, Excel (.xlsx) o Word (.docx). Máximo 10 MB por archivo.</p></div>
    <textarea aria-label="Mensaje para el profesor sobre el adjunto" rows={2} maxLength={3000} placeholder="Mensaje para tu profesor (opcional)" value={note} disabled={busy} onChange={event=>setNote(event.target.value)} />
    <label className="academy-upload-button">{busy?'Subiendo archivo…':'Seleccionar archivo desde tu computador'}<input aria-label="Adjuntar PDF, Excel o Word, máximo 10 MB" type="file" accept={ATTACHMENT_ACCEPT} disabled={busy} onChange={event=>{const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(file)void upload(file);}} /></label>
    {error && <p className="academy-error" role="alert">{error}</p>}{success && <p className="academy-upload-success" role="status">{success}</p>}
    <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
    <div className="academy-submission-list">{resource.data?.map(item=><div key={item.id}><a href={item.file_url} target="_blank" rel="noopener noreferrer">{item.file_name} ↗</a><span className={'academy-badge '+(item.status==='rejected'?'academy-badge-draft':'')}>{item.status==='approved'?'Revisada':item.status==='rejected'?'Requiere ajustes':'Pendiente de revisión'}</span>{item.feedback&&<p>{item.feedback}</p>}</div>)}</div>
  </section>;
}
