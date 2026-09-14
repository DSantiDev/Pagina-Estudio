export type User = { id:string; name:string; email:string; role:'student'|'admin'; membership:string };
export type Course = { id:number; title:string; category:string; description:string; instructor:string; instructorRole:string; image:string; free:boolean; new:boolean; duration:string; level:string; rating:number; students:number; lessons:number; published?:boolean; completed?:number };
export type Lesson = { id:number; course_id:number; title:string; content:string; video_url:string; resource_url:string; position:number; published:number|boolean; completed?:number; note?:string };
export type LiveEvent = { id:number; title:string; instructor:string; category:string; starts_at:string; capacity:number; meeting_url:string; published:number|boolean; attendees?:number; reserved?:boolean };
export type Comment = { id:number; body:string; name:string; user_id:string; created_at:string };
export type Certificate = { id:string; title:string; issued_at:string; course_id:number };
export async function api<T>(path:string, method='GET', data?:unknown):Promise<T> {
  let response:Response;
  try { response=await fetch('/api'+path,{method,credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}); }
  catch { throw new Error('No hay conexión con la academia. Inténtalo de nuevo.'); }
  const result=await response.json();
  if(!response.ok) { if(response.status===401 && path!=='/auth/login') window.dispatchEvent(new Event('academy-session-expired')); throw new Error(result.error || 'No se pudo completar la solicitud.'); }
  return result;
}
