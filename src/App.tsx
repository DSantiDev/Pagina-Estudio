import { useEffect, useState } from "react";
import logoCoovitel from "./assets/logo-coovitel.png";
import { api, type User } from "./api";

/* ─── DATA ─────────────────────────────────────────────────── */

import { COURSES as INITIAL_COURSES } from "./courses";
type Course = typeof INITIAL_COURSES[number];


const CATEGORIES = ["Todos", "Ahorro", "Inversión", "Crédito", "Planificación", "Bienestar"];

const LEARNING_PATHS = [
  {
    id: 1, title: "Ruta del Ahorrador", color: "#27548F",
    accent: "#81A1DB", icon: "💰",
    description: "Desde tus primeros pesos ahorrados hasta un fondo de emergencia robusto.",
    courses: ["Fundamentos del Ahorro Inteligente", "Fondo de Emergencia: Tu Red de Seguridad"],
    duration: "7h 15min", level: "Principiante",
  },
  {
    id: 2, title: "Ruta del Inversor", color: "#1B3669",
    accent: "#EBC302", icon: "📈",
    description: "Aprende a invertir con cabeza y construir un portafolio equilibrado.",
    courses: ["Inversión Cooperativa: Tu Dinero Trabaja", "Portafolio Diversificado para Asociados"],
    duration: "11h 35min", level: "Intermedio",
  },
  {
    id: 3, title: "Ruta del Planificador", color: "#131739",
    accent: "#A90072", icon: "🗺️",
    description: "De las finanzas del presente a la seguridad del futuro, paso a paso.",
    courses: ["Plan Financiero Personal en 90 Días", "Retiro Digno: Planea desde Hoy"],
    duration: "14h 30min", level: "Avanzado",
  },
];

const LIVE_SESSIONS = [
  {
    id: 1, title: "Webinar: Crédito de Vivienda para Asociados",
    date: "18 sep 2026", time: "6:00 PM", instructor: "Mg. Claudia Ríos",
    attendees: 142, max: 200, category: "Crédito",
  },
  {
    id: 2, title: "Taller en vivo: Presupuesto Familiar Efectivo",
    date: "25 sep 2026", time: "5:30 PM", instructor: "Dra. Marcela Torres",
    attendees: 89, max: 150, category: "Ahorro",
  },
  {
    id: 3, title: "Masterclass: Portafolio en tiempos de inflación",
    date: "2 oct 2026", time: "7:00 PM", instructor: "Dr. Felipe Arango",
    attendees: 201, max: 250, category: "Inversión",
  },
];

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

const TICKER_ITEMS = [
  "✦ 17.000+ asociados activos",
  "✦ 64 años de confianza",
  "✦ Calificación A+ Value & Risk",
  "✦ 9 ciudades en Colombia",
  "✦ Cooperativa Empresarial de Ahorro y Crédito",
  "✦ Cursos avalados por expertos certificados",
];

const LEVEL_COLORS: Record<string, string> = {
  "Básico": "bg-emerald-500/20 text-emerald-300",
  "Intermedio": "bg-blue-500/20 text-blue-300",
  "Avanzado": "bg-purple-500/20 text-purple-300",
  "Principiante": "bg-emerald-500/20 text-emerald-300",
};

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

function CourseCard({ course, isMember, onPreview }: {
  course: Course; isMember: boolean; onPreview: (c: Course) => void;
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
          <button className="cta-btn w-full py-2.5 rounded-xl bg-[#EBC302] text-[#140E0C] font-bold text-sm hover:bg-yellow-300">
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

function Modal({ course, isMember, onClose, onJoin }: {
  course: Course; isMember: boolean; onClose: () => void; onJoin: () => void;
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

          {ok ? (
            <button disabled title="El ZIP no incluye videos ni lecciones" className="w-full py-3 rounded-xl bg-[#EBC302] text-[#140E0C] font-bold text-base hover:bg-yellow-300 transition-colors">
              Este curso aún no tiene lecciones publicadas
            </button>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-[#EBC302]/30 bg-[#EBC302]/8 p-4 text-center">
                <p className="text-[#EBC302] font-semibold text-sm mb-1">Exclusivo para asociados de Coovitel</p>
                <p className="text-white/45 text-xs">Asóciate y accede a todos los cursos sin costo adicional</p>
              </div>
              <button onClick={onJoin} className="w-full py-3 rounded-xl bg-[#EBC302] text-[#140E0C] font-bold text-base hover:bg-yellow-300 transition-colors">
                Asóciate y accede →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── APP ───────────────────────────────────────────────────── */

export default function App() {
  const [COURSES, setCourses] = useState(INITIAL_COURSES);
  const [user, setUser] = useState<User | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/courses', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(setCourses).catch(() => {});
    return () => controller.abort();
  }, []);
  const isMember = Boolean(user);
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const handleJoin = () => { window.open("https://coovitel.coop/", "_blank", "noopener,noreferrer"); };
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoginError("");
    const data = new FormData(event.currentTarget);
    try { const result = await api<{ user: User }>("/auth/login", "POST", { username: data.get("username"), password: data.get("password") }); setUser(result.user); setLoginOpen(false); showToast("Sesión iniciada. Todos los cursos están habilitados."); }
    catch (error) { setLoginError(error instanceof Error ? error.message : "No se pudo iniciar sesión."); }
  };

  const filtered = COURSES.filter(c => {
    const catOk = activeCategory === "Todos" || c.category === activeCategory;
    const searchOk = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.category.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  return (
    <div className="min-h-screen" style={{ background: "#0b1929" }}>

      {/* Toast */}
      {toast && (
        <div role="status" className="fixed top-6 right-6 z-50 bg-[#EBC302] text-[#140E0C] px-5 py-3 rounded-2xl shadow-2xl font-semibold text-sm flex items-center gap-3 fade-in-up">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {toast}
        </div>
      )}

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-40 nav-blur border-b border-white/8" style={{ background: "rgba(11,25,41,0.9)" }}>
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <img onError={e => { if (!e.currentTarget.src.endsWith(logoCoovitel)) e.currentTarget.src = logoCoovitel; }} src={logoCoovitel} alt="Coovitel" className="h-8 brightness-0 invert" />
            <div className="h-5 w-px bg-white/20" />
            <div className="leading-none">
              <span className="font-['Outfit'] font-extrabold text-white text-base">Coovi</span>
              <span className="font-['Outfit'] font-extrabold text-[#EBC302] text-base">Academy</span>
            </div>
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
                  <span className="text-white text-sm font-medium hidden sm:block">Cuenta Coovitel</span>
                </div>
                <button onClick={async () => { await api("/auth/logout", "POST", {}); setUser(null); }} className="text-white/35 text-xs hover:text-white/60 transition-colors">Salir</button>
              </div>
            ) : (
              <>
                <button onClick={() => setLoginOpen(true)} className="hidden md:block text-white/60 text-sm hover:text-white transition-colors">
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
            {!isMember && <button onClick={() => { setLoginOpen(true); setMobileMenuOpen(false); }} className="text-left text-[#EBC302]">Iniciar sesión</button>}
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-16 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0b1929 0%, #173D6E 55%, #1B65A6 100%)" }} />
        {/* Mesh orbs */}
        <div className="absolute top-20 right-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl" style={{ background: "radial-gradient(circle, #1B65A6, transparent)" }} />
        <div className="absolute bottom-10 left-1/3 w-64 h-64 rounded-full opacity-15 blur-3xl" style={{ background: "radial-gradient(circle, #EBC302, transparent)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/svg%3E\")" }} />

        <div className="relative max-w-7xl mx-auto px-5 pt-16 pb-28 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#EBC302]/40 bg-[#EBC302]/10 text-[#EBC302] text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
              ✦ Coovitel · Educación financiera cooperativa
            </div>
            <h1 className="font-['Outfit'] font-extrabold text-4xl md:text-5xl lg:text-[3.5rem] text-white leading-[1.08] mb-5">
              El conocimiento<br />que hace crecer<br /><span className="text-[#EBC302]">tu patrimonio</span>
            </h1>
            <p className="text-white/55 text-lg mb-8 max-w-md leading-relaxed">
              Cursos de educación financiera diseñados por expertos de la cooperativa. Exclusivos para asociados Coovitel, sin costo adicional.
            </p>

            {/* Search */}
            <div className="relative mb-8 max-w-md">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                aria-label="Buscar cursos" placeholder="Busca un curso..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="search-input w-full pl-10 pr-4 py-3 rounded-2xl border border-white/15 bg-white/8 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#EBC302]/50"
              />
            </div>

            <div className="flex flex-wrap gap-3 mb-10">
              <a href="#cursos" className="bg-[#EBC302] text-[#140E0C] font-bold px-6 py-3 rounded-full hover:bg-yellow-300 transition-colors flex items-center gap-2">
                Explorar cursos
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
              {!isMember && (
                <button onClick={handleJoin} className="border border-white/25 text-white font-semibold px-6 py-3 rounded-full hover:border-white/50 hover:bg-white/5 transition-all">
                  Quiero asociarme
                </button>
              )}
            </div>

            <div className="flex gap-8">
              {[
                { value: "17.000+", label: "Asociados activos" },
                { value: `${COURSES.length}`, label: "Cursos" },
                { value: "64+", label: "Años de confianza" },
              ].map(stat => (
                <div key={stat.label} className="border-l border-white/15 pl-5 first:border-0 first:pl-0">
                  <p className="font-['Outfit'] font-extrabold text-2xl text-[#EBC302]">{stat.value}</p>
                  <p className="text-white/45 text-xs">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Floating UI cards */}
          <div className="relative hidden md:block h-[440px]">

            {/* Main course card — top right, floats */}
            <div className="absolute top-0 right-0 w-[270px] rounded-2xl overflow-hidden shadow-2xl glass-card float-a">
              <div className="relative overflow-hidden h-36">
                <img onError={e => { if (!e.currentTarget.src.endsWith(logoCoovitel)) e.currentTarget.src = logoCoovitel; }} src={COURSES[0].image} alt="Course" className="w-full h-full object-cover brightness-75 transition-transform duration-500 hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b1929]/80 to-transparent" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#EBC302] text-[#140E0C] text-[10px] font-bold px-2.5 py-1 rounded-full shadow">
                  ★ Más popular
                </div>
                <div className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full">Gratis</div>
              </div>
              <div className="p-4">
                <p className="text-white font-bold text-sm font-['Outfit'] leading-snug mb-3">Fundamentos del Ahorro Inteligente</p>
                <div className="flex items-center justify-between mb-3">
                  <Stars rating={4.9} />
                  <span className="text-white/40 text-xs">1.240 alumnos</span>
                </div>
                <button onClick={() => setSelectedCourse(COURSES[0])} className="w-full py-2 rounded-lg bg-[#EBC302] text-[#140E0C] font-bold text-xs hover:bg-yellow-300 transition-all hover:shadow-lg hover:shadow-[#EBC302]/30 hover:-translate-y-0.5">
                  Comenzar gratis →
                </button>
              </div>
            </div>

            {/* Progress card — bottom left, floats slower */}
            <div className="absolute bottom-4 left-2 rounded-2xl p-4 w-54 shadow-2xl glass-card float-b" style={{ width: "215px" }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-[#EBC302] flex items-center justify-center text-[#140E0C] text-xs font-bold flex-shrink-0">A</div>
                <div>
                  <p className="text-white text-xs font-semibold leading-none">María López</p>
                  <p className="text-white/40 text-[10px]">Asociada activa</p>
                </div>
              </div>
              <p className="text-white/45 text-[10px] uppercase tracking-wider mb-1">Progreso actual</p>
              <p className="text-white font-bold text-xs font-['Outfit'] mb-2.5 leading-snug">Plan Financiero Personal en 90 Días</p>
              <div className="flex justify-between text-[10px] text-white/40 mb-1.5"><span>Completado</span><span className="text-[#EBC302] font-bold">65%</span></div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full progress-bar" style={{ width: "65%" }} />
              </div>
              <p className="text-white/30 text-[10px] mt-2">3 lecciones restantes</p>
            </div>

            {/* A+ badge — middle left, floats different phase */}
            <div className="absolute top-36 left-8 rounded-2xl p-4 shadow-xl glass-card float-c" style={{ width: "152px", background: "rgba(235,195,2,0.1)", borderColor: "rgba(235,195,2,0.25)" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#EBC302]/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-[#EBC302]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                </div>
                <p className="text-[#EBC302] font-extrabold text-xl font-['Outfit'] leading-none">A+</p>
              </div>
              <p className="text-white/70 text-[11px] font-semibold leading-tight">Calificación Coovitel</p>
              <p className="text-white/35 text-[10px] mt-1">Value & Risk · 2026</p>
            </div>

            {/* Live pill — top left */}
            <div className="absolute top-2 left-10 rounded-full flex items-center gap-2 shadow-xl float-b" style={{ background: "rgba(239,68,68,0.18)", backdropFilter: "blur(12px)", border: "1px solid rgba(239,68,68,0.35)", padding: "8px 14px" }}>
              <span className="relative flex w-2 h-2">
                <span className="live-ring absolute inline-flex w-full h-full rounded-full" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-red-400" />
              </span>
              <span className="text-red-200 text-xs font-bold tracking-wide">En vivo ahora</span>
              <span className="bg-red-500/30 text-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded-full">142</span>
            </div>

          </div>
        </div>

        {/* Ticker */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/8 py-3 overflow-hidden" style={{ background: "rgba(23,61,110,0.5)", backdropFilter: "blur(8px)" }}>
          <div className="flex gap-12 whitespace-nowrap animate-[ticker_30s_linear_infinite]">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="text-white/50 text-xs font-medium tracking-wide">{item}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── MEMBER ALERT ── */}
      {!isMember && (
        <div className="max-w-7xl mx-auto px-5 mt-6 mb-4">
          <div className="rounded-2xl border border-[#EBC302]/25 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ background: "linear-gradient(90deg, rgba(235,195,2,0.08) 0%, rgba(27,101,166,0.12) 100%)" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#EBC302]/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[#EBC302]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-white/70 text-sm"><span className="text-white font-semibold">Vista previa: </span>Los cursos con candado son exclusivos para asociados de Coovitel.</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setLoginOpen(true)} className="text-xs text-white/55 border border-white/15 px-3 py-1.5 rounded-full hover:border-white/30 transition-colors">Iniciar sesión</button>
              <button onClick={handleJoin} className="text-xs font-bold bg-[#EBC302] text-[#140E0C] px-3 py-1.5 rounded-full hover:bg-yellow-300 transition-colors">Asóciate →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COURSES ── */}
      <section id="cursos" className="max-w-7xl mx-auto px-5 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Catálogo</p>
            <h2 className="font-['Outfit'] font-bold text-3xl text-white">{isMember ? "Tu biblioteca de cursos" : "Explora nuestros cursos"}</h2>
          </div>
          <div id="categorias" className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className={`cat-pill px-4 py-1.5 rounded-full text-sm font-medium ${activeCategory === cat ? "active bg-[#EBC302] text-[#140E0C]" : "border border-white/12 text-white/55 hover:border-white/30 hover:text-white"}`}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-['Outfit'] font-bold text-lg">Sin resultados para "{search}"</p>
            <button onClick={() => setSearch("")} className="mt-3 text-[#EBC302] text-sm hover:underline">Limpiar búsqueda</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(course => (
              <CourseCard key={course.id} course={course} isMember={isMember} onPreview={setSelectedCourse} />
            ))}
          </div>
        )}
      </section>

      {/* ── LEARNING PATHS ── */}
      <section id="rutas" className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-8">
          <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Rutas de aprendizaje</p>
          <h2 className="font-['Outfit'] font-bold text-3xl text-white">Aprende con propósito</h2>
          <p className="text-white/45 mt-2 max-w-xl">Cursos agrupados en secuencia lógica para que avances paso a paso hacia tus metas financieras.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {LEARNING_PATHS.map(path => (
            <div key={path.id} className="path-card shimmer-card rounded-2xl p-6 border border-white/10 cursor-pointer relative overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${path.color} 0%, #0b1929 100%)` }}>
              <div className="path-orb absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-2xl" style={{ background: path.accent }} />
              <div className="relative">
                <p className="text-4xl mb-4">{path.icon}</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full mb-3 inline-block ${LEVEL_COLORS[path.level]}`}>{path.level}</span>
                <h3 className="font-['Outfit'] font-bold text-xl text-white mb-2">{path.title}</h3>
                <p className="text-white/50 text-sm mb-4 leading-relaxed">{path.description}</p>
                <div className="space-y-2 mb-5">
                  {path.courses.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-white/60 text-xs">
                      <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center text-[10px] font-bold" style={{ color: path.accent, borderColor: path.accent + "50" }}>{i+1}</div>
                      {c}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs">{path.duration}</span>
                  {isMember ? (
                    <button onClick={() => setSelectedCourse(COURSES.find(c => c.title === path.courses[0]) || COURSES[0])} className="text-xs font-bold px-3 py-1.5 rounded-full transition-colors" style={{ background: path.accent, color: "#140E0C" }}>Iniciar ruta →</button>
                  ) : (
                    <button onClick={handleJoin} className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors border-white/20 text-white/60 hover:border-white/40">
                      Para asociados
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LIVE SESSIONS ── */}
      <section id="envivo" className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Próximas sesiones</p>
            <h2 className="font-['Outfit'] font-bold text-3xl text-white flex items-center gap-3">
              En vivo
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-400 border border-red-500/30 bg-red-500/10 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            </h2>
          </div>
          <button onClick={() => showToast("Estas son las sesiones de ejemplo incluidas en el diseño.")} className="text-[#81A1DB] text-sm hover:text-white transition-colors">Ver calendario completo →</button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {LIVE_SESSIONS.map(session => {
            const pct = Math.round((session.attendees / session.max) * 100);
            return (
              <div key={session.id} className="live-card shimmer-card rounded-2xl p-5 border border-white/8" style={{ background: "linear-gradient(160deg, #1A2842 0%, #0e1929 100%)" }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    {session.category}
                  </span>
                  <span className="text-white/35 text-xs">{session.date} · {session.time}</span>
                </div>
                <h3 className="font-['Outfit'] font-bold text-white text-base leading-snug mb-2">{session.title}</h3>
                <p className="text-white/40 text-sm mb-4">{session.instructor}</p>
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-white/40 mb-1.5">
                    <span>{session.attendees} registrados</span>
                    <span>{session.max - session.attendees} cupos libres</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 80 ? "#EBC302" : "#27548F" }} />
                  </div>
                </div>
                {isMember ? (
                  <button onClick={() => showToast("La inscripción a sesiones estará disponible al conectar la plataforma real.")} className="w-full py-2 rounded-xl bg-[#27548F] text-white font-semibold text-sm hover:bg-[#1B65A6] transition-colors border border-[#81A1DB]/20">
                    Reservar lugar
                  </button>
                ) : (
                  <button onClick={handleJoin} className="w-full py-2 rounded-xl border border-white/12 text-white/50 text-sm hover:border-white/25 transition-colors flex items-center justify-center gap-2">
                    <LockIcon size={4} />
                    Solo asociados
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── INSTRUCTORS ── */}
      <section id="instructores" className="max-w-7xl mx-auto px-5 py-12">
        <div className="mb-8">
          <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Nuestro equipo</p>
          <h2 className="font-['Outfit'] font-bold text-3xl text-white">Aprende de los mejores</h2>
          <p className="text-white/45 mt-2 max-w-xl">Profesionales certificados con años de experiencia en finanzas cooperativas, inversiones y planificación patrimonial.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {INSTRUCTORS.map(inst => (
            <div key={inst.name} className="instructor-card shimmer-card rounded-2xl p-5 border border-white/8 text-center" style={{ background: "linear-gradient(160deg, #1A2842 0%, #0e1929 100%)" }}>
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

      {/* ── BENEFITS / CTA ── */}
      {!isMember && (
        <section id="beneficios" className="max-w-7xl mx-auto px-5 py-12">
          <div className="rounded-3xl overflow-hidden relative" style={{ background: "linear-gradient(135deg, #173D6E 0%, #27548F 50%, #1B3669 100%)" }}>
            <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 blur-3xl" style={{ background: "radial-gradient(circle, #EBC302, transparent)" }} />
            <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{ background: "radial-gradient(circle, #A90072, transparent)" }} />
            <div className="relative p-8 md:p-12">
              <div className="max-w-2xl mb-10">
                <p className="text-[#EBC302] text-xs font-bold uppercase tracking-widest mb-3">¿Por qué asociarte?</p>
                <h2 className="font-['Outfit'] font-bold text-3xl md:text-4xl text-white mb-4">
                  Más que cursos,<br />un camino al bienestar
                </h2>
                <p className="text-white/55 leading-relaxed">
                  Como asociado de Coovitel tienes acceso ilimitado a todos los cursos, rutas de aprendizaje, sesiones en vivo, certificaciones y recursos de CooviAcademy — todo sin costo adicional.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
                {[
                  { icon: "🎓", title: "Acceso ilimitado", desc: "Todos los cursos sin costo adicional como asociado" },
                  { icon: "📜", title: "Certificaciones", desc: "Certificados avalados por Coovitel y sus aliados" },
                  { icon: "📡", title: "Sesiones en vivo", desc: "Talleres y webinars con expertos cada semana" },
                  { icon: "📱", title: "Aprende donde sea", desc: "Accede desde móvil, tablet o computador" },
                ].map(b => (
                  <div key={b.title} className="rounded-2xl bg-white/5 border border-white/10 p-5 hover:bg-white/8 transition-colors">
                    <p className="text-3xl mb-3">{b.icon}</p>
                    <p className="text-white font-bold text-sm font-['Outfit'] mb-1">{b.title}</p>
                    <p className="text-white/45 text-xs leading-relaxed">{b.desc}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <button onClick={handleJoin} className="bg-[#EBC302] text-[#140E0C] font-bold px-8 py-3.5 rounded-full text-base hover:bg-yellow-300 transition-colors gold-glow">
                  Asóciate hoy →
                </button>
                <button onClick={() => setLoginOpen(true)} className="border border-white/25 text-white font-semibold px-6 py-3.5 rounded-full hover:border-white/50 transition-colors text-base">
                  Iniciar sesión
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── MEMBER DASHBOARD PREVIEW ── */}
      {isMember && (
        <section className="max-w-7xl mx-auto px-5 py-12">
          <div className="rounded-3xl p-8 md:p-10 border border-white/8" style={{ background: "linear-gradient(135deg, #173D6E 0%, #0b1929 100%)" }}>
            <p className="text-[#81A1DB] text-xs font-bold uppercase tracking-widest mb-2">Tu progreso</p>
            <h2 className="font-['Outfit'] font-bold text-2xl text-white mb-6">Bienvenido de vuelta, Asociado</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                { label: "Cursos en progreso", value: "2", sub: "de 9 disponibles", color: "#EBC302" },
                { label: "Horas estudiadas", value: "14h", sub: "este mes", color: "#81A1DB" },
                { label: "Certificados obtenidos", value: "1", sub: "ver mis logros", color: "#A90072" },
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
      <footer className="border-t border-white/8 py-10 mt-4" style={{ background: "#080f1a" }}>
        <div className="max-w-7xl mx-auto px-5">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img onError={e => { if (!e.currentTarget.src.endsWith(logoCoovitel)) e.currentTarget.src = logoCoovitel; }} src={logoCoovitel} alt="Coovitel" className="h-7 brightness-0 invert opacity-70" />
                <div className="h-4 w-px bg-white/15" />
                <span className="font-['Outfit'] font-extrabold text-white text-sm">Coovi<span className="text-[#EBC302]">Academy</span></span>
              </div>
              <p className="text-white/35 text-xs leading-relaxed">Plataforma de educación financiera cooperativa. Exclusiva para asociados Coovitel.</p>
            </div>
            <div>
              <p className="text-white/60 font-semibold text-sm mb-3">Categorías</p>
              <div className="flex flex-col gap-2">
                {CATEGORIES.filter(c => c !== "Todos").map(cat => (
                  <button key={cat} onClick={() => { setActiveCategory(cat); document.getElementById("cursos")?.scrollIntoView({ behavior: "smooth" }); }}
                    className="text-white/35 text-xs hover:text-white/70 text-left transition-colors">{cat}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/60 font-semibold text-sm mb-3">Coovitel</p>
              <div className="flex flex-col gap-2">
                {["Cooperativa", "Productos", "Oficina Virtual", "Contacto", "Política de privacidad"].map(l => (
                  <button key={l} onClick={() => showToast("Sección pendiente de configurar con Coovitel.")} className="footer-link text-white/35 text-xs text-left">{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-white/8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/25 text-xs">© 2026 CooviAcademy · Cooperativa Empresarial de Ahorro y Crédito Coovitel</p>
            <p className="text-white/20 text-xs">Vigilada Supersolidaria · Colombia</p>
          </div>
        </div>
      </footer>

      {loginOpen && <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => setLoginOpen(false)}>
        <form aria-label="Inicio de sesión" className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0b1929] p-6 space-y-4" onSubmit={handleLogin} onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center"><h2 className="text-2xl font-bold">Iniciar sesión</h2><button type="button" aria-label="Cerrar" onClick={() => setLoginOpen(false)}>✕</button></div>
          <p className="text-sm text-white/60">Usa las mismas credenciales de tu oficina virtual Coovitel.</p>
          <label className="block text-sm">Usuario<input required name="username" autoComplete="username" className="mt-2 block w-full rounded-lg border border-white/20 bg-white/5 p-3" /></label>
          <label className="block text-sm">Contraseña<input required name="password" type="password" autoComplete="current-password" className="mt-2 block w-full rounded-lg border border-white/20 bg-white/5 p-3" /></label>
          {loginError && <p role="alert" className="text-red-300 text-sm">{loginError}</p>}
          <button className="w-full bg-[#EBC302] text-[#140E0C] rounded-xl py-3 font-bold">Entrar y habilitar cursos</button>
          <a href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer" className="block text-center text-[#81A1DB] text-sm hover:underline">¿Necesitas recuperar tu acceso? Ir a coovitel.coop</a>
        </form>
      </div>}
      {joinOpen && <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={() => !saving && setJoinOpen(false)}>
        <section role="dialog" aria-modal="true" aria-labelledby="join-title" className="w-full max-w-md rounded-2xl border border-white/20 bg-[#0b1929] p-6" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' && !saving) setJoinOpen(false); }}>
          <div className="flex justify-between items-center mb-4"><h2 id="join-title" className="text-2xl font-bold">Quiero asociarme</h2><button aria-label="Cerrar" disabled={saving} onClick={() => setJoinOpen(false)}>✕</button></div>
          <p className="text-sm text-white/60 mb-5">La afiliación se gestiona directamente en coovitel.coop.</p>
          <form className="space-y-4" onSubmit={async e => {
            e.preventDefault(); setSaving(true); setFormError("");
            const form = new FormData(e.currentTarget);
            try {
              const response = await fetch('/api/membership-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: form.get('name'), email: form.get('email'), consent: form.get('consent') === 'on' }) });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'No se pudo guardar la solicitud.');
              setJoinOpen(false); showToast('La afiliación se gestiona en coovitel.coop.');
            } catch (error) { setFormError(error instanceof Error ? error.message : 'Revisa la conexión e inténtalo otra vez.'); }
            finally { setSaving(false); }
          }}>
            <label className="block text-sm">Nombre<input autoFocus required name="name" maxLength={100} className="mt-2 block w-full rounded-lg border border-white/20 bg-white/5 p-3" /></label>
            <label className="block text-sm">Correo electrónico<input required type="email" name="email" maxLength={254} className="mt-2 block w-full rounded-lg border border-white/20 bg-white/5 p-3" /></label>
            <label className="flex gap-2 text-xs text-white/70"><input required type="checkbox" name="consent" />Acepto continuar en coovitel.coop.</label>
            {formError && <p role="alert" className="text-red-300 text-sm">{formError}</p>}
            <button disabled={saving} className="w-full bg-[#EBC302] text-[#140E0C] rounded-xl py-3 font-bold disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar solicitud'}</button>
          </form>
        </section>
      </div>}
      {/* Modal */}
      {selectedCourse && (
        <Modal
          course={selectedCourse}
          isMember={isMember}
          onClose={() => setSelectedCourse(null)}
          onJoin={handleJoin}
        />
      )}
    </div>
  );
}

