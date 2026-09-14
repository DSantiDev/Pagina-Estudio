import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, type Course, type User } from './api';
import logo from './assets/logo-coovitel.png';
export type View='home'|'dashboard'|'learn'|'admin'|'profile'|'calendar';
type Academy={user:User|null; loading:boolean; view:View; course:Course|null; navigate:(view:View)=>void; openLogin:()=>void; logout:()=>Promise<void>; startCourse:(course:Course)=>Promise<void>; notify:(message:string)=>void};
const Context=createContext<Academy|null>(null);
export const useAcademy=()=>{const context=useContext(Context);if(!context)throw Error('AcademyProvider required');return context;};
export function AcademyProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[view,setView]=useState<View>('home'),[course,setCourse]=useState<Course|null>(null),[login,setLogin]=useState(false),[pending,setPending]=useState<Course|null>(null),[message,setMessage]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const notify=(text:string)=>{setMessage(text);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),6000);};
  useEffect(()=>{api<{user:User|null}>('/auth/me').then(r=>setUser(r.user)).catch(()=>notify('No se pudo comprobar la sesión.')).finally(()=>setLoading(false));const expire=()=>{setUser(null);setView('home');setLogin(true);};window.addEventListener('academy-session-expired',expire);return()=>{window.removeEventListener('academy-session-expired',expire);if(timer.current)clearTimeout(timer.current);};},[]);
  const navigate=(next:View)=>{if(!user&&['dashboard','profile','admin','learn'].includes(next)){setLogin(true);return;}setView(next);window.scrollTo({top:0});};
  const startCourse=async(selected:Course)=>{if(!user){setPending(selected);setLogin(true);return;}try{await api('/courses/'+selected.id+'/enroll','POST',{});setCourse(selected);setView('learn');window.scrollTo({top:0});}catch(e){notify((e as Error).message);}};
  return <Context.Provider value={{user,loading,view,course,navigate,openLogin:()=>setLogin(true),logout:async()=>{try{await api('/auth/logout','POST',{});setUser(null);setCourse(null);setView('home');}catch(e){notify((e as Error).message);}},startCourse,notify}}>
    {children}
    {message&&<div role="status" className="academy-toast">{message}<button aria-label="Cerrar aviso" onClick={()=>setMessage('')}>×</button></div>}
    {login&&<LoginDialog onClose={()=>{setLogin(false);setPending(null);}} onSuccess={async next=>{setUser(next);setLogin(false);if(pending){try{await api('/courses/'+pending.id+'/enroll','POST',{});setCourse(pending);setView('learn');}catch(e){notify((e as Error).message);}setPending(null);}else setView('dashboard');window.scrollTo({top:0});}}/>}
  </Context.Provider>;
}
export function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
  return <dialog ref={ref} className="academy-dialog" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="academy-dialog-head"><h2>{title}</h2><button aria-label="Cerrar ventana" onClick={onClose}>×</button></div>{children}</dialog>;
}
function LoginDialog({onClose,onSuccess}:{onClose:()=>void;onSuccess:(user:User)=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Dialog title="Bienvenido a CooviAcademy" onClose={onClose}><p className="academy-muted">Ingresa con el mismo usuario y contraseña de tu oficina virtual Coovitel.</p><form className="academy-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const data=new FormData(e.currentTarget);try{const result=await api<{user:User}>('/auth/login','POST',{username:data.get('username'),password:data.get('password')});onSuccess(result.user);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <label>Usuario de oficina virtual<input autoFocus required name="username" autoComplete="username" maxLength={254}/></label>
    <label>Contraseña<input required name="password" type="password" autoComplete="current-password" maxLength={256}/></label>
    {error&&<p className="academy-error" role="alert">{error}</p>}
    <button className="academy-primary" disabled={busy}>{busy?'Validando acceso…':'Iniciar sesión'}</button>
    <a href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer" className="academy-link">Recuperar mi acceso en Coovitel</a>
    <p className="academy-muted">¿Aún no eres asociado? <a href="https://coovitel.coop/" target="_blank" rel="noopener noreferrer">Asóciate a Coovitel</a></p>
  </form></Dialog>;
}
export function AcademyHeader(){const {user,navigate,logout,view}=useAcademy();return <header className="academy-header"><button className="academy-brand" onClick={()=>navigate('home')}><img src={logo} alt="Coovitel"/><strong>Coovi<span>Academy</span></strong></button><nav aria-label="Navegación de la academia">{([['dashboard','Mis cursos'],['calendar','En vivo'],['profile','Mi cuenta']] as const).map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>navigate(key)}>{label}</button>)}{user?.role==='admin'&&<button aria-current={view==='admin'?'page':undefined} onClick={()=>navigate('admin')}>Administración</button>}<button onClick={logout}>Salir</button></nav></header>;}
