import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Course, type User } from './api';
import AcademyLogo from './AcademyLogo';
export type View = 'home' | 'dashboard' | 'learn' | 'admin' | 'profile' | 'calendar';
function readRoute(): { view: View; courseId: number | null } {
  const [page, id] = window.location.hash.replace(/^#\//, '').split('/');
  return { view: ['dashboard','learn','admin','profile','calendar'].includes(page) ? page as View : 'home', courseId: page === 'learn' && /^\d+$/.test(id || '') ? Number(id) : null };
}
type Academy = {
  user: User | null; loading: boolean; authMode: string; view: View; courseId: number | null;
  navigate: (view: View, courseId?: number) => void; openLogin: () => void; logout: () => Promise<void>;
  startCourse: (course: Course) => Promise<void>; notify: (message: string) => void; updateUser: (user: User) => void;
};
const Context = createContext<Academy | null>(null);
export const useAcademy = () => { const context = useContext(Context); if (!context) throw Error('AcademyProvider required'); return context; };
export function AcademyProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null), [loading, setLoading] = useState(true), [authMode, setAuthMode] = useState('office');
  const [route, setRoute] = useState(readRoute), [login, setLogin] = useState(false), [pending, setPending] = useState<Course | null>(null), [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => { setMessage(text); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setMessage(''), 6500); };
  useEffect(() => {
    let active = true;
    api<{ user: User | null; authMode: string; accessMessage?: string }>('/auth/me').then(result => { if (active) { setUser(result.user); setAuthMode(result.authMode); if (result.accessMessage) notify(result.accessMessage); } }).catch(() => { if (active) notify('No se pudo comprobar la sesión. Revisa la conexión.'); }).finally(() => { if (active) setLoading(false); });
    const expire = () => { setUser(null); setLogin(true); };
    const hash = () => { setRoute(readRoute()); };
    window.addEventListener('academy-session-expired', expire); window.addEventListener('hashchange', hash);
    return () => { active = false; window.removeEventListener('academy-session-expired', expire); window.removeEventListener('hashchange', hash); if (timer.current) clearTimeout(timer.current); };
  }, []);
  const go = (next: View, id?: number) => { window.location.hash = next === 'home' ? '/' : '/' + next + (id ? '/' + id : ''); setRoute({ view: next, courseId: id || null }); window.scrollTo({ top: 0 }); };
  const startCourse = async (course: Course) => {
    if (!user) { setPending(course); setLogin(true); return; }
    try { await api('/courses/' + course.id + '/enroll', 'POST', {}); go('learn', course.id); } catch (error) { notify((error as Error).message); }
  };
  return <Context.Provider value={{ user, loading, authMode, view: route.view, courseId: route.courseId, updateUser: setUser, navigate: (next, id) => go(next, id), openLogin: () => setLogin(true), startCourse, notify,
    logout: async () => { try { await api('/auth/logout', 'POST', {}); setUser(null); go('home'); } catch (error) { notify((error as Error).message); } } }}>
    {children}
    {message && <div role="status" className="academy-toast">{message}<button aria-label="Cerrar aviso" onClick={() => setMessage('')}>×</button></div>}
    {login && <LoginDialog authMode={authMode} onClose={() => { setLogin(false); setPending(null); }} onSuccess={async next => {
      setUser(next); setLogin(false);
      if (pending) { try { await api('/courses/' + pending.id + '/enroll', 'POST', {}); go('learn', pending.id); } catch (error) { notify((error as Error).message); } setPending(null); }
      else if (route.view === 'home') go('dashboard');
    }} />}
  </Context.Provider>;
}
export function Dialog({ title, onClose, children, wide = false, className = '' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog?.showModal(); return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} aria-label={title} className={'academy-dialog' + (wide ? ' academy-dialog-wide' : '') + ' ' + className} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="academy-dialog-head"><h2>{title}</h2><button type="button" aria-label="Cerrar ventana" onClick={onClose}>×</button></div>{children}
  </dialog>;
}
function LoginDialog({ onClose, onSuccess, authMode }: { onClose: () => void; onSuccess: (user: User) => void; authMode: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false), [recoveryOpen, setRecoveryOpen] = useState(false);
  return <Dialog title="Bienvenido a CooviAcademy" onClose={onClose}>
    <p className="academy-muted">{authMode === 'local' ? 'Ingresa con tus credenciales de asociado para explorar la academia.' : 'Usa el mismo usuario y contraseña de tu oficina virtual Coovitel.'}</p>
    {!recoveryOpen ? <form className="academy-form" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); try { const result = await api<{ user: User }>('/auth/login', 'POST', { username: data.get('username'), password: data.get('password') }); onSuccess(result.user); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
      <label>{authMode === 'local' ? 'Usuario o correo' : 'Usuario de oficina virtual'}<input autoFocus required name="username" autoComplete="username" maxLength={254} /></label>
      <label>Contraseña<div className="academy-password-field"><input required name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" maxLength={256} /><button type="button" className="academy-password-toggle" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Ocultar' : 'Ver'}</button></div></label>
      {error && <p className="academy-error" role="alert">{error}</p>}
      <button className="academy-primary" disabled={busy}>{busy ? 'Validando acceso…' : 'Iniciar sesión'}</button>
      <button type="button" className="academy-link academy-forgot" onClick={() => { setRecoveryOpen(true); setError(''); }}>¿Olvidaste tu contraseña?</button>
      {authMode !== 'local' && <a href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer" className="academy-link">Recuperar mi acceso en Coovitel</a>}
      <p className="academy-muted">¿Aún no eres asociado? <a href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer">Asóciate a Coovitel</a></p>
    </form> : <div className="academy-recovery" role="alertdialog" aria-labelledby="recovery-title">
      <div className="academy-recovery-icon" aria-hidden="true">?</div>
      <h3 id="recovery-title">Recupera tu acceso</h3>
      <p className="academy-muted">Para restablecer tu contraseña, contacta directamente con Coovitel. Ellos podrán validar tus datos y ayudarte con el acceso a la Oficina Virtual.</p>
      <div className="academy-recovery-actions"><a className="academy-primary" href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer">Contactar a Coovitel ↗</a><button type="button" className="academy-secondary" onClick={() => setRecoveryOpen(false)}>Volver al inicio de sesión</button></div>
    </div>}
  </Dialog>;
}
export function AcademyHeader() {
  const { user, navigate, logout, view, openLogin } = useAcademy();
  return <header className="academy-header"><button className="academy-brand" aria-label="Ir al inicio" onClick={() => navigate('home')}><AcademyLogo /></button><nav aria-label="Navegación de la academia">
    {([['home','Catálogo'],['dashboard','Mis cursos'],['calendar','En vivo'],['profile','Mi cuenta']] as const).map(([key,label]) => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}</button>)}
    {user?.role === 'admin' && <button aria-current={view === 'admin' ? 'page' : undefined} onClick={() => navigate('admin')}>Administración</button>}
    {user?.role === 'teacher' && <button aria-current={view === 'admin' ? 'page' : undefined} onClick={() => navigate('admin')}>Panel docente</button>}
    {user ? <button onClick={logout}>Salir</button> : <button onClick={openLogin}>Iniciar sesión</button>}
  </nav></header>;
}

