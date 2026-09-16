import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';
import { openDatabase } from './db.js';
import { hashPassword } from './auth.js';
test('API: catálogo y rutas privadas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-test-'));
  const server = createApp({ dataDir: dir });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const catalog = await fetch(base + '/api/courses').then(r => r.json());
    assert.equal(catalog.length, 9);
    assert.equal((await fetch(base + '/api/dashboard')).status, 401);
    assert.equal((await fetch(base + '/api/auth/me')).status, 200);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true }); }
});

test('API: autenticación genérica, identidad de sesión y cierre real', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-auth-test-'));
  const db = openDatabase(dir);
  const password = 'CooviAlumno-2026!';
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run('local:student', 'Estudiante', 'alumno@cooviacademy.test', await hashPassword(password), 'student', new Date().toISOString());
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'none','',?)").run('local:suspended', 'Cuenta suspendida', 'suspendido@cooviacademy.test', await hashPassword(password), 'student', new Date().toISOString());
  const course = db.prepare('SELECT id FROM courses ORDER BY id LIMIT 1').get();
  db.prepare('INSERT INTO lessons(course_id,title,content,position,published) VALUES(?,?,?,?,1)').run(course.id, 'Lección', 'Contenido', 1);
  db.close();
  const server = createApp({ dataDir: dir, authMode: 'local' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (username, candidate) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: candidate }) });
  try {
    const wrongPassword = await login('alumno@cooviacademy.test', 'ContraseñaIncorrecta-2026!');
    const unknownUser = await login('noexiste@cooviacademy.test', password);
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownUser.status, 401);
    assert.deepEqual(await wrongPassword.json(), await unknownUser.json());

    const suspended = await login('suspendido@cooviacademy.test', password);
    assert.equal(suspended.status, 403);
    assert.deepEqual(await suspended.json(), { error: 'Tu cuenta está suspendida. Para conocer las razones, comunícate con Coovitel.' });

    const signedIn = await login('alumno@cooviacademy.test', password);
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.match(cookie || '', /^academy_session=[a-f0-9]{64}$/);
    const me = await fetch(base + '/api/auth/me', { headers: { cookie } }).then(r => r.json());
    assert.equal(me.user.email, 'alumno@cooviacademy.test');
    assert.equal(me.user.id, undefined);

    const spoofedProgress = await fetch(base + '/api/lessons/1/progress', { method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: 'local:admin', completed: true }) });
    assert.equal(spoofedProgress.status, 400);
    const spoofedComment = await fetch(base + '/api/lessons/1/comments', { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'local:admin', body: 'No debe aceptar identidad del cliente' }) });
    assert.equal(spoofedComment.status, 400);

    const loggedOut = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie } });
    assert.equal(loggedOut.status, 200);
    assert.equal((await loggedOut.json()).sessionRevoked, true);
    assert.equal(loggedOut.headers.get('clear-site-data'), '"cookies"');
    const afterLogout = await fetch(base + '/api/auth/me', { headers: { cookie } }).then(r => r.json());
    assert.equal(afterLogout.user, null);
    const audit = openDatabase(dir);
    assert.equal(audit.prepare('SELECT count(*) n FROM sessions').get().n, 0);
    audit.close();
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true }); }
});

test('API: no publica fuentes, mapas ni configuración', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-assets-test-'));
  const server = createApp({ dataDir: dir, authMode: 'local' });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/src/App.tsx', '/server/index.js', '/assets/index.js.map', '/.env', '/package.json']) assert.equal((await fetch(base + path)).status, 404, path);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive: true }); }
});

test('API: rol docente, calificaciones y límite de cursos activos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-roles-test-'));
  const db = openDatabase(dir);
  const created = async (id, name, email, role, password) => db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run(id, name, email, await hashPassword(password), role, new Date().toISOString());
  await created('local:admin', 'Admin', 'admin@roles.test', 'admin', 'CooviAdmin-2026!');
  await created('local:teacher', 'Teacher', 'teacher@roles.test', 'teacher', 'CooviTeacher-2026!');
  await created('local:student', 'Student', 'student@roles.test', 'student', 'CooviStudent-2026!');
  const courses = db.prepare('SELECT id FROM courses ORDER BY id LIMIT 4').all();
  db.prepare('UPDATE courses SET owner_id=? WHERE id=?').run('local:teacher', courses[0].id);
  for (const course of courses) db.prepare('INSERT INTO lessons(course_id,title,content,position,published) VALUES(?,?,?,?,1)').run(course.id, 'Lección', 'Contenido', 1);
  for (const course of courses.slice(0, 3)) db.prepare('INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').run('local:student', course.id, new Date().toISOString());
  db.close();
  const server = createApp({ dataDir: dir, authMode: 'local' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (username, password) => { const response = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password}) }); return { response, cookie: response.headers.get('set-cookie')?.split(';',1)[0] }; };
  try {
    const teacher = await login('teacher@roles.test', 'CooviTeacher-2026!');
    assert.equal((await fetch(base + '/api/teacher/overview', { headers:{cookie:teacher.cookie} })).status, 200);
    const roster = await fetch(base + `/api/teacher/courses/${courses[0].id}/roster`, { headers:{cookie:teacher.cookie} }); assert.equal(roster.status, 200);
    const lessonId = (await (async()=>{ const audit = openDatabase(dir); const row = audit.prepare('SELECT id FROM lessons WHERE course_id=?').get(courses[0].id); audit.close(); return row.id; })());
    const formLesson = await fetch(base + `/api/teacher/courses/${courses[0].id}/lessons`, { method:'POST', headers:{cookie:teacher.cookie,'Content-Type':'application/json'}, body:JSON.stringify({title:'Formulario de práctica',lesson_type:'form',form_schema:{fields:[{id:'objetivo',label:'¿Cuál es tu objetivo?',type:'text',required:true}]},published:true}) }); assert.equal(formLesson.status, 201); const formLessonId=(await formLesson.json()).id;
    const informativeLesson = await fetch(base + `/api/teacher/courses/${courses[0].id}/lessons`, { method:'POST', headers:{cookie:teacher.cookie,'Content-Type':'application/json'}, body:JSON.stringify({title:'Lectura informativa',evaluation_mode:'informative',content:'Material de consulta',published:true}) }); assert.equal(informativeLesson.status, 201); const informativeLessonId=(await informativeLesson.json()).id;
    const student = await login('student@roles.test', 'CooviStudent-2026!');
    const blocked = await fetch(base + `/api/courses/${courses[3].id}/enroll`, { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:'{}' }); assert.equal(blocked.status, 409);
    const grade = await fetch(base + `/api/teacher/lessons/${lessonId}/grades/${encodeURIComponent('local:student')}`, { method:'PUT', headers:{cookie:teacher.cookie,'Content-Type':'application/json'}, body:JSON.stringify({score:85,completed:true,teacher_note:'Muy buen trabajo'}) }); assert.equal(grade.status, 200);
    const invalidForm = await fetch(base + `/api/lessons/${formLessonId}/form-responses`, { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:JSON.stringify({answers:{}}) }); assert.equal(invalidForm.status, 400);
    const validForm = await fetch(base + `/api/lessons/${formLessonId}/form-responses`, { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:JSON.stringify({answers:{objetivo:'Ahorrar'}}) }); assert.equal(validForm.status, 201);
    const lockedForm = await fetch(base + `/api/lessons/${formLessonId}/form-responses`, { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:JSON.stringify({answers:{objetivo:'Cambiar después'}}) }); assert.equal(lockedForm.status, 409);
    const markedInformative = await fetch(base + `/api/lessons/${informativeLessonId}/progress`, { method:'PUT', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:JSON.stringify({completed:true}) }); assert.equal(markedInformative.status, 200);
    const pdfFixture = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const upload = await fetch(base + '/api/uploads', { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/pdf','X-File-Name':'actividad.pdf'}, body:pdfFixture }); assert.equal(upload.status, 201); const uploaded=await upload.json(); const submission=await fetch(base + `/api/lessons/${formLessonId}/submissions`, { method:'POST', headers:{cookie:student.cookie,'Content-Type':'application/json'}, body:JSON.stringify({file_url:uploaded.url,file_name:'actividad.pdf',note:'Mi actividad'}) }); assert.equal(submission.status, 201);
    const lessons = await fetch(base + `/api/courses/${courses[0].id}/lessons`, { headers:{cookie:student.cookie} }).then(r=>r.json()); const gradedLesson=lessons.find(lesson=>lesson.id===lessonId); assert.equal(gradedLesson.score, 85); assert.equal(gradedLesson.completed, 1);
    const admin = await login('admin@roles.test', 'CooviAdmin-2026!');
    const suspended = await fetch(base + '/api/admin/users/local%3Astudent', { method:'PATCH', headers:{cookie:admin.cookie,'Content-Type':'application/json'}, body:JSON.stringify({membership:'none'}) }); assert.equal(suspended.status, 200);
    assert.equal((await fetch(base + '/api/dashboard', { headers:{cookie:student.cookie} })).status, 401);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive:true }); }
});

test('API: completar un curso habilita automáticamente el siguiente de su ruta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-path-test-'));
  const db = openDatabase(dir);
  const password = await hashPassword('CooviStudent-2026!');
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run('local:student', 'Estudiante', 'student@path.test', password, 'student', new Date().toISOString());
  db.prepare("INSERT INTO lessons(course_id,title,content,position,published,evaluation_mode) VALUES(?,?,?,?,1,'informative')").run(1, 'Inicio', 'Contenido', 1);
  db.close();
  const server = createApp({ dataDir: dir, authMode: 'local' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'student@path.test',password:'CooviStudent-2026!'}) });
    const cookie = login.headers.get('set-cookie')?.split(';',1)[0];
    const lessons = await fetch(base + '/api/courses/1/lessons', { headers:{cookie} }).then(r=>r.json());
    await fetch(base + `/api/lessons/${lessons[0].id}/progress`, { method:'PUT', headers:{cookie,'Content-Type':'application/json'}, body:JSON.stringify({completed:true}) });
    const result = await fetch(base + '/api/courses/1/results', { headers:{cookie} }).then(r=>r.json());
    assert.equal(result.allCompleted, true);
    assert.deepEqual(result.nextCourse, { id: 7, title: 'Fondo de Emergencia: Tu Red de Seguridad' });
    const audit = openDatabase(dir); assert.equal(audit.prepare('SELECT count(*) n FROM enrollments WHERE user_id=? AND course_id=?').get('local:student', 7).n, 1); audit.close();
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive:true }); }
});

test('API: el administrador puede crear y ordenar rutas desde el panel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-path-admin-test-'));
  const db = openDatabase(dir);
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run('local:admin', 'Admin', 'admin@paths.test', await hashPassword('CooviAdmin-2026!'), 'admin', new Date().toISOString());
  db.close();
  const server = createApp({ dataDir: dir, authMode: 'local' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:'admin@paths.test',password:'CooviAdmin-2026!'}) });
    const cookie = login.headers.get('set-cookie')?.split(';',1)[0];
    const created = await fetch(base + '/api/admin/paths', { method:'POST', headers:{cookie,'Content-Type':'application/json'}, body:JSON.stringify({title:'Ruta de prueba',description:'Recorrido creado por administración.',level:'Intermedio',duration:'3 h 30 min',icon:'🧭',color:'#27548F',accent:'#EBC302',courseIds:[3,8],published:true}) });
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    const publicPaths = await fetch(base + '/api/paths').then(r=>r.json());
    assert.deepEqual(publicPaths.find(path => path.id===id).courseIds, [3,8]);
    const updated = await fetch(base + `/api/admin/paths/${id}`, { method:'PUT', headers:{cookie,'Content-Type':'application/json'}, body:JSON.stringify({title:'Ruta de prueba editada',description:'Recorrido actualizado.',level:'Avanzado',duration:'4 h',icon:'⭐',color:'#1B3669',accent:'#A90072',courseIds:[8,3],published:false}) });
    assert.equal(updated.status, 200);
    const adminPaths = await fetch(base + '/api/admin/paths', {headers:{cookie}}).then(r=>r.json());
    assert.deepEqual(adminPaths.find(path => path.id===id).courseIds, [8,3]);
    assert.equal((await fetch(base + '/api/paths').then(r=>r.json())).some(path => path.id===id), false);
    assert.equal((await fetch(base + `/api/admin/paths/${id}`, {method:'DELETE',headers:{cookie}})).status, 200);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive:true }); }
});

test('API: usuarios eliminados no cuentan y el admin ve finalización por curso', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-course-metrics-test-'));
  const db = openDatabase(dir);
  const password = 'CooviStudent-2026!';
  const createUser = async (id, name, email, role) => db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run(id, name, email, role === 'admin' ? await hashPassword('CooviAdmin-2026!') : await hashPassword(password), role, new Date().toISOString());
  await createUser('local:admin', 'Admin', 'admin@metrics.test', 'admin');
  await createUser('local:active', 'Active Student', 'active@metrics.test', 'student');
  await createUser('local:removed', 'Removed Student', 'removed@metrics.test', 'student');
  db.prepare("INSERT INTO lessons(course_id,title,content,position,published,evaluation_mode) VALUES(?,?,?,?,1,'informative')").run(1, 'Lección de métricas', 'Contenido', 1);
  db.prepare('INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').run('local:active', 1, new Date().toISOString());
  db.prepare('INSERT INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').run('local:removed', 1, new Date().toISOString());
  db.close();
  const server = createApp({ dataDir: dir, authMode: 'local' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (username, candidate) => { const response = await fetch(base + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username,password:candidate}) }); return { response, cookie: response.headers.get('set-cookie')?.split(';',1)[0] }; };
  try {
    const before = (await fetch(base + '/api/courses').then(r=>r.json())).find(course => course.id === 1);
    assert.equal(before.students, 2);
    assert.equal(before.completedStudents, 0);
    const active = await login('active@metrics.test', password);
    const lesson = (await fetch(base + '/api/courses/1/lessons', { headers:{cookie:active.cookie} }).then(r=>r.json()))[0];
    await fetch(base + `/api/lessons/${lesson.id}/progress`, { method:'PUT', headers:{cookie:active.cookie,'Content-Type':'application/json'}, body:JSON.stringify({completed:true}) });
    const admin = await login('admin@metrics.test', 'CooviAdmin-2026!');
    const overviewAfterGrade = (await fetch(base + '/api/admin/overview', { headers:{cookie:admin.cookie} }).then(r=>r.json())).courses.find(course => course.id === 1);
    assert.equal(overviewAfterGrade.completedStudents, 1);
    const removed = await fetch(base + '/api/admin/users/local%3Aremoved', { method:'DELETE', headers:{cookie:admin.cookie} });
    assert.equal(removed.status, 200);
    const after = (await fetch(base + '/api/courses').then(r=>r.json())).find(course => course.id === 1);
    assert.equal(after.students, 1);
    assert.equal(after.completedStudents, 1);
  } finally { await new Promise(r => server.close(r)); await rm(dir, { recursive:true }); }
});
