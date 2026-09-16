import { useEffect, useState } from 'react';
import { api, type Course, type Lesson, type Comment } from './api';
import { useAcademy } from './AcademyContext';
import { courseResult } from '../shared/assessment.js';
import CourseCertificate from './CourseCertificate';
import StudentAttachments from './StudentAttachments';
import { Empty, PageTitle, Progress, ResourceState, useResource } from './ui';

function Video({ url }: { url: string }) {
  let embed = '';
  try {
    const parsed = new URL(url, window.location.origin);
    if (['youtube.com', 'www.youtube.com', 'youtu.be'].includes(parsed.hostname)) {
      const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') || parsed.pathname.split('/').at(-1);
      if (id && /^[\w-]{11}$/.test(id)) embed = 'https://www.youtube-nocookie.com/embed/' + id;
    }
    if (['vimeo.com', 'player.vimeo.com'].includes(parsed.hostname)) { const id = parsed.pathname.split('/').at(-1); if (id && /^\d+$/.test(id)) embed = 'https://player.vimeo.com/video/' + id; }
  } catch { /* Render the configured media as a native video. */ }
  return <div className="academy-video">{embed ? <iframe title="Video de la lección" src={embed} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <video src={url} controls preload="metadata">Tu navegador no puede reproducir este video.</video>}<a href={url} target="_blank" rel="noopener noreferrer">Abrir video en otra pestaña ↗</a></div>;
}

export default function CoursePlayer({ courseId }: { courseId: number }) {
  const { notify, navigate } = useAcademy();
  const course = useResource<Course>('/courses/' + courseId), lessons = useResource<Lesson[]>('/courses/' + courseId + '/lessons');
  const [activeId, setActiveId] = useState<number | null>(null), [drafts, setDrafts] = useState<Record<number, string>>({}), [busy, setBusy] = useState(false), [showCertificate, setShowCertificate] = useState(false);
  const rows = lessons.data || [], current = rows.find(row => row.id === activeId) || rows.find(row => !row.completed) || rows[0];
  const index = current ? rows.findIndex(row => row.id === current.id) : 0;
  const note = current ? drafts[current.id] ?? current.note ?? '' : '';
  const dirty = rows.some(row => drafts[row.id] !== undefined && drafts[row.id] !== (row.note || ''));
  const saveNotes = async () => {
    if (!current) return;
    setActiveId(current.id);
    await api('/lessons/' + current.id + '/progress', 'PUT', { note });
    lessons.setData(previous => previous?.map(row => row.id === current.id ? { ...row, note } : row) || []);
  };
  const markInformative = async () => {
    if (!current || current.evaluation_mode !== 'informative' || current.completed) return;
    setBusy(true);
    try { await api('/lessons/' + current.id + '/progress', 'PUT', { completed: true, note }); lessons.setData(previous => previous?.map(row => row.id === current.id ? { ...row, completed: 1, note } : row) || []); notify('Lección marcada como vista.'); }
    catch (error) { notify((error as Error).message); }
    finally { setBusy(false); }
  };
  const change = async (id: number) => { if (busy) return; setBusy(true); try { if (current && note !== (current.note || '')) await saveNotes(); setActiveId(id); setShowCertificate(false); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } };
  const result = courseResult(rows);
  const completed = result.completedLessons;
  const openCertificate = async () => { if (!result.allCompleted || busy) return; setBusy(true); try { if (dirty) await saveNotes(); setShowCertificate(true); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } };
  return <>
    <PageTitle label="TU AULA" title={course.data?.title || 'Cargando curso…'}><button className="academy-secondary" onClick={async () => { try { if (dirty) await saveNotes(); navigate('dashboard'); } catch (error) { notify((error as Error).message); } }}>← Mis cursos</button></PageTitle>
    <ResourceState loading={course.loading || lessons.loading} error={course.error || lessons.error} retry={() => { course.reload(); lessons.reload(); }} />
    {!lessons.loading && !lessons.error && !rows.length && <Empty title="El contenido de este curso está en preparación"><p>Tu inscripción se conserva. Las lecciones aparecerán aquí cuando se publiquen.</p></Empty>}
    {current && <div className="academy-classroom">
      <aside className="academy-syllabus"><h2>Contenido del curso</h2><Progress completed={completed} total={rows.length} /><ol>{rows.map((lesson, position) => <li key={lesson.id}><button disabled={busy} aria-current={!showCertificate && current.id === lesson.id ? 'step' : undefined} onClick={() => change(lesson.id)}><span className={lesson.completed ? 'academy-done' : ''}>{lesson.completed ? '✓' : String(position + 1).padStart(2, '0')}</span><span>{lesson.title}<small>{lesson.video_url ? 'Video y materiales' : 'Lectura y actividad'}</small></span></button></li>)}</ol><div className="academy-certificate-entry"><button disabled={busy || !result.allCompleted} aria-current={showCertificate ? 'step' : undefined} onClick={openCertificate}><span aria-hidden="true">{result.allCompleted ? '✓' : '🔒'}</span><span>Resultado y certificado<small>{result.allCompleted ? 'Disponible · Ver nota final' : 'Se habilita al aprobar el 100%'}</small></span></button></div></aside>
      <div className="academy-lesson">
        {showCertificate ? <CourseCertificate courseId={courseId} /> : <>
        {current.video_url && <Video key={current.video_url} url={current.video_url} />}
        <div className="academy-panel"><div className="academy-lesson-heading"><div><p className="academy-eyebrow">LECCIÓN {index + 1} DE {rows.length}</p><h2>{current.title}</h2></div><div className="academy-lesson-badges"><span className="academy-badge">{current.lesson_type==='form'?'Formulario':'Contenido'}</span><span className={'academy-badge '+(current.evaluation_mode==='informative'?'academy-badge-info':'academy-badge-gold')}>{current.evaluation_mode==='informative'?'Solo informativa':'Calificable'}</span></div></div><div className="academy-reading">{current.content.split(/\n\s*\n/).map((paragraph, position) => <p key={position}>{paragraph}</p>)}</div>
          {current.resource_url && <a className="academy-resource" href={current.resource_url} target="_blank" rel="noopener noreferrer">Material de apoyo · Abrir recurso ↗</a>}
          {current.lesson_type === 'form' && <LessonForm key={current.id} lesson={current} onCompleted={()=>{if(current.evaluation_mode==='informative') lessons.setData(previous => previous?.map(row => row.id === current.id ? { ...row, completed: 1 } : row) || []);}} />}
          <StudentAttachments key={'submission-'+current.id} lessonId={current.id} />
          <div className="academy-grade-status">{current.evaluation_mode==='informative' ? <><span className="academy-badge academy-badge-info">Contenido informativo</span>{current.completed ? <strong>✓ Marcada como vista</strong> : <span className="academy-muted">Lee el contenido y marca esta lección como vista cuando termines.</span>}</> : current.score !== null && current.score !== undefined ? <><strong>Calificación: {current.score}/100</strong>{current.completed ? <span className="academy-badge">✓ Lección aprobada</span> : <span className="academy-badge academy-badge-draft">No aprobada · revisa la retroalimentación</span>}{current.teacher_note && <p>{current.teacher_note}</p>}</> : <span className="academy-muted">Tu profesor revisará esta actividad y registrará la calificación.</span>}</div><div className="academy-actions">{current.evaluation_mode==='informative'&&<button className="academy-secondary" disabled={busy || Boolean(current.completed)} onClick={markInformative}>{current.completed?'Lección vista':'Marcar como vista'}</button>}<button className="academy-secondary" disabled={busy || note === (current.note || '')} onClick={async () => { setBusy(true); try { await saveNotes(); notify('Notas guardadas.'); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } }}>Guardar notas</button><button className="academy-secondary" disabled={busy || index === rows.length - 1} onClick={() => change(rows[index + 1].id)}>Siguiente lección →</button></div>
        </div>
        {result.allCompleted && <div className="academy-completion"><div><p className="academy-eyebrow">RECORRIDO COMPLETADO</p><h2>Un paso más en tu aprendizaje.</h2><p>Aprobaste el <strong>100% del curso</strong>{result.finalScore !== null ? <> con <strong>{result.finalScore.toLocaleString('es-CO')}% de nota final</strong>.</> : '. Curso informativo sin nota numérica.'}</p></div><button className="academy-primary" disabled={busy} onClick={openCertificate}>Ver resultado y certificado</button></div>}

        <section className="academy-panel academy-notes-panel"><div className="academy-section-head"><div><p className="academy-eyebrow">APUNTES PERSONALES</p><h2>Mis notas</h2></div><span className="academy-note-privacy">🔒 Solo tú puedes verlas</span></div><label className="academy-notes-field">Notas de esta lección<textarea rows={5} maxLength={20000} value={note} placeholder="Guarda una idea, una pregunta o tu siguiente paso…" onChange={event => setDrafts(previous => ({ ...previous, [current.id]: event.target.value }))} /></label><div className="academy-notes-footer"><span className={note === (current.note || '') ? 'academy-note-saved' : 'academy-note-dirty'}>{note === (current.note || '') ? '✓ Guardado' : '● Cambios sin guardar'}</span><span>{note.length.toLocaleString('es-CO')} / 20.000 caracteres</span><button className="academy-primary" disabled={busy || note === (current.note || '')} onClick={async () => { setBusy(true); try { await saveNotes(); notify('Notas guardadas.'); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } }}>Guardar notas</button></div></section>
        <Comments key={current.id} lessonId={current.id} />
        </>}
      </div>
    </div>}
  </>;
}

type FormField = { id:string; label:string; help?:string; placeholder?:string; type:'text'|'textarea'|'number'|'select'|'checkbox'; required?:boolean; options?:string[]; min?:number; max?:number };
type FormResponse = { id:string; answers:string; validated:number; submitted_at:string; form_schema?:string; question_grades?:string };
function LessonForm({ lesson, onCompleted }: { lesson: Lesson; onCompleted: () => void }) { const { notify }=useAcademy(); const response=useResource<FormResponse|null>('/lessons/'+lesson.id+'/form-responses'); const [answers,setAnswers]=useState<Record<string,string|boolean>>({}); const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false); const locked=Boolean(response.data?.id)||submitted; let marks:Record<string,boolean>={}; try{marks=JSON.parse(response.data?.question_grades||'{}');}catch{} let fields:FormField[]=[]; try { fields=JSON.parse(response.data?.form_schema||lesson.form_schema||'{"fields":[]}').fields||[]; } catch {} useEffect(()=>{if(response.data?.answers){try{setAnswers(JSON.parse(response.data.answers));}catch{setAnswers({});}setSubmitted(true);}},[response.data]); if(!fields.length)return <div className="academy-form-note">El profesor aún no ha configurado los campos de este formulario.</div>; return <form className={'academy-lesson-form '+(locked?'academy-lesson-form-locked':'')} onSubmit={async event=>{event.preventDefault();if(locked)return;setBusy(true);try{await api('/lessons/'+lesson.id+'/form-responses','POST',{answers});setSubmitted(true);response.reload();onCompleted();notify(lesson.evaluation_mode==='informative'?'Formulario enviado y lección marcada como vista.':'Formulario enviado al profesor.');}catch(error){notify((error as Error).message);}finally{setBusy(false);}}}><div className="academy-form-head"><div><p className="academy-eyebrow">{lesson.evaluation_mode==='informative'?'ACTIVIDAD INFORMATIVA':'ACTIVIDAD EVALUABLE'}</p><h3>{locked?'Formulario enviado':'Completa el formulario'}</h3><p className="academy-muted">{locked?'Tus respuestas quedaron registradas y ya no se pueden editar.':'Revisa tus respuestas antes de enviarlas; después del envío quedarán bloqueadas.'}</p></div>{locked&&<span className="academy-badge academy-badge-info">✓ Enviado</span>}</div>{fields.map(field=><label key={field.id}>{field.label}{field.help&&<small className="academy-field-help">{field.help}</small>}{field.type==='textarea'?<textarea disabled={locked} placeholder={field.placeholder} required={field.required} rows={4} value={String(answers[field.id]??'')} onChange={e=>setAnswers(prev=>({...prev,[field.id]:e.target.value}))}/>:field.type==='select'?<select disabled={locked} required={field.required} value={String(answers[field.id]??'')} onChange={e=>setAnswers(prev=>({...prev,[field.id]:e.target.value}))}><option value="">Selecciona una opción</option>{(field.options||[]).map(option=><option key={option}>{option}</option>)}</select>:field.type==='checkbox'?<span className="academy-check"><input disabled={locked} type="checkbox" checked={Boolean(answers[field.id])} required={field.required} onChange={e=>setAnswers(prev=>({...prev,[field.id]:e.target.checked}))}/>Confirmo</span>:<input disabled={locked} required={field.required} placeholder={field.placeholder} type={field.type==='number'?'number':'text'} min={field.min} max={field.max} value={String(answers[field.id]??'')} onChange={e=>setAnswers(prev=>({...prev,[field.id]:e.target.value}))}/>}{locked&&typeof marks[field.id]==='boolean'&&<span className={'academy-answer-result '+(marks[field.id]?'is-correct':'is-incorrect')}>{marks[field.id]?'✓ Respuesta correcta':'✕ Respuesta incorrecta'}</span>}</label>)}{!locked&&<button className="academy-primary" disabled={busy}>{busy?'Enviando…':'Enviar respuestas'}</button>}</form>; }


function Comments({ lessonId }: { lessonId: number }) {
  const { user, notify } = useAcademy(); const resource = useResource<Comment[]>('/lessons/' + lessonId + '/comments'); const [body, setBody] = useState(''), [busy, setBusy] = useState(false);
  return <section className="academy-panel"><h2>Conversación de la lección</h2><p className="academy-muted">Comparte tus preguntas e ideas con quienes están aprendiendo.</p><form className="academy-form" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await api('/lessons/' + lessonId + '/comments', 'POST', { body }); setBody(''); resource.reload(); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } }}><label>Tu comentario<textarea required rows={3} value={body} onChange={event => setBody(event.target.value)} maxLength={3000} /></label><button className="academy-primary" disabled={busy || !body.trim()}>{busy ? 'Publicando…' : 'Publicar comentario'}</button></form><ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />{resource.data?.length === 0 && <p className="academy-muted">Sé la primera persona en iniciar la conversación.</p>}{resource.data?.map(comment => <article className="academy-comment" key={comment.id}><div><strong>{comment.name}</strong><time>{new Date(comment.created_at).toLocaleDateString('es-CO')}</time></div><p>{comment.body}</p>{(comment.owner || user?.role === 'admin') && <button className="academy-text-button" disabled={busy} onClick={async () => { setBusy(true); try { await api('/comments/' + comment.id, 'DELETE'); resource.reload(); } catch (error) { notify((error as Error).message); } finally { setBusy(false); } }}>Eliminar comentario</button>}</article>)}</section>;
}
