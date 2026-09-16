import { useEffect, useRef, useState } from 'react';
import type { Course } from './api';

type Props = {
  courses: Course[];
  isMember: boolean;
  onLogin: () => void;
  onPreview: (course: Course) => void;
  onCategory: (category: string) => void;
};

export default function HomeHero({ courses, isMember, onLogin, onPreview, onCategory }: Props) {
  // Este carrusel refleja el ranking actual del catálogo, no una selección fija.
  const ranked = [...courses].sort((a, b) => b.students - a.students || a.id - b.id).slice(0, 3);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const slideIds = ranked.map(item => item.id).join(',');
  const rotating = !paused && !hovered && !focused && !touching && !hidden;
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    const ids = slideIds ? slideIds.split(',').map(Number) : [];
    if (!rotating || ids.length < 2) return;
    const timer = window.setTimeout(() => {
      const current = Math.max(0, ids.indexOf(selectedId ?? ids[0]));
      setSelectedId(ids[(current + 1) % ids.length]);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [slideIds, selectedId, rotating]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const index = Math.max(0, ranked.findIndex(item => item.id === selectedId));
  const course = ranked[index];
  const imageFailed = course && failedImages.includes(course.image);
  const hasEnrollments = ranked.some(item => item.students > 0);
  const move = (direction: number) => {
    if (ranked.length > 1) setSelectedId(ranked[(index + direction + ranked.length) % ranked.length].id);
  };
  return <section className="home-intro" aria-labelledby="home-title">
    <div className="home-intro-grid">
      <div className="home-intro-copy">
        <p className="home-eyebrow">CATÁLOGO Y PROGRESO</p>
        <h1 id="home-title">Tu aprendizaje financiero.<br /><span>En un solo lugar.</span></h1>
        <p className="home-description">Consulta tus cursos, sigue las rutas de aprendizaje y revisa tu avance desde CooviAcademy.</p>
        <div className="home-actions">
          <a className="home-primary" href="#cursos">Ver catálogo <span aria-hidden="true">↗</span></a>
          {!isMember && <button className="home-secondary" onClick={onLogin}>Iniciar sesión <span aria-hidden="true">→</span></button>}
        </div>
        <div className="home-access-note"><span aria-hidden="true">✓</span><p>{isMember ? <>Sesión activa en CooviAcademy.<br /><strong>Tu avance se guarda automáticamente.</strong></> : <>Acceso exclusivo para asociados.<br /><strong>Ingresa con tu usuario de oficina virtual.</strong></>}</p></div>
      </div>
      {course && <article className="home-feature home-carousel" aria-label={hasEnrollments ? 'Cursos con más inscritos' : 'Explorar cursos'} aria-roledescription="carrusel"
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
        onKeyDown={event => {
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
        }}
        onTouchStart={event => { setTouching(true); touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchCancel={() => { setTouching(false); touchStart.current = null; }}
        onTouchEnd={event => {
          setTouching(false);
          if (!touchStart.current || !event.changedTouches[0]) return;
          const dx = event.changedTouches[0].clientX - touchStart.current.x;
          const dy = event.changedTouches[0].clientY - touchStart.current.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
          touchStart.current = null;
        }}>
        <div key={course.id} className="home-carousel-slide" role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${ranked.length}: ${course.title}`}>
        <div className={`home-feature-image ${imageFailed ? 'home-feature-fallback' : ''}`}>
          {!imageFailed && <img src={course.image} alt="" onError={() => setFailedImages(previous => [...previous, course.image])} />}
          <div className="home-feature-shade" />
          <div className="home-feature-top"><span>{hasEnrollments ? 'LOS MÁS INSCRITOS' : 'EXPLORA LOS CURSOS'}</span><span className="home-feature-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
          <div className="home-feature-caption"><span>{course.category}</span><p><strong>{course.students > 0 ? `${course.students.toLocaleString('es-CO')} ${course.students === 1 ? 'persona inscrita' : 'personas inscritas'}` : 'Encuentra tu próximo curso'}</strong></p></div>
        </div>
        <div className="home-feature-body">
          <div className="home-feature-meta"><span>{course.level}</span><span>{course.duration}</span></div>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
          <button onClick={() => onPreview(course)} className="home-feature-link">Conoce este curso <span aria-hidden="true">↗</span></button>
        </div>
        </div>
        {ranked.length > 1 && <div className="home-carousel-controls">
          <button type="button" aria-label={paused ? 'Activar avance automático' : 'Pausar avance automático'} title={paused ? 'Activar avance automático' : 'Pausar avance automático'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? '▶' : 'Ⅱ'}</button>
          <button type="button" aria-label="Curso anterior" onClick={() => move(-1)}>←</button>
          <div className="home-carousel-dots" aria-label="Elegir curso">
            {ranked.map((item, position) => <button key={item.id} type="button" aria-label={`Ver curso ${position + 1}: ${item.title}`} aria-current={index === position ? 'true' : undefined} onClick={() => setSelectedId(item.id)} />)}
          </div>
          <span className="home-carousel-counter" aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">{index + 1} / {ranked.length}</span>
          <button type="button" aria-label="Curso siguiente" onClick={() => move(1)}>→</button>
        </div>}
      </article>}
    </div>
    <div className="home-goals" aria-label="Explorar por objetivo">
      <div className="home-goals-label"><span>ELIGE TU PUNTO DE PARTIDA</span><h2>¿Qué quieres lograr?</h2></div>
      {[
        { category: 'Ahorro', title: 'Ahorrar con un plan', detail: 'Construye hábitos que duren', number: '01' },
        { category: 'Crédito', title: 'Usar mejor mi crédito', detail: 'Decide con más claridad', number: '02' },
        { category: 'Inversión', title: 'Empezar a invertir', detail: 'Entiende tus posibilidades', number: '03' },
      ].map(goal => <button key={goal.category} className="home-goal" onClick={() => onCategory(goal.category)}>
        <span className="home-goal-number">{goal.number}</span><span><strong>{goal.title}</strong><small>{goal.detail}</small></span><span className="home-goal-arrow" aria-hidden="true">↗</span>
      </button>)}
    </div>
  </section>;
}
