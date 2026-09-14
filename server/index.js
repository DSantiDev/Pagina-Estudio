import { createServer } from 'node:http';
import { readFile, mkdir, open, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.js';
import { digest, token, publicUser } from './auth.js';
import { authenticateOffice } from './office-auth.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();
const clean = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const emailOf = value => clean(value, 254).toLowerCase();
const safeURL = (value, media = false) => { if (!value) return ''; if (media && /^\/api\/media\/[a-f0-9-]+$/.test(value)) return value; try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {} fail(400, 'Usa una URL HTTPS válida.'); };
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createApp({ dataDir = resolve(root, 'server/data'), appOrigin = process.env.APP_ORIGIN, secureCookies = process.env.NODE_ENV === 'production', authProvider = authenticateOffice } = {}) {
  const db = openDatabase(dataDir);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const courseData = row => ({ ...JSON.parse(row.data), id: row.id, published: !!row.published, lessons: get('SELECT count(*) n FROM lessons WHERE course_id=? AND published=1', row.id).n, students: get('SELECT count(*) n FROM enrollments WHERE course_id=?', row.id).n });
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    const sendText = (text, mime = 'text/html; charset=utf-8') => { res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); res.end(text); };
    const body = async () => {
      if (!req.headers['content-type']?.includes('application/json')) fail(415, 'Se requiere JSON.');
      let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 100000) fail(413, 'Contenido demasiado extenso.'); }
      try { const parsed = JSON.parse(text); if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw Error(); return parsed; } catch { fail(400, 'Solicitud inválida.'); }
    };
    const limited = (key, max = 12, duration = 900000) => {
      const time = Date.now();
      run('DELETE FROM rate_limits WHERE expires<?', time);
      run('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', key, time + duration);
      if (get('SELECT count FROM rate_limits WHERE key=?', key).count > max) fail(429, 'Demasiados intentos. Espera unos minutos.');
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      const method = req.method;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const origin = req.headers.origin;
        const allowed = appOrigin || `http://${req.headers.host}`;
        if (origin && origin !== allowed && !( !appOrigin && ['http://localhost:5173','http://127.0.0.1:5173'].includes(origin))) fail(403, 'Origen no permitido.');
        if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Solicitud externa no permitida.');
      }
      const rawToken = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('academy_session='))?.slice(16);
      const user = rawToken ? get('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires>?', digest(rawToken), Date.now()) : null;
      const auth = () => { if (!user) fail(401, 'Inicia sesión para continuar.'); return user; };
      const admin = () => { auth(); if (user.role !== 'admin') fail(403, 'Se requiere una cuenta administradora.'); };
      const member = () => { auth(); if (user.role !== 'admin' && user.membership !== 'approved') fail(403, 'Tu acceso de asociado debe ser aprobado por administración.'); };
      const accessCourse = id => { auth(); const row = get('SELECT * FROM courses WHERE id=?', id); if (!row || (!row.published && user.role !== 'admin')) fail(404, 'Curso no encontrado.'); const course = courseData(row); if (!course.free) member(); return course; };
      const accessLesson = id => { const lesson = get('SELECT * FROM lessons WHERE id=?', id); if (!lesson || (!lesson.published && user?.role !== 'admin')) fail(404, 'Lección no encontrada.'); accessCourse(lesson.course_id); return lesson; };
      const session = userId => { const value = token(); run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?,?)', digest(value), userId, Date.now()+7*86400000); res.setHeader('Set-Cookie', `academy_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies ? '; Secure' : ''}`); };
      if (route === '/api/health') return send(200, { status: 'ok' });
      if (route === '/api/auth/me' && method === 'GET') return send(200, { user: publicUser(user) });
      if (route === '/api/auth/login' && method === 'POST') {
        limited('login:' + req.socket.remoteAddress, 30);
        const b = await body(), username=clean(b.username,254);
        limited('identity:'+digest(username),12);
        if (!username || typeof b.password !== 'string' || !b.password || b.password.length > 256) fail(400,'Escribe tu usuario y contraseña de la oficina virtual.');
        const identity = await authProvider({ username, password:b.password });
        const id='office:'+identity.id;
        run("INSERT INTO users(id,name,email,password,membership,created_at) VALUES(?,?,?,'','approved',?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,membership='approved'",id,identity.name,identity.email,now());
        const found=get('SELECT * FROM users WHERE id=?',id);
        if (rawToken) run('DELETE FROM sessions WHERE token=?',digest(rawToken));
        session(found.id); return send(200,{user:publicUser(found)});
      }
      if (route === '/api/auth/logout' && method === 'POST') { if(rawToken) run('DELETE FROM sessions WHERE token=?',digest(rawToken)); res.setHeader('Set-Cookie',`academy_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`); return send(200,{ok:true}); }
      if (route === '/api/courses' && method === 'GET') return send(200,all('SELECT * FROM courses WHERE published=1 ORDER BY id').map(courseData));
      if (route === '/api/dashboard' && method === 'GET') {
        auth(); const courses=all('SELECT c.* FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.user_id=? AND c.published=1 ORDER BY e.created_at DESC',user.id).map(row=>({...courseData(row),completed:get('SELECT count(*) n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND p.completed=1 AND l.course_id=? AND l.published=1',user.id,row.id).n}));
        return send(200,{courses,certificates:all('SELECT cert.*,c.data FROM certificates cert JOIN courses c ON c.id=cert.course_id WHERE cert.user_id=?',user.id).map(c=>({...c,title:JSON.parse(c.data).title,data:undefined}))});
      }
      let m;
      if ((m=route.match(/^\/api\/courses\/(\d+)\/enroll$/)) && method === 'POST') { const course=accessCourse(+m[1]); run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)',user.id,course.id,now()); return send(200,{ok:true}); }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/lessons$/)) && method === 'GET') { accessCourse(+m[1]); return send(200,all('SELECT l.*,coalesce(p.completed,0) completed,coalesce(p.note,\'\') note FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.course_id=? AND l.published=1 ORDER BY l.position,l.id',user.id,+m[1])); }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/progress$/)) && method === 'PUT') {
        const lesson=accessLesson(+m[1]); const b=await body(); const old=get('SELECT * FROM progress WHERE user_id=? AND lesson_id=?',user.id,lesson.id);
        run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)',user.id,lesson.course_id,now());
        run('INSERT INTO progress VALUES(?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,note=excluded.note,updated_at=excluded.updated_at',user.id,lesson.id,typeof b.completed==='boolean'?Number(b.completed):old?.completed||0,typeof b.note==='string'?b.note.slice(0,20000):old?.note||'',now());
        return send(200,{ok:true});
      }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/comments$/))) {
        accessLesson(+m[1]);
        if(method==='GET') return send(200,all('SELECT c.id,c.body,c.created_at,u.name,c.user_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.lesson_id=? ORDER BY c.id DESC LIMIT 100',+m[1]));
        if(method==='POST') { limited('comments:'+user.id,30,60000); const b=await body(); const text=clean(b.body,3000); if(!text) fail(400,'Escribe tu comentario.'); run('INSERT INTO comments(user_id,lesson_id,body,created_at) VALUES(?,?,?,?)',user.id,+m[1],text,now()); return send(201,{ok:true}); }
      }
      if ((m=route.match(/^\/api\/comments\/(\d+)$/)) && method==='DELETE') { auth(); const comment=get('SELECT * FROM comments WHERE id=?',+m[1]); if(!comment) fail(404,'Comentario no encontrado.'); if(comment.user_id!==user.id && user.role!=='admin') fail(403,'No puedes eliminar este comentario.'); run('DELETE FROM comments WHERE id=?',+m[1]); return send(200,{ok:true}); }
      const events = () => all('SELECT * FROM events WHERE published=1 ORDER BY starts_at').map(e=>({...e,meeting_url: user && (user.role==='admin' || (user.membership==='approved' && get('SELECT 1 FROM reservations WHERE event_id=? AND user_id=?',e.id,user.id))) ? e.meeting_url : '',attendees:get('SELECT count(*) n FROM reservations WHERE event_id=?',e.id).n,reserved:!!(user && get('SELECT 1 FROM reservations WHERE event_id=? AND user_id=?',e.id,user.id))}));
      if(route==='/api/events' && method==='GET') return send(200,events());
      if ((m=route.match(/^\/api\/events\/(\d+)\/reserve$/))) {
        member(); const event=get('SELECT * FROM events WHERE id=? AND published=1',+m[1]); if(!event) fail(404,'Sesión no encontrada.');
        if(method==='DELETE') { run('DELETE FROM reservations WHERE user_id=? AND event_id=?',user.id,event.id); return send(200,{ok:true}); }
        if(method==='POST') { if(Date.parse(event.starts_at)<Date.now()) fail(400,'Esta sesión ya comenzó.'); const already=get('SELECT 1 FROM reservations WHERE user_id=? AND event_id=?',user.id,event.id); if(!already && get('SELECT count(*) n FROM reservations WHERE event_id=?',event.id).n>=event.capacity) fail(409,'No quedan cupos disponibles.'); run('INSERT OR IGNORE INTO reservations VALUES(?,?,?)',user.id,event.id,now()); return send(200,{ok:true}); }
      }
      if(route==='/api/events/calendar' && method==='GET') {
        const esc=value=>String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,c=>'\\'+c);
        const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
        const rows=events().map(e=>`BEGIN:VEVENT\r\nUID:coovi-${e.id}@cooviacademy\r\nDTSTAMP:${date(now())}\r\nDTSTART:${date(e.starts_at)}\r\nDTEND:${date(Date.parse(e.starts_at)+3600000)}\r\nSUMMARY:${esc(e.title)}\r\nDESCRIPTION:${esc(e.instructor)}\r\nEND:VEVENT`).join('\r\n');
        res.setHeader('Content-Disposition','attachment; filename="cooviacademy.ics"'); return sendText(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CooviAcademy//ES\r\n${rows}\r\nEND:VCALENDAR\r\n`,'text/calendar; charset=utf-8');
      }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/certificate$/)) && method==='POST') {
        const course=accessCourse(+m[1]); const count=get('SELECT count(*) n FROM lessons WHERE course_id=? AND published=1',course.id).n;
        const completed=get('SELECT count(*) n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=? AND l.published=1 AND p.user_id=? AND p.completed=1',course.id,user.id).n;
        if(!count || completed!==count) fail(400,'Completa todas las lecciones publicadas para obtener tu constancia.');
        run('INSERT OR IGNORE INTO certificates VALUES(?,?,?,?)',randomUUID(),user.id,course.id,now()); return send(200,get('SELECT * FROM certificates WHERE user_id=? AND course_id=?',user.id,course.id));
      }
      if ((m=route.match(/^\/api\/certificates\/([a-f0-9-]+)$/)) && method==='GET') {
        auth(); const cert=get('SELECT cert.*,c.data,u.name FROM certificates cert JOIN courses c ON c.id=cert.course_id JOIN users u ON u.id=cert.user_id WHERE cert.id=? AND cert.user_id=?',m[1],user.id); if(!cert) fail(404,'Constancia no encontrada.');
        return sendText(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Constancia de finalización</title><style>body{font-family:Arial;padding:8vw;color:#173d6e}main{border:6px solid #ebc302;padding:5vw;text-align:center}h1{font-size:36px}p{line-height:1.7}@media print{button{display:none}}</style><main><p>CooviAcademy</p><h1>Constancia de finalización</h1><p>${escapeHtml(cert.name)} ha marcado como completadas las lecciones del curso</p><h2>${escapeHtml(JSON.parse(cert.data).title)}</h2><p>${escapeHtml(cert.issued_at.slice(0,10))}</p><small>Registro ${escapeHtml(cert.id)}<br>Constancia de participación de la plataforma. No equivale a un título ni a una certificación oficial.</small></main><p>Usa la opción Imprimir de tu navegador para guardar como PDF.</p></html>`);
      }
      if(route.startsWith('/api/admin/')) {
        admin();
        if(route==='/api/admin/overview' && method==='GET') return send(200,{users:all('SELECT id,name,email,role,membership,created_at FROM users ORDER BY created_at DESC'),courses:all('SELECT * FROM courses ORDER BY id').map(courseData),events:all('SELECT * FROM events ORDER BY starts_at')});
        if((m=route.match(/^\/api\/admin\/users\/([^/]+)$/)) && method==='PATCH') { const b=await body(); if(!['none','pending','approved'].includes(b.membership)) fail(400,'Estado inválido.'); if(!get('SELECT id FROM users WHERE id=?',m[1])) fail(404,'Usuario no encontrado.'); run('UPDATE users SET membership=? WHERE id=?',b.membership,m[1]); return send(200,{ok:true}); }
        if(route==='/api/admin/courses' && method==='POST' || (m=route.match(/^\/api\/admin\/courses\/(\d+)$/)) && method==='PUT') {
          const id=m?+m[1]:null; const b=await body(); if(id && !get('SELECT id FROM courses WHERE id=?',id)) fail(404,'Curso no encontrado.');
          const data={title:clean(b.title),category:clean(b.category,60),description:clean(b.description,5000),instructor:clean(b.instructor),instructorRole:clean(b.instructorRole),duration:clean(b.duration,50),level:clean(b.level,50),image:safeURL(b.image,true),free:!!b.free,new:!!b.new,rating:0,students:0,lessons:0};
          if(!data.title || !data.category) fail(400,'Escribe título y categoría.');
          if(id) run('UPDATE courses SET data=?,published=? WHERE id=?',JSON.stringify(data),Number(!!b.published),id); else { const result=run('INSERT INTO courses(data,published) VALUES(?,?)',JSON.stringify(data),Number(!!b.published)); return send(201,{id:Number(result.lastInsertRowid)}); }
          return send(200,{id});
        }
        if((m=route.match(/^\/api\/admin\/courses\/(\d+)\/lessons$/))) {
          if(!get('SELECT id FROM courses WHERE id=?',+m[1])) fail(404,'Curso no encontrado.');
          if(method==='GET') return send(200,all('SELECT * FROM lessons WHERE course_id=? ORDER BY position,id',+m[1]));
          if(method==='POST') { const b=await body(); if(!clean(b.title)) fail(400,'Escribe el título.'); if(b.published && !clean(b.content,50000) && !b.video_url) fail(400,'Añade contenido o video antes de publicar.'); const result=run('INSERT INTO lessons(course_id,title,content,video_url,resource_url,position,published) VALUES(?,?,?,?,?,?,?)',+m[1],clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published)); return send(201,{id:Number(result.lastInsertRowid)}); }
        }
        if((m=route.match(/^\/api\/admin\/lessons\/(\d+)$/)) && method==='PUT') { const b=await body(); if(!get('SELECT id FROM lessons WHERE id=?',+m[1])) fail(404,'Lección no encontrada.'); if(!clean(b.title)) fail(400,'Escribe el título.'); if(b.published && !clean(b.content,50000) && !b.video_url) fail(400,'Añade contenido o video antes de publicar.'); run('UPDATE lessons SET title=?,content=?,video_url=?,resource_url=?,position=?,published=? WHERE id=?',clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published),+m[1]); return send(200,{ok:true}); }
        if(route==='/api/admin/events' && method==='POST' || (m=route.match(/^\/api\/admin\/events\/(\d+)$/)) && method==='PUT') {
          const b=await body(), id=m?+m[1]:null;
          if(!clean(b.title) || !Number.isFinite(Date.parse(b.starts_at)) || !Number.isInteger(b.capacity) || b.capacity<1 || b.capacity>100000) fail(400,'Verifica título, fecha y cupos.');
          if(id && !get('SELECT id FROM events WHERE id=?',id)) fail(404,'Sesión no encontrada.');
          if(id && get('SELECT count(*) n FROM reservations WHERE event_id=?',id).n>b.capacity) fail(400,'Los cupos no pueden ser menores que las reservas existentes.');
          const values=[clean(b.title),clean(b.instructor),clean(b.category),new Date(b.starts_at).toISOString(),b.capacity,safeURL(b.meeting_url),Number(!!b.published)];
          if(id) run('UPDATE events SET title=?,instructor=?,category=?,starts_at=?,capacity=?,meeting_url=?,published=? WHERE id=?',...values,id); else run('INSERT INTO events(title,instructor,category,starts_at,capacity,meeting_url,published) VALUES(?,?,?,?,?,?,?)',...values);
          return send(200,{ok:true});
        }
        if(route==='/api/admin/uploads' && method==='POST') {
          const mime=req.headers['content-type']; if(!['video/mp4','video/webm','application/pdf','image/png','image/jpeg','image/webp'].includes(mime)) fail(415,'Solo MP4, WebM, PDF, PNG, JPEG o WebP.');
          const max=100*1024*1024; if(Number(req.headers['content-length'])>max) fail(413,'El archivo supera 100 MB.');
          const id=randomUUID(); await mkdir(resolve(dataDir,'uploads'),{recursive:true}); const path=resolve(dataDir,'uploads',id); const file=await open(path,'wx'); let size=0;
          try { for await(const chunk of req){size+=chunk.length;if(size>max) fail(413,'El archivo supera 100 MB.');await file.write(chunk);} } finally {await file.close();}
          if(!size) fail(400,'Archivo vacío.'); run('INSERT INTO uploads VALUES(?,?,?,?)',id,mime,clean(req.headers['x-file-name']||'archivo',150),size); return send(201,{url:'/api/media/'+id});
        }
      }
      if((m=route.match(/^\/api\/media\/([a-f0-9-]+)$/)) && ['GET','HEAD'].includes(method)) {
        const file=get('SELECT * FROM uploads WHERE id=?',m[1]); if(!file) fail(404,'Archivo no encontrado.');
        if(user?.role!=='admin') { const linked=all('SELECT * FROM lessons WHERE published=1 AND (video_url=? OR resource_url=?)',route,route); let allowed=false; for(const lesson of linked){try{accessCourse(lesson.course_id);allowed=true;break;}catch{}} const imageCourse=file.mime.startsWith('image/') && all('SELECT data FROM courses WHERE published=1').some(c=>JSON.parse(c.data).image===route); if(!allowed && !imageCourse) fail(user?403:401,'No tienes acceso a este archivo.'); }
        const path=resolve(dataDir,'uploads',file.id); const range=req.headers.range;
        res.setHeader('Accept-Ranges','bytes'); res.setHeader('Content-Type',file.mime); res.setHeader('Cache-Control','private, no-store');
        let start=0,end=file.size-1;
        if(range){ const parts=/^bytes=(\d+)-(\d*)$/.exec(range); if(!parts) fail(416,'Rango no válido.');start=+parts[1];end=parts[2]?Math.min(+parts[2],end):end;if(start>end) fail(416,'Rango no válido.');res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${file.size}`); }
        res.setHeader('Content-Length',end-start+1); if(method==='HEAD') return res.end(); const stream=createReadStream(path,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      if(route.startsWith('/api/')) fail(404,'Ruta no encontrada.');
      if(!['GET','HEAD'].includes(method)) fail(405,'Método no permitido.');
      const dist=resolve(root,'dist'); let path=resolve(dist,'.'+decodeURIComponent(route)); if(path!==dist&&!path.startsWith(dist+sep)) fail(403,'Acceso denegado.'); if(!extname(path)) path=resolve(dist,'index.html');
      let bytes;try{bytes=await readFile(path);}catch{fail(404,'Archivo no encontrado. Ejecuta npm run build.');}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':extname(path)==='.html'?'no-cache':'public, max-age=3600'});res.end(method==='HEAD'?undefined:bytes);
    } catch(error) { if(!error.status) console.error('Error de servidor:',error.message); if(!res.headersSent) send(error.status||500,{error:error.status?error.message:'No se pudo procesar la solicitud.'});else res.end(); }
  });
  server.on('close',()=>db.close());
  return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||3001);createApp().listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`CooviAcademy: http://localhost:${port}`));
}
