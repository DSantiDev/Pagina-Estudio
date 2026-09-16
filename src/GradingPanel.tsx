import { useState } from 'react';
import { api, type Course, type Lesson } from './api';
import { Dialog } from './AcademyContext';
import { Empty, ResourceState, useResource } from './ui';
import { readFormAnswers } from './formAnswers';
import { reviewSummary, type QuestionGrades } from '../shared/assessment.js';
import './grading.css';

type ReviewLesson = Pick<Lesson, 'id' | 'title' | 'position' | 'evaluation_mode' | 'lesson_type' | 'form_schema'>;
type Grade = { lesson_id: number; completed: number; score: number | null; teacher_note: string };
type Student = {
  id: string; name: string; email: string; progress: Grade[];
  submissions: Array<{ id: string; lesson_id: number; file_url: string; file_name: string; note?: string; submitted_at?: string }>;
  form_responses: Array<{ id: string; lesson_id: number; answers: string; submitted_at: string; form_schema?: string; question_grades?: string }>;
};
type Roster = { course: Course; lessons: ReviewLesson[]; students: Student[] };
type Result = 'pending' | 'approved' | 'rejected';
type Draft = { score: string; result: Result; note: string; questionGrades: QuestionGrades };
const labels: Record<Result, string> = { pending: 'Pendiente de revisión', approved: 'Aprobada', rejected: 'No aprobada' };
const draftKey = (lesson: ReviewLesson, student: Student) => `${lesson.id}:${student.id}`;
const resultOf = (grade?: Grade): Result => grade?.completed ? 'approved' : grade?.score != null ? 'rejected' : 'pending';
function draftOf(grade?: Grade, response?: Student['form_responses'][number]): Draft {
  let questionGrades: QuestionGrades = {};
  try { const value = JSON.parse(response?.question_grades || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) questionGrades = value; } catch {}
  return { score: grade?.score == null ? '' : String(grade.score), result: resultOf(grade), note: grade?.teacher_note || '', questionGrades };
}
function dateLabel(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function StudentName({ student }: { student: Student }) {
  return <div className="grading-student"><span className="grading-avatar" aria-hidden="true">{student.name[0]}</span><div><strong>{student.name}</strong><span>{student.email}</span></div></div>;
}

export default function GradeManager({ course, basePath, onBack }: { course: Course; basePath: string; onBack: () => void }) {
  const resource = useResource<Roster>(`${basePath}/courses/${course.id}/roster`);
  const [lessonId, setLessonId] = useState<number | ''>('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [saved, setSaved] = useState('');
  const lesson = resource.data?.lessons.find(item => item.id === lessonId);
  const students = resource.data?.students || [];
  const reviewing = students.find(student => student.id === reviewId);
  const gradeFor = (student: Student) => student.progress.find(item => item.lesson_id === lessonId);
  const hasEvidence = (student: Student) => student.submissions?.some(item => item.lesson_id === lessonId) || student.form_responses?.some(item => item.lesson_id === lessonId);
  const responseFor = (student: Student) => student.form_responses?.find(item => item.lesson_id === lessonId);
  const getDraft = (student: Student) => lesson ? drafts[draftKey(lesson, student)] || draftOf(gradeFor(student), responseFor(student)) : draftOf();
  const automatic = lesson?.lesson_type === 'form';
  const response = reviewing ? responseFor(reviewing) : undefined;
  const answerItems = response ? readFormAnswers(response.form_schema || lesson?.form_schema, response.answers).items : [];
  const review = reviewSummary(answerItems.map(item => item.key), reviewing ? getDraft(reviewing).questionGrades : {});
  const update = (patch: Partial<Draft>) => {
    if (!lesson || !reviewing) return;
    setDrafts(previous => ({ ...previous, [draftKey(lesson, reviewing)]: { ...getDraft(reviewing), ...patch } }));
    setSaved(''); setError('');
  };
  const saveGrade = async () => {
    if (!lesson || !reviewing || saving || lesson.evaluation_mode === 'informative') return;
    const draft = getDraft(reviewing);
    const score = automatic ? review.score : draft.score.trim() === '' ? null : Number(draft.score);
    const result = automatic ? (score !== null && score >= 70 ? 'approved' : 'rejected') : draft.result;
    if (automatic && !review.complete) { setError('Revisa todas las respuestas antes de guardar la calificación.'); return; }
    if (result === 'pending' && score !== null) { setError('Selecciona Aprobada o No aprobada para registrar esta nota.'); return; }
    if (result !== 'pending' && (score === null || !Number.isInteger(score) || score < 0 || score > 100)) { setError('Escribe una nota entera entre 0 y 100.'); return; }
    if (result === 'approved' && (score === null || score < 70)) { setError('Para aprobar la lección, la nota debe ser de 70 o más.'); return; }
    setSaving(true); setError(''); setSaved('');
    try {
      const savedGrade = await api<{score:number|null;completed:number;teacher_note:string;question_grades?:QuestionGrades}>(`${basePath}/lessons/${lesson.id}/grades/${encodeURIComponent(reviewing.id)}`, 'PUT', { score, completed: result === 'approved', teacher_note: draft.note, ...(automatic ? { question_grades: draft.questionGrades } : {}) });
      const grade: Grade = { lesson_id: lesson.id, completed: savedGrade.completed, score: savedGrade.score, teacher_note: savedGrade.teacher_note };
      resource.setData(previous => previous ? { ...previous, students: previous.students.map(student => student.id === reviewing.id ? { ...student, progress: [...student.progress.filter(item => item.lesson_id !== lesson.id), grade], form_responses: student.form_responses.map(item => item.lesson_id === lesson.id && savedGrade.question_grades ? { ...item, question_grades: JSON.stringify(savedGrade.question_grades) } : item) } : student) } : previous);
      setDrafts(previous => { const next = { ...previous }; delete next[draftKey(lesson, reviewing)]; return next; });
      setSaved('Calificación guardada. El estudiante ya puede consultar tu retroalimentación.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };
  const closeReview = () => { if (!saving) { setReviewId(null); setError(''); setSaved(''); } };
  return <>
    <div className="academy-section-head"><div><button className="academy-text-button" onClick={onBack}>← Volver a los cursos</button><h2>Revisión y notas · {course.title}</h2></div></div>
    <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload} />
    {resource.data && <section className="academy-panel academy-grade-panel">
      <div className="academy-grade-intro"><div><p className="academy-eyebrow">SEGUIMIENTO DOCENTE</p><h3>Una entrega, una revisión completa</h3><p className="academy-muted">Abre la entrega para leer las respuestas y registrar tu calificación.</p></div>{lesson && <div className="academy-grade-summary"><span><strong>{students.length}</strong> estudiantes</span><span><strong>{students.filter(hasEvidence).length}</strong> con entrega</span><span><strong>{students.filter(student => gradeFor(student)?.completed).length}</strong> aprobadas</span></div>}</div>
      <label className="academy-grade-select">Lección a revisar<select value={lessonId} onChange={event => { setLessonId(Number(event.target.value) || ''); setReviewId(null); setError(''); setSaved(''); }}><option value="">Selecciona una lección</option>{resource.data.lessons.map(item => <option key={item.id} value={item.id}>{item.position}. {item.title} · {item.evaluation_mode === 'informative' ? 'Informativa' : 'Calificable'}</option>)}</select></label>
      {!students.length ? <Empty title="Aún no hay estudiantes inscritos" /> : !lesson ? <Empty title="Selecciona una lección para revisar sus entregas" /> : <>
        {lesson.evaluation_mode === 'informative' && <p className="academy-muted">Esta lección es informativa. Puedes consultar las respuestas y archivos sin asignar una nota.</p>}
        <div className="academy-table-wrap grading-roster"><table><thead><tr><th>Estudiante</th><th>Entrega recibida</th><th>Resultado registrado</th><th><span className="grading-sr-only">Acciones</span></th></tr></thead><tbody>{students.map(student => {
          const response = student.form_responses?.find(item => item.lesson_id === lesson.id);
          const files = student.submissions?.filter(item => item.lesson_id === lesson.id) || [];
          const grade = gradeFor(student), result = resultOf(grade);
          return <tr key={student.id}><td><StudentName student={student} /></td><td><div className="grading-evidence-summary">{response ? <><strong>Formulario enviado</strong><time>{dateLabel(response.submitted_at)}</time></> : lesson.lesson_type === 'form' ? <span className="academy-muted">Formulario sin enviar</span> : !files.length ? <span className="academy-muted">Sin entrega de archivo</span> : null}{files.length > 0 && <span>{files.length} {files.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</span>}</div></td><td><div className="grading-result-summary">{lesson.evaluation_mode === 'informative' ? <span className="grading-status">{grade?.completed ? 'Vista' : 'Sin completar'}</span> : <><span className={'grading-status grading-status-' + result}>{labels[result]}</span>{grade?.score != null && <strong>{grade.score}<small> / 100</small></strong>}</>}{drafts[draftKey(lesson, student)] && <small className="grading-draft">Borrador sin guardar</small>}</div></td><td><button className="academy-secondary grading-open" aria-label={'Revisar entrega de ' + student.name} onClick={() => { setReviewId(student.id); setError(''); setSaved(''); }}>{response ? 'Ver respuestas' : 'Revisar entrega'} <span aria-hidden="true">↗</span></button></td></tr>;
        })}</tbody></table></div>
      </>}
    </section>}
    {lesson && reviewing && <Dialog title="Revisar entrega" className="grading-dialog" onClose={closeReview}>
      <div className="grading-review-heading"><StudentName student={reviewing} /><p>{course.title}<strong>{lesson.position}. {lesson.title}</strong></p></div>
      <div className="grading-review-layout">
        <section className="grading-answers" aria-label="Respuestas y archivos del estudiante">
          <FormAnswers lesson={lesson} response={response} marks={getDraft(reviewing).questionGrades} disabled={saving} onMark={(key, correct) => update({ questionGrades: { ...getDraft(reviewing).questionGrades, [key]: correct } })} />
          <Attachments files={reviewing.submissions?.filter(item => item.lesson_id === lesson.id) || []} />
        </section>
        <aside className="grading-evaluation">
          {lesson.evaluation_mode === 'informative' ? <><p className="academy-eyebrow">SOLO INFORMATIVA</p><h3>Sin calificación</h3><p className="academy-muted">Las respuestas se conservan para consulta. Esta lección no requiere aprobación docente.</p></> : <form noValidate className="grading-grade-form" onSubmit={event => { event.preventDefault(); void saveGrade(); }}>
            <div><p className="academy-eyebrow">EVALUACIÓN DOCENTE</p><h3>Tu calificación</h3><p className="academy-muted">Revisa la entrega antes de guardar.</p></div>
            {automatic ? <div className="grading-automatic">
              <span>Nota automática del formulario</span>
              <div className="grading-score-box"><output aria-label="Nota automática del formulario">{review.reviewed ? review.percentage : '—'}</output><span>/ 100</span></div>
              <p role="status"><strong>{review.correct} correctas</strong> · {review.reviewed} de {review.total} revisadas</p>
              <progress max={Math.max(1, review.total)} value={review.reviewed} aria-label="Respuestas revisadas" />
              <small>Todas las preguntas valen lo mismo. Se necesitan 70 puntos para aprobar.</small>
              <span className={'grading-status grading-status-' + (review.complete ? review.percentage >= 70 ? 'approved' : 'rejected' : 'pending')}>{review.complete ? review.percentage >= 70 ? 'Aprobada' : 'No aprobada' : 'Nota provisional · faltan respuestas por revisar'}</span>
              {!review.complete && gradeFor(reviewing)?.score != null && <small>Nota registrada anteriormente: {gradeFor(reviewing)?.score}/100. Se actualizará al guardar la revisión completa.</small>}
            </div> : <>
            <label>Nota de la lección<div className="grading-score-box"><input aria-label="Nota de la lección" type="number" min={0} max={100} step={1} placeholder="—" value={getDraft(reviewing).score} disabled={saving} onChange={event => update({ score: event.target.value })} /><span>/ 100</span></div><small>Se necesitan 70 puntos para aprobar.</small></label>
            <fieldset className="grading-decision" disabled={saving}><legend>Resultado</legend>{(['pending', 'approved', 'rejected'] as Result[]).map(result => <label key={result} className={getDraft(reviewing).result === result ? 'is-selected' : ''}><input type="radio" name="grade-result" value={result} checked={getDraft(reviewing).result === result} onChange={() => update({ result, ...(result === 'pending' ? { score: '' } : {}) })} /><span>{labels[result]}</span></label>)}</fieldset>
            </>}
            <label>Retroalimentación<textarea aria-label="Retroalimentación" rows={5} maxLength={2000} placeholder="Explica los aciertos y qué puede mejorar…" value={getDraft(reviewing).note} disabled={saving} onChange={event => update({ note: event.target.value })} /><small>{getDraft(reviewing).note.length} / 2000 caracteres · Visible para el estudiante</small></label>
            {error && <p className="academy-error" role="alert">{error}</p>}
            {saved && <p className="grading-save-success" role="status">✓ {saved}</p>}
            <button className="academy-primary" disabled={saving || (automatic && !review.complete)}>{saving ? 'Guardando…' : 'Guardar calificación'}</button>
          </form>}
        </aside>
      </div>
    </Dialog>}
  </>;
}

function FormAnswers({ lesson, response, marks, disabled, onMark }: { lesson: ReviewLesson; response?: Student['form_responses'][number]; marks: QuestionGrades; disabled: boolean; onMark: (key: string, correct: boolean) => void }) {
  if (!response) return <div className="grading-empty-evidence"><h3>{lesson.lesson_type === 'form' ? 'Formulario sin enviar' : 'Actividad de la lección'}</h3><p className="academy-muted">{lesson.lesson_type === 'form' ? 'Este estudiante todavía no ha enviado sus respuestas.' : 'Consulta los archivos adjuntos para revisar el trabajo del estudiante.'}</p></div>;
  const { items, error } = readFormAnswers(response.form_schema || lesson.form_schema, response.answers);
  const graded = lesson.evaluation_mode !== 'informative';
  return <>
    <div className="grading-answer-heading"><div><p className="academy-eyebrow">FORMULARIO ENVIADO</p><h3>Respuestas del estudiante</h3></div><span className="grading-status">{items.length} {items.length === 1 ? 'pregunta' : 'preguntas'}</span></div>
    <p className="grading-receipt"><time dateTime={response.submitted_at}>{dateLabel(response.submitted_at)}</time><span>Respuestas bloqueadas{graded ? ' · Marca cada respuesta para calcular la nota' : ' · Solo lectura'}</span></p>
    {error ? <p className="academy-error" role="alert">{error}</p> : !items.length ? <p className="academy-muted">Este envío no contiene respuestas.</p> : <ol className="grading-answer-list">{items.map((item, index) => <li key={item.key}>
      <div className="grading-question"><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><h4>{item.question}</h4></div>
      <p className={'grading-answer-text' + (item.empty ? ' is-empty' : '')}>{item.answer}</p>
      {graded && <fieldset className="grading-answer-mark" disabled={disabled}><legend>Evaluación de la pregunta {index + 1}</legend>
        {[true, false].map(correct => <label key={String(correct)} className={marks[item.key] === correct ? correct ? 'is-correct' : 'is-incorrect' : ''}><input type="radio" name={'question-' + index} aria-label={(correct ? 'Correcta' : 'Incorrecta') + ' · ' + item.question} checked={marks[item.key] === correct} onChange={() => onMark(item.key, correct)} /><span>{correct ? '✓ Correcta' : '✕ Incorrecta'}</span></label>)}
        {typeof marks[item.key] !== 'boolean' && <small>Sin revisar</small>}
      </fieldset>}
    </li>)}</ol>}
  </>;
}

function Attachments({ files }: { files: Student['submissions'] }) {
  if (!files.length) return null;
  return <section className="grading-attachments"><h3>Archivos adjuntos <span>({files.length})</span></h3>{files.map(file => <article key={file.id}><a href={file.file_url} target="_blank" rel="noopener noreferrer">{file.file_name || 'Abrir archivo'} <span aria-hidden="true">↗</span></a>{file.submitted_at && <time>{dateLabel(file.submitted_at)}</time>}{file.note && <p>{file.note}</p>}</article>)}</section>;
}
