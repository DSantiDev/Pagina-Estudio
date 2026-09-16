import { useEffect, useState } from "react";
import logoCoovitel from "./assets/logo-coovitel.png";
import AcademyLogo from "./AcademyLogo";
import HomeHero from "./HomeHero";
import { useAcademy } from "./AcademyContext";
import Workspace, { EventsPage } from "./Workspace";
import type { Instructor, LearningPath } from './api';
import pathDefinitions from '../shared/paths.json';
import { COURSES as INITIAL_COURSES } from './courses';

/* ─── DATA ─────────────────────────────────────────────────── */

type Course = typeof INITIAL_COURSES[number] & { top?: boolean };


const CATEGORIES = ["Todos", "Ahorro", "Inversión", "Crédito", "Planificación", "Bienestar"];

const PATH_DEFINITIONS = pathDefinitions.map(path => ({ ...path, courses: path.courseIds.map(id => INITIAL_COURSES.find(course => course.id === id)).filter((course): course is Course => Boolean(course)) }));

const INSTRUCTORS = [
  {
    name: "Dra. Marcela Torres", role: "Economista & Directora académica",
    courses: 3, students: 5342,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&auto=format",
    specialty: "Ahorro · Planificación",
  },
  {
    name: "Dr. Felipe Arango", role: "CFA · Analista Senior de Inversiones",
    courses: 2, students: 1276,
    avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=120&h=120&fit=crop&auto=format",
    specialty: "Inversión · Mercados",
  },
  {
    name: "Mg. Claudia Ríos", role: "Consultora de crédito · MBA Finanzas",
    courses: 2, students: 3670,
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&h=120&fit=crop&auto=format",
    specialty: "Crédito · Banca",
  },
  {
    name: "Ps. Diana Salcedo", role: "Psicóloga financiera · Coach certificada",
    courses: 1, students: 1892,
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&h=120&fit=crop&auto=format",
    specialty: "Bienestar · Hábitos",
  },
];

const LEVEL_COLORS: Record<string, string> = {
  "Básico": "bg-emerald-500/20 text-emerald-300",
  "Intermedio": "bg-blue-500/20 text-blue-300",
  "Avanzado": "bg-purple-500/20 text-purple-300",
  "Principiante": "bg-emerald-500/20 text-emerald-300",
};
type LearningPathView = Omit<LearningPath, 'courses'> & { courses: Course[] };
const INITIAL_PATHS: LearningPathView[] = PATH_DEFINITIONS.map(path => ({
  ...path,
  courses: path.courseIds.map(id => INITIAL_COURSES.find(course => course.id === id)).filter((course): course is Course => Boolean(course)),
}));

/* ─── TINY COMPONENTS ───────────────────────────────────────── */

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-3 h-3 ${i <= Math.round(rating) ? "text-[#EBC302]" : "text-white/20"}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="text-white/50 text-xs ml-1">{rating}</span>
    </div>
  );
}

function LockIcon({ size = 5 }: { size?: number }) {
  return (
    <svg className={`w-${size} h-${size}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

/* ─── COURSE CARD ───────────────────────────────────────────── */

function CourseCard({ course, isMember, onPreview, topRank }: {
  course: Course; isMember: boolean; onPreview: (c: Course) => void; topRank?: number;
}) {
  const accessible = isMember || course.free;
  return (
    <div
      onClick={() => onPreview(course)}
      className={`course-card shimmer-card relative rounded-2xl overflow-hidden border cursor-pointer flex flex-col ${accessible ? "accessible border-white/10" : "locked border-white/5"}`}
      style={{ background: "linear-gradient(160deg, #1A2842 0%, #173D6E 100%)" }}
    >
      {/* Image */}
      <div className="relative overflow-hidden h-44">
        <img
          src={course.image} alt={course.title}
          className={`card-img w-full h-full object-cover ${!accessible ? "blur-[2px] brightness-40" : "brightness-70"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A2842] via-transparent to-transparent" />
        {!accessible && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-[#EBC302] rounded-full p-3 shadow-xl shadow-black/40">
              <LockIcon />
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[course.level]}`}>{course.level}</span>
          {course.new && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#A90072]/80 text-white">Nuevo</span>}
        </div>
        {topRank && <span className="academy-card-top" title={`Puesto ${topRank} entre los cursos con más inscritos`}>★ Top {topRank} · Más inscritos</span>}
        {course.free && (
          <div className="absolute top-3 right-3">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#EBC302] text-[#140E0C]">Gratis</span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <p className="text-[#81A1DB] text-[10px] font-bold uppercase tracking-widest mb-2">{course.category}</p>
        <h3 className="text-white font-bold text-base leading-snug mb-2 font-['Outfit']">{course.title}</h3>
        <p className="text-white/45 text-sm mb-3 line-clamp-2 flex-1">{course.description}</p>
        <p className="text-white/35 text-xs mb-3">{course.instructor}</p>

        <div className="flex items-center justify-between mb-3">
          <Stars rating={course.rating} />
          <span className="text-white/35 text-xs">{course.students.toLocaleString()} alumnos</span>
        </div>

        <div className="flex items-center gap-4 text-white/35 text-xs border-t border-white/10 pt-3 mb-4">
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {course.duration}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            {course.lessons} lecciones
          </span>
        </div>

        {accessible ? (
          <button onClick={event => { event.stopPropagation(); onPreview(course); }} className="cta-btn w-full py-2.5 rounded-xl bg-[#EBC302] text-[#140E0C] font-bold text-sm hover:bg-yellow-300">
            Comenzar →
          </button>
        ) : (
          <button className="cta-btn w-full py-2.5 rounded-xl border border-white/15 text-white/50 text-sm hover:border-[#EBC302]/40 hover:text-white/80 transition-colors flex items-center justify-center gap-2">
            <LockIcon size={4} />
            Solo para asociados
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── MODAL ─────────────────────────────────────────────────── */

function Modal({ course, isMember, onClose, onJoin, onStart }: {
  course: Course; isMember: boolean; onClose: () => void; onJoin: () => void; onStart: () => void;
}) {
  const ok = isMember || course.free;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-2xl overflow-hidden border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "linear-gradient(160deg, #1A2842 0%, #173D6E 100%)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative h-52 overflow-hidden">
          <img onError={e => { if (!e.currentTarget.src.endsWith(logoCoovitel)) e.currentTarget.src = logoCoovitel; }} src={course.image} alt={course.title} className={`w-full h-full object-cover ${!ok ? "blur-sm brightness-30" : "brightness-60"}`} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1A2842] via-[#1A2842]/40 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors z-10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          {!ok && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="bg-[#EBC302] rounded-full p-4 inline-flex mb-3 shadow-lg"><LockIcon /></div>
                <p className="text-white font-bold text-sm">Contenido exclusivo para asociados</p>
              </div>
            </div>
          )}
          <div className="absolute bottom-4 left-5 flex gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[course.level]}`}>{course.level}</span>
            {course.free && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#EBC302] text-[#140E0C]">Gratis</span>}
          </div>
        </div>

        <div className="p-6">
          <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-1">{course.category}</p>
          <h2 className="text-2xl font-bold text-white mb-2 font-['Outfit']">{course.title}</h2>
          <p className="text-white/55 mb-5 leading-relaxed">{course.description}</p>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Duración", value: course.duration },
              { label: "Lecciones", value: `${course.lessons}` },
              { label: "Valoración", value: `${course.rating} / 5` },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-white/5 border border-white/8 p-3 text-center">
                <p className="text-[#EBC302] font-bold text-lg font-['Outfit']">{s.value}</p>
                <p className="text-white/45 text-xs">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8 mb-5">
            <div className="w-11 h-11 rounded-full bg-[#27548F] flex items-center justify-center font-bold text-xl font-['Outfit'] flex-shrink-0">
              {course.instructor.split(" ").slice(-1)[0][0]}
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{course.instructor}</p>
              <p className="text-[#81A1DB] text-xs">{course.instructorRole}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button onClick={onStart} className="w-full py-3 rounded-xl bg-[#EBC302] text-[#140E0C] font-bold text-base hover:bg-yellow-300">{isMember ? 'Entrar al aula →' : 'Iniciar sesión y comenzar →'}</button>
            {!isMember && <button onClick={onJoin} className="w-full text-sm text-white/65 py-2">¿Aún no eres asociado? Asóciate a Coovitel ↗</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── APP ───────────────────────────────────────────────────── */

export default function App() {
  const { user, view, openLogin, logout, navigate, startCourse } = useAcademy();
  const [COURSES, setCourses] = useState(INITIAL_COURSES);
  const [instructors, setInstructors] = useState<Instructor[]>(INSTRUCTORS);
  const [enrollmentsLoaded, setEnrollmentsLoaded] = useState(false);
  const [courseProgress, setCourseProgress] = useState<Record<number, { completed: number; lessons: number }>>({});
  const [dashboardCertificates, setDashboardCertificates] = useState(0);
  const [learningPaths, setLearningPaths] = useState<LearningPathView[]>(INITIAL_PATHS);






  useEffect(() => {
    if (view !== "home") return;
    const controller = new AbortController();
    fetch('/api/courses', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { setCourses(data); setEnrollmentsLoaded(true); }).catch(() => {});
    return () => controller.abort();
  }, [user, view]);
  useEffect(() => {
    if (view !== 'home') return;
    const controller = new AbortController();
    fetch('/api/paths', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (Array.isArray(data) && data.length) setLearningPaths(data); }).catch(() => {});
    return () => controller.abort();
  }, [view]);
  useEffect(() => {
    if (view !== 'home' || !user) { setCourseProgress({}); setDashboardCertificates(0); return; }
    const controller = new AbortController();
    fetch('/api/dashboard', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => {
      const progress: Record<number, { completed: number; lessons: number }> = {};
      for (const course of data.courses || []) progress[course.id] = { completed: Number(course.completed || 0), lessons: Number(course.lessons || 0) };
      setCourseProgress(progress);
      setDashboardCertificates(Array.isArray(data.certificates) ? data.certificates.length : 0);
    }).catch(() => {});
    return () => controller.abort();
  }, [user, view]);
  useEffect(() => {
    if (view !== 'home') return;
    const controller = new AbortController();
    fetch('/api/instructors', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (Array.isArray(data) && data.length) setInstructors(data); }).catch(() => {});
    return () => controller.abort();
  }, [view]);
  const isMember = Boolean(user);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [search, setSearch] = useState("");

  const handleJoin = () => { window.open("https://coovitel.coop/", "_blank", "noopener,noreferrer"); };
  const filtered = COURSES.filter(c => {
    const catOk = activeCategory === "Todos" || c.category === activeCategory;
    const searchOk = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });
  const enrolledCourses = Object.values(courseProgress);
  const coursesInProgress = enrolledCourses.filter(({ completed, lessons }) => lessons === 0 || completed < lessons).length;
  const availableCourses = COURSES.length;
  const topThreeIds = [...COURSES].sort((a, b) => b.students - a.students || a.id - b.id).slice(0, 3).map(course => course.id);
  const catalogCourses = [...filtered].sort((a, b) => {
    const rankA = topThreeIds.indexOf(a.id);
    const rankB = topThreeIds.indexOf(b.id);
    if (rankA !== -1 || rankB !== -1) return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB);
    return a.id - b.id;
  });

  if (view !== "home") return <Workspace />;
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #173D6E 0%, #1B3669 55%, #131739 100%)" }}>

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-40 nav-blur border-b border-white/8" style={{ background: "rgba(11,25,41,0.9)" }}>
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <AcademyLogo />
          </div>

          <div className="hidden md:flex items-center gap-6 text-white/60 text-sm">
            {["Cursos", "Rutas", "En vivo", "Instructores"].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(" ","")}`} className="nav-link hover:text-white transition-colors">{item}</a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isMember ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
                  <div className="w-6 h-6 rounded-full bg-[#EBC302] flex items-center justify-center text-[#140E0C] text-xs font-bold">A</div>
                  <button onClick={() => navigate("dashboard")} className="text-white text-sm font-medium">Mis cursos</button>
                </div>
                <button onClick={logout} className="text-white/35 text-xs hover:text-white/60 transition-colors">Salir</button>
              </div>
            ) : (
              <>
                <button onClick={openLogin} className="hidden md:block text-white/60 text-sm hover:text-white transition-colors">
                  Iniciar sesión
                </button>
                <button onClick={handleJoin} className="bg-[#EBC302] text-[#140E0C] text-sm font-bold px-4 py-2 rounded-full hover:bg-yellow-300 transition-colors">
                  Asóciate
                </button>
              </>
            )}
            <button className="md:hidden text-white" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/8 px-5 py-4 flex flex-col gap-3 text-sm text-white/60" style={{ background: "rgba(11,25,41,0.97)" }}>
            {["Cursos", "Rutas", "En vivo", "Instructores"].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace(" ", "")}`} onClick={() => setMobileMenuOpen(false)}>{item}</a>
            ))}
            {!isMember && <button onClick={() => { openLogin(); setMobileMenuOpen(false); }} className="text-left text-[#EBC302]">Iniciar sesión</button>}
          </div>
        )}
      </nav>

      <HomeHero courses={enrollmentsLoaded ? COURSES : COURSES.map(course => ({ ...course, students: 0 }))} isMember={isMember} onLogin={openLogin}
        onPreview={setSelectedCourse} onCategory={category => {
          setActiveCategory(category); setSearch('');
          document.getElementById('cursos')?.scrollIntoView({ behavior: 'smooth' });
        }} />
      {/* ── COURSES ── */}
      <section id="cursos" className="max-w-7xl mx-auto px-5 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Catálogo</p>
            <h2 className="font-['Outfit'] font-bold text-3xl text-white">Catálogo de cursos</h2>
          </div>
          <label className="home-catalog-search">Buscar en el catálogo
            <input type="search" placeholder="Ahorro, crédito, inversión…" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
        </div>
          <div id="categorias" className="flex flex-wrap gap-2 mb-8">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`cat-pill px-4 py-1.5 rounded-full text-sm font-medium ${activeCategory === cat ? "active bg-[#EBC302] text-[#140E0C]" : "border border-white/12 text-white/55 hover:border-white/30 hover:text-white"}`}>
                {cat}
              </button>
            ))}
          </div>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-['Outfit'] font-bold text-lg">Sin resultados para "{search}"</p>
            <button onClick={() => setSearch("")} className="mt-3 text-[#EBC302] text-sm hover:underline">Limpiar búsqueda</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {catalogCourses.map(course => (
              <CourseCard key={course.id} course={course} isMember={isMember} onPreview={setSelectedCourse}
                topRank={topThreeIds.indexOf(course.id) === -1 ? undefined : topThreeIds.indexOf(course.id) + 1} />
            ))}
          </div>
        )}
      </section>

      {/* ── LEARNING PATHS ── */}
      <section id="rutas" className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-8">
          <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Rutas de aprendizaje</p>
          <h2 className="font-['Outfit'] font-bold text-3xl text-white">Aprende con propósito</h2>
          <p className="text-white/45 mt-2 max-w-xl">Elige una ruta, empieza por el curso 1 y avanza en orden. Cuando el profesor aprueba el curso actual, el siguiente se desbloquea y se inscribe automáticamente.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {learningPaths.map(path => (
            (() => {
              const rawSteps = path.courseIds.map((id, index) => ({ id, course: path.courses.find(course => course.id === id) || COURSES.find(course => course.id === id), title: path.courses[index]?.title || `Curso ${index + 1}`, progress: courseProgress[id] }));
              const steps = rawSteps.map((step, index) => ({ ...step, done: Boolean(step.progress && step.progress.lessons > 0 && step.progress.completed >= step.progress.lessons), locked: index > 0 && !rawSteps[index - 1].progress ? true : index > 0 && !(rawSteps[index - 1].progress && rawSteps[index - 1].progress.lessons > 0 && rawSteps[index - 1].progress.completed >= rawSteps[index - 1].progress.lessons) }));
              const completed = steps.filter(step => step.done).length;
              const target = steps.find(step => !step.done && !step.locked) || steps[steps.length - 1];
              return <div key={path.id} className="path-card shimmer-card rounded-2xl p-6 border border-white/10 relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${path.color} 0%, #1B3669 55%, #131739 100%)` }}>
              <div className="path-orb absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl" style={{ background: path.accent }} />
              <div className="relative">
                <p className="text-4xl mb-4">{path.icon}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full mb-3 inline-block ${LEVEL_COLORS[path.level]}`}>{path.level}</span>
                <h3 className="font-['Outfit'] font-bold text-xl text-white mb-2">{path.title}</h3>
                <p className="text-white/50 text-sm mb-4 leading-relaxed">{path.description}</p>
                <div className="path-progress-head"><span>{isMember ? `${completed} de ${steps.length} cursos aprobados` : `${steps.length} cursos en secuencia`}</span><strong>{isMember ? `${Math.round(completed / steps.length * 100)}%` : 'Paso a paso'}</strong></div>
                <div className="path-progress-track"><span style={{ width: `${isMember ? completed / steps.length * 100 : 0}%`, background: path.accent }} /></div>
                <div className="space-y-2 mb-5">
                  {steps.map((step, i) => (
                    <div key={step.id} className={`path-step ${step.done ? 'is-done' : ''} ${step.locked ? 'is-locked' : ''}`}>
                      <div className="path-step-dot" style={{ color: step.done ? '#140E0C' : path.accent, background: step.done ? path.accent : undefined, borderColor: path.accent + '70' }}>{step.done ? '✓' : step.locked ? '🔒' : i + 1}</div>
                      <div className="min-w-0"><span>{step.course?.title || step.title}</span><small>{step.done ? 'Curso aprobado' : step.locked ? 'Completa el curso anterior para desbloquearlo' : step.progress ? `${Math.round((step.progress.completed / Math.max(step.progress.lessons, 1)) * 100)}% en progreso` : 'Disponible para comenzar'}</small></div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs">{path.duration}</span>
                  {isMember && target?.course ? (
                    <button onClick={() => void startCourse(target.course!)} className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors" style={{ background: path.accent, color: "#140E0C" }}>{completed === steps.length ? 'Ver ruta →' : target.progress ? 'Continuar ruta →' : 'Iniciar ruta →'}</button>
                  ) : (
                    <button onClick={openLogin} className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors border-white/20 text-white/60 hover:border-white/40">
                      Iniciar sesión
                    </button>
                  )}
                </div>
              </div>
            </div>;
            })()
          ))}
        </div>
      </section>

      <section id="envivo" className="max-w-7xl mx-auto px-5 py-12"><EventsPage compact /></section>

      {/* ── INSTRUCTORS ── */}
      <section id="instructores" className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-8">
          <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Nuestro equipo</p>
          <h2 className="font-['Outfit'] font-bold text-3xl text-white">Instructores de CooviAcademy</h2>
          <p className="text-white/45 mt-2 max-w-xl">Consulta el equipo docente asignado a los cursos publicados y sus áreas de experiencia.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {instructors.map(inst => (
            <div key={inst.name} className="instructor-card shimmer-card rounded-2xl p-5 border border-white/8 text-center" style={{ background: "linear-gradient(160deg, #173D6E 0%, #1B3669 55%, #131739 100%)" }}>
              <div className="relative inline-block mb-4">
                <img onError={e => { if (!e.currentTarget.src.endsWith(logoCoovitel)) e.currentTarget.src = logoCoovitel; }} src={inst.avatar} alt={inst.name} className="inst-avatar w-20 h-20 rounded-2xl object-cover mx-auto ring-2 ring-white/10" />
                <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[#EBC302] flex items-center justify-center text-[#140E0C] text-xs font-bold border-2 border-[#1A2842]">
                  {inst.courses}
                </div>
              </div>
              <h3 className="font-['Outfit'] font-bold text-white text-sm leading-snug mb-1">{inst.name}</h3>
              <p className="text-white/40 text-xs mb-3">{inst.role}</p>
              <div className="inline-flex items-center gap-1 bg-[#27548F]/30 border border-[#81A1DB]/20 rounded-full px-3 py-1 mb-4">
                <span className="text-[#81A1DB] text-[10px] font-semibold">{inst.specialty}</span>
              </div>
              <div className="flex justify-center gap-4 text-xs">
                <div>
                  <p className="font-['Outfit'] font-bold text-[#EBC302] text-base">{inst.courses}</p>
                  <p className="text-white/35">Cursos</p>
                </div>
                <div className="border-l border-white/10" />
                <div>
                  <p className="font-['Outfit'] font-bold text-[#EBC302] text-base">{inst.students.toLocaleString()}</p>
                  <p className="text-white/35">Alumnos</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MEMBER DASHBOARD PREVIEW ── */}
      {isMember && (
        <section className="max-w-7xl mx-auto px-5 py-12">
          <div className="rounded-3xl p-8 md:p-10 border border-white/8" style={{ background: "linear-gradient(135deg, #173D6E 0%, #1B3669 55%, #131739 100%)" }}>
            <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Tu progreso</p>
            <h2 className="font-['Outfit'] font-bold text-2xl text-white mb-6">Bienvenido de vuelta, {user?.name.split(' ')[0] || 'asociado'}</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { label: "Cursos en progreso", value: String(coursesInProgress), sub: `de ${availableCourses} disponibles`, color: "#EBC302" },
                { label: "Cursos inscritos", value: String(enrolledCourses.length), sub: "ver en Mis cursos", color: "#81A1DB" },
                { label: "Constancias obtenidas", value: String(dashboardCertificates), sub: dashboardCertificates ? "disponibles en Mis cursos" : "completa un curso para obtenerla", color: "#A90072" },
              ].map(m => (
                <div key={m.label} className="rounded-2xl p-5 bg-white/5 border border-white/8">
                  <p className="font-['Outfit'] font-extrabold text-3xl mb-1" style={{ color: m.color }}>{m.value}</p>
                  <p className="text-white font-semibold text-sm">{m.label}</p>
                  <p className="text-white/35 text-xs mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FOOTER ── */}
      <footer
        className="academy-footer border-t border-white/15 py-10 mt-4"
        style={{ background: "linear-gradient(160deg, #173D6E 0%, #1B3669 55%, #131739 100%)" }}
      >
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <AcademyLogo />
              </div>
              <p className="text-[#C9DCFF] text-xs leading-relaxed">Plataforma de educación financiera cooperativa. Exclusiva para asociados Coovitel.</p>
            </div>
            <div>
              <p className="text-[#F7F0FF] font-semibold text-sm mb-3">Categorías</p>
              <div className="flex flex-col gap-2">
                {CATEGORIES.filter(c => c !== "Todos").map(cat => (
                  <button key={cat} onClick={() => { setActiveCategory(cat); document.getElementById("cursos")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="footer-link text-[#C9DCFF] text-xs hover:text-white text-left transition-colors">{cat}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[#F7F0FF] font-semibold text-sm mb-3">Coovitel</p>
              <div className="flex flex-col gap-2">
                {["Cooperativa", "Productos", "Oficina Virtual", "Contacto", "Política de privacidad"].map(l => (
                  <button key={l} onClick={handleJoin} className="footer-link text-[#C9DCFF] text-xs text-left">{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-[#C9DCFF]/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[#C9DCFF]/80 text-xs">© 2026 CooviAcademy · Cooperativa Empresarial de Ahorro y Crédito Coovitel</p>
            <p className="text-[#C9DCFF]/70 text-xs">Vigilada Supersolidaria · Colombia</p>
          </div>
        </div>
      </footer>

      {/* Modal */}
      {selectedCourse && (
        <Modal
          course={selectedCourse}
          isMember={isMember}
          onClose={() => setSelectedCourse(null)}
          onJoin={handleJoin}
          onStart={() => { setSelectedCourse(null); void startCourse(selectedCourse); }}
        />
      )}
    </div>
  );
}


