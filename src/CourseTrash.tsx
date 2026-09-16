import { useState } from 'react';
import { api } from './api';
import { Dialog, useAcademy } from './AcademyContext';
import { Empty, ResourceState, useResource } from './ui';

type Kind = 'courses' | 'lessons';
export function ArchiveButton({kind,id,title,basePath,onArchived}:{kind:Kind;id:number;title:string;basePath:string;onArchived:()=>void}) {
  const [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('');
  const {notify}=useAcademy();
  const label=kind==='courses'?'curso':'lección';
  return <><button className="academy-secondary academy-danger-button" onClick={()=>{setOpen(true);setError('');}}>Eliminar {label}</button>{open&&<Dialog title={'Eliminar '+label} onClose={()=>{if(!busy)setOpen(false);}}>
    <p>Vas a enviar <strong>{title}</strong> a la papelera.</p><p className="academy-muted academy-trash-description">Dejará de estar disponible para los estudiantes durante 30 días. Las respuestas y calificaciones se conservarán; después se eliminará definitivamente.</p>
    {error&&<p className="academy-error" role="alert">{error}</p>}
    <div className="academy-actions"><button className="academy-secondary" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button className="academy-primary" disabled={busy} onClick={async()=>{setBusy(true);try{await api(basePath+'/'+kind+'/'+id,'DELETE');setOpen(false);onArchived();notify('Se ha enviado a la papelera.');}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}}>{busy?'Eliminando…':'Enviar a la papelera'}</button></div>
  </Dialog>}</>;
}
type TrashItem={id:number;title:string;course_title?:string;archived_at:string;expires_at:string};
export function TrashPanel({basePath,onRestored}:{basePath:string;onRestored:()=>void}) {
  const resource=useResource<{courses:TrashItem[];lessons:TrashItem[]}>(basePath+'/trash');
  const [busy,setBusy]=useState(''), [error,setError]=useState(''), [permanent,setPermanent]=useState<{kind:Kind;item:TrashItem}|null>(null);
  const {notify}=useAcademy();
  return <section><h2>Papelera</h2><p className="academy-muted academy-trash-description">Solo el administrador puede eliminar y restaurar contenido. Los cursos y lecciones permanecen aquí 30 días, conservando sus entregas y notas; al restaurarlos quedan sin publicar para revisión.</p>
    <ResourceState loading={resource.loading} error={resource.error} retry={resource.reload}/>{error&&<p className="academy-error" role="alert">{error}</p>}
    {resource.data&&!resource.data.courses.length&&!resource.data.lessons.length&&<Empty title="La papelera está vacía"/>}
    {(['courses','lessons'] as Kind[]).map(kind=><div key={kind}>{resource.data?.[kind].map(item=><article className="academy-list-row" key={item.id}><div><span className="academy-badge">{kind==='courses'?'Curso':'Lección'}</span><h3>{item.title}</h3>{item.course_title&&<p className="academy-muted">{item.course_title}</p>}<small>Eliminado el {new Date(item.archived_at).toLocaleDateString('es-CO')} · Se elimina definitivamente el {new Date(item.expires_at).toLocaleDateString('es-CO')}</small></div><div className="academy-actions"><button className="academy-secondary" disabled={Boolean(busy)} onClick={async()=>{setBusy(kind+item.id);setError('');try{await api(basePath+'/'+kind+'/'+item.id+'/restore','POST',{});resource.reload();onRestored();notify('Restaurado. Revisa su contenido antes de publicarlo.');}catch(cause){setError((cause as Error).message);}finally{setBusy('');}}}>{busy===kind+item.id?'Restaurando…':'Restaurar'}</button><button className="academy-text-button academy-danger-button" disabled={Boolean(busy)} onClick={()=>setPermanent({kind,item})}>Eliminar definitivamente</button></div></article>)}</div>)}
    {permanent&&<PermanentDeleteDialog kind={permanent.kind} item={permanent.item} onClose={()=>setPermanent(null)} onDone={()=>{setPermanent(null);resource.reload();notify('Eliminado definitivamente.');}}/>}
  </section>;
}

function PermanentDeleteDialog({kind,item,onClose,onDone}:{kind:Kind;item:TrashItem;onClose:()=>void;onDone:()=>void}) {
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  return <Dialog title="Eliminar definitivamente" onClose={()=>{if(!busy)onClose();}}><p>Vas a eliminar <strong>{item.title}</strong> de forma permanente.</p><p className="academy-muted academy-trash-description">Se perderán sus lecciones, entregas y calificaciones asociadas. Esta acción no se puede deshacer.</p>{error&&<p className="academy-error" role="alert">{error}</p>}<div className="academy-actions"><button className="academy-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="academy-danger-button academy-secondary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('/admin/trash/'+kind+'/'+item.id,'DELETE',{});onDone();}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}}>{busy?'Eliminando…':'Eliminar definitivamente'}</button></div></Dialog>;
}
