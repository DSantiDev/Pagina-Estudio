import { useState } from 'react';
import { api } from './api';
import { useAcademy } from './AcademyContext';
import { ResourceState, useResource } from './ui';
import type { CourseResult } from '../shared/assessment.js';

type Results = CourseResult & { certificateId: string | null; nextCourse?: { id: number; title: string } | null };
export default function CourseCertificate({ courseId }: { courseId: number }) {
  const { navigate } = useAcademy();
  const result = useResource<Results>('/courses/' + courseId + '/results');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [nextCourse, setNextCourse] = useState<{id:number;title:string} | null>(null);
  const data = result.data;
  const routeNext = nextCourse || data?.nextCourse || null;
  const issueCertificate = async () => {
    setBusy(true); setError('');
    try {
      const issued = await api<{id:string;finalScore:number|null;nextCourse?:{id:number;title:string}}>('/courses/' + courseId + '/certificate', 'POST', {});
      result.setData(previous => previous ? { ...previous, certificateId: issued.id, finalScore: issued.finalScore } : previous);
      setNextCourse(issued.nextCourse || null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="academy-panel academy-course-result">
    <p className="academy-eyebrow">RESULTADO DEL CURSO</p><h2>Tu aprendizaje, un logro más.</h2>
    <ResourceState loading={result.loading} error={result.error} retry={result.reload} />
    {data && (data.allCompleted ? <>
      <p className="academy-result-lead">Aprobaste el <strong>100% del curso</strong>{data.finalScore !== null ? <> con <strong>{data.finalScore.toLocaleString('es-CO')}% de nota final</strong>.</> : '. Este curso es informativo y no tiene nota numérica.'}</p>
      <div className="academy-result-metrics"><div><span>Recorrido aprobado</span><strong>100%</strong><small>{data.completedLessons} de {data.totalLessons} lecciones</small></div><div><span>Nota final del curso</span><strong>{data.finalScore === null ? 'Sin nota' : data.finalScore.toLocaleString('es-CO') + '%'}</strong><small>{data.gradedLessons} lecciones calificables</small></div></div>
      {data.gradedLessons > 0 && <p className="academy-muted">La nota final es el promedio de las lecciones calificables. Las lecciones informativas no modifican tu nota.</p>}
      {error && <p className="academy-error" role="alert">{error}</p>}
      <div className="academy-actions">{data.certificateId ? <a className="academy-secondary" href={'/api/certificates/' + data.certificateId} target="_blank" rel="noopener noreferrer">Abrir certificado para imprimir ↗</a> : <button className="academy-primary" disabled={busy} onClick={issueCertificate}>{busy ? 'Generando…' : 'Generar certificado'}</button>}{routeNext && <button className="academy-secondary" onClick={() => navigate('learn',routeNext.id)}>Continuar ruta: {routeNext.title} →</button>}</div>
      {data.certificateId && <iframe className="academy-certificate-preview" title="Certificado del curso" src={'/api/certificates/' + data.certificateId} />}
    </> : <div className="academy-certificate-locked"><span aria-hidden="true">🔒</span><h3>Tu certificado aún está bloqueado</h3><p>Completa las lecciones informativas y recibe la aprobación del profesor en todas las calificables para habilitarlo.</p><strong>{data.completedLessons} de {data.totalLessons} lecciones aprobadas</strong></div>)}
  </section>;
}
