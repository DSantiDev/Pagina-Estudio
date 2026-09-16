import { createServer } from 'node:http';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.js';
import { MAX_ATTACHMENT_BYTES } from '../shared/attachments.js';
import { MAX_MEDIA_BYTES, MAX_AVATAR_BYTES } from '../shared/upload-limits.js';
import { validateAttachment, validateAttachmentMetadata } from './attachment-validation.js';
import { questionIds, reviewSummary, courseResult } from '../shared/assessment.js';
import { digest, token, publicUser, hashPassword, verifyPassword, validPassword } from './auth.js';
import { authenticateOffice } from './office-auth.js';
import pathDefinitions from '../shared/paths.json' with { type: 'json' };
const root = fileURLToPath(new URL('../', import.meta.url));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();
const clean = (value, max = 200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const emailOf = value => clean(value, 254).toLowerCase();
const MEDIA_PATH_RE = /^\/api\/media\/([a-f0-9-]{36})$/i;
const safeURL = (value, media = false) => { if (!value) return ''; if (media && MEDIA_PATH_RE.test(value)) return value; try { const u = new URL(value); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {} fail(400, 'Usa una URL HTTPS válida.'); };
const normalizeFormSchema = value => {
  if (!value) return '';
  try {
    const schema = typeof value === 'string' ? JSON.parse(value) : value;
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length > 30 || !schema.fields.length) fail(400, 'Agrega al menos un campo al formulario.');
    const ids = new Set();
    const fields = schema.fields.map((field, index) => {
      if (!field || typeof field !== 'object') fail(400, 'Cada campo del formulario debe ser válido.');
      const type = ['text', 'textarea', 'number', 'select', 'checkbox'].includes(field.type) ? field.type : 'text';
      const id = clean(field.id, 50) || 'campo_' + (index + 1);
      if (ids.has(id)) fail(400, 'Cada campo del formulario debe tener un identificador único.');
      ids.add(id);
      const options = Array.isArray(field.options) ? field.options.slice(0, 20).map(option => clean(option, 120)).filter(Boolean) : [];
      const min = Number.isFinite(field.min) ? field.min : undefined;
      const max = Number.isFinite(field.max) ? field.max : undefined;
      if (min !== undefined && max !== undefined && min > max) fail(400, 'El mínimo no puede superar el máximo.');
      if (type === 'select' && !options.length) fail(400, 'Cada lista debe tener al menos una opción.');
      return { id, label: clean(field.label, 200) || 'Campo ' + (index + 1), help: clean(field.help, 300), placeholder: clean(field.placeholder, 200), type, required: Boolean(field.required), options, min, max };
    });
    return JSON.stringify({ fields });
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'El formulario no es válido.');
  }
};
const evaluationMode = value => value === 'informative' ? 'informative' : 'graded';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INVALID_LOGIN = 'Usuario o contraseña incorrectos.';
const SUSPENDED_ACCESS = 'Tu cuenta está suspendida. Para conocer las razones, comunícate con Coovitel.';
const PENDING_ACCESS = 'Tu cuenta está pendiente de activar. Comunícate con Coovitel para habilitarla.';
const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PATH_DEFINITIONS = pathDefinitions;
const rejectClientIdentity = value => { if (value && ['id', 'user_id', 'userId', 'accountId'].some(key => Object.prototype.hasOwnProperty.call(value, key))) fail(400, 'La identidad se determina desde la sesión activa.'); return value; };
export function createApp({ dataDir = resolve(root, 'server/data'), appOrigin = process.env.APP_ORIGIN, secureCookies = process.env.NODE_ENV === 'production', authProvider = authenticateOffice, authMode = process.env.AUTH_MODE || 'office' } = {}) {
  if (!['local', 'office'].includes(authMode)) throw new Error('AUTH_MODE debe ser local u office.');
  const db = openDatabase(dataDir);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const writeUpload = async (request, target, maxBytes, message) => {
    const file = await open(target, 'wx');
    let size = 0;
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) fail(413, message);
        await file.write(chunk);
      }
      return size;
    } finally {
      await file.close();
    }
  };
  if (!get('SELECT 1 FROM learning_paths LIMIT 1')) {
    for (const path of PATH_DEFINITIONS) {
      run('INSERT INTO learning_paths(id,title,description,level,duration,icon,color,accent,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)', path.id, path.title, path.description, path.level, path.duration, path.icon, path.color, path.accent, now(), now());
      path.courseIds.forEach((courseId, position) => run('INSERT OR IGNORE INTO learning_path_courses(path_id,course_id,position) VALUES(?,?,?)', path.id, courseId, position));
    }
  }
  const pathForCourse = id => {
    const row = get('SELECT p.* FROM learning_paths p JOIN learning_path_courses pc ON pc.path_id=p.id WHERE pc.course_id=? AND p.published=1 ORDER BY p.id LIMIT 1', Number(id));
    if (!row) return null;
    const courseIds = all('SELECT course_id FROM learning_path_courses WHERE path_id=? ORDER BY position', row.id).map(item => item.course_id);
    return { ...row, courseIds, position: courseIds.indexOf(Number(id)) };
  };
  const courseLeaderboard = () => all("SELECT c.id,count(DISTINCT u.id) n FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id LEFT JOIN users u ON u.id=e.user_id AND u.role='student' WHERE c.published=1 AND c.archived_at IS NULL GROUP BY c.id ORDER BY n DESC,c.id");
  const courseData = (row, includeOwner = false, leaderboard = courseLeaderboard()) => {
    const lessons = get('SELECT count(*) n FROM lessons WHERE course_id=? AND published=1 AND archived_at IS NULL', row.id).n;
    // Solo cuentan estudiantes que todavía existen. Así una eliminación no deja
    // inscripciones huérfanas inflando el catálogo o el ranking.
    const students = get("SELECT count(DISTINCT e.user_id) n FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=? AND u.role='student'", row.id).n;
    const completedStudents = lessons ? get("SELECT count(*) n FROM (SELECT e.user_id FROM enrollments e JOIN users u ON u.id=e.user_id WHERE e.course_id=? AND u.role='student' GROUP BY e.user_id HAVING (SELECT count(*) FROM lessons l WHERE l.course_id=? AND l.published=1 AND l.archived_at IS NULL)=(SELECT count(*) FROM lessons l JOIN progress p ON p.lesson_id=l.id AND p.user_id=e.user_id WHERE l.course_id=? AND l.published=1 AND l.archived_at IS NULL AND p.completed=1))", row.id, row.id, row.id).n : 0;
    const result = { ...JSON.parse(row.data), id: row.id, published: !!row.published, lessons, students, completedStudents };
    const rank = leaderboard.filter(item => item.n > 0).findIndex(item => item.id === row.id);
    result.topRank = rank >= 0 && rank < 3 ? rank + 1 : null;
    result.top = result.topRank === 1;
    if (includeOwner) { result.owner_id = row.owner_id || null; result.created_by_name = row.created_by ? get('SELECT name FROM users WHERE id=?',row.created_by)?.name || '' : ''; }
    if (includeOwner && row.owner_id) {
      const owner = get('SELECT name,avatar_url FROM users WHERE id=?', row.owner_id);
      if (owner) Object.assign(result, { owner_name: owner.name, owner_avatar: owner.avatar_url || '' });
    }
    const path = pathForCourse(row.id); if (path) Object.assign(result, { path_id:path.id, path_position:path.position });
    return result;
  };
  const pathData = (row, leaderboard = courseLeaderboard()) => {
    const courses = all('SELECT c.* FROM learning_path_courses pc JOIN courses c ON c.id=pc.course_id WHERE pc.path_id=? AND c.published=1 AND c.archived_at IS NULL ORDER BY pc.position', row.id).map(course => courseData(course, false, leaderboard));
    return { id: row.id, title: row.title, description: row.description, level: row.level, duration: row.duration, icon: row.icon, color: row.color, accent: row.accent, published: !!row.published, courseIds: courses.map(course => course.id), courses };
  };
  const resultForCourse = (courseId, studentId) => courseResult(all("SELECT l.evaluation_mode,p.completed,p.score FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.course_id=? AND l.published=1", studentId, courseId));
  const nextPathCourse = (courseId, studentId) => {
    if (!get("SELECT id FROM users WHERE id=? AND role='student'", studentId)) return null;
    const path = pathForCourse(courseId), nextId = path?.courseIds[path.position + 1];
    if (!nextId) return null;
    const nextRow = get('SELECT * FROM courses WHERE id=? AND published=1 AND archived_at IS NULL', nextId);
    if (!nextRow) return null;
    const already = get('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?', studentId, nextId);
    if (!already) {
      const active = get("SELECT count(DISTINCT e.course_id) n FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND c.published=1 AND c.archived_at IS NULL AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id=c.id AND l.published=1) AND (SELECT count(*) FROM lessons l JOIN progress p ON p.lesson_id=l.id AND p.user_id=e.user_id WHERE l.course_id=c.id AND l.published=1 AND p.completed=1) < (SELECT count(*) FROM lessons l WHERE l.course_id=c.id AND l.published=1)", studentId).n;
      if (active >= 3) return null;
      run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)', studentId, nextId, now());
    }
    return { id: nextId, title: JSON.parse(nextRow.data).title };
  };
  const purgeExpiredTrash = () => {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
    const courses = all('SELECT id FROM courses WHERE archived_at IS NOT NULL AND archived_at<?', cutoff);
    const lessons = all('SELECT l.id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.archived_at IS NOT NULL AND l.archived_at<? AND c.archived_at IS NULL', cutoff);
    if (!courses.length && !lessons.length) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const course of courses) {
        run('DELETE FROM certificates WHERE course_id=?', course.id);
        run('DELETE FROM enrollments WHERE course_id=?', course.id);
        run('DELETE FROM courses WHERE id=?', course.id);
      }
      for (const lesson of lessons) run('DELETE FROM lessons WHERE id=?', lesson.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const permanentlyDeleteTrash = (table, id) => {
    const row = table === 'courses' ? get('SELECT id,archived_at FROM courses WHERE id=?', id) : get('SELECT id,archived_at FROM lessons WHERE id=?', id);
    if (!row || !row.archived_at) fail(404, table === 'courses' ? 'Curso no encontrado en la papelera.' : 'Lección no encontrada en la papelera.');
    db.exec('BEGIN IMMEDIATE');
    try {
      if (table === 'courses') { run('DELETE FROM certificates WHERE course_id=?', id); run('DELETE FROM enrollments WHERE course_id=?', id); run('DELETE FROM courses WHERE id=?', id); }
      else run('DELETE FROM lessons WHERE id=?', id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const permanentlyDeleteUser = id => {
    db.exec('BEGIN IMMEDIATE');
    try {
      // Estas tablas conservan referencias históricas sin CASCADE; se limpian
      // explícitamente para que la eliminación del usuario sea efectiva.
      run('DELETE FROM sessions WHERE user_id=?', id);
      run('DELETE FROM resets WHERE user_id=?', id);
      run('DELETE FROM comments WHERE user_id=?', id);
      run('DELETE FROM certificates WHERE user_id=?', id);
      run('DELETE FROM users WHERE id=?', id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  purgeExpiredTrash();
  const saveLessonGrade = (lesson, studentId, payload, graderId) => {
    if (lesson.archived_at) fail(404, 'Lección no encontrada.');
    if (lesson.evaluation_mode === 'informative') fail(400, 'Esta lección es informativa y no requiere calificación.');
    if (!get("SELECT u.id FROM users u JOIN enrollments e ON e.user_id=u.id WHERE u.id=? AND u.role='student' AND e.course_id=?", studentId, lesson.course_id)) fail(404, 'Estudiante no encontrado en este curso.');
    let score, completed, response, marks;
    if (lesson.lesson_type === 'form') {
      response = get('SELECT * FROM form_responses WHERE user_id=? AND lesson_id=?', studentId, lesson.id);
      if (!response) fail(400, 'El estudiante debe enviar el formulario antes de calificarlo.');
      let ids;
      try { ids = questionIds(response.form_schema || lesson.form_schema, response.answers); }
      catch { fail(400, 'No se pudieron leer las preguntas de este envío.'); }
      marks = payload.question_grades;
      if (!marks || typeof marks !== 'object' || Array.isArray(marks) || Object.keys(marks).some(key => !ids.includes(key) || typeof marks[key] !== 'boolean')) fail(400, 'Marca cada respuesta como correcta o incorrecta.');
      const review = reviewSummary(ids, marks);
      if (!review.complete) fail(400, 'Revisa todas las respuestas antes de guardar la calificación.');
      // The server calculates the score; a supplied score or approval flag cannot override it.
      score = review.score;
      completed = Number(score >= 70);
    } else {
      score = payload.score === null || payload.score === undefined || payload.score === '' ? null : Number(payload.score);
      if (score !== null && (!Number.isInteger(score) || score < 0 || score > 100)) fail(400, 'La calificación debe estar entre 0 y 100.');
      completed = typeof payload.completed === 'boolean' ? Number(payload.completed) : Number(score !== null && score >= 70);
      if (completed && (score === null || score < 70)) fail(400, 'Una lección aprobada necesita una calificación de 70 o más.');
    }
    const note = clean(payload.teacher_note, 2000), stamp = now();
    const old = get('SELECT note FROM progress WHERE user_id=? AND lesson_id=?', studentId, lesson.id);
    db.exec('BEGIN IMMEDIATE');
    try {
      if (response) run('UPDATE form_responses SET question_grades=?,validated=1 WHERE id=?', JSON.stringify(marks), response.id);
      run('INSERT INTO progress(user_id,lesson_id,completed,note,updated_at,score,graded_by,graded_at,teacher_note) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at,score=excluded.score,graded_by=excluded.graded_by,graded_at=excluded.graded_at,teacher_note=excluded.teacher_note', studentId, lesson.id, completed, old?.note || '', stamp, score, graderId, stamp, note);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { ok: true, score, completed, teacher_note: note, ...(response ? { question_grades: marks } : {}) };
  };
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
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
      const sessionUser = rawToken ? get('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires>?', digest(rawToken), Date.now()) : null;
      // La identidad siempre sale de la sesión almacenada en servidor; nunca del body, query string o headers del cliente.
      const user = sessionUser && sessionUser.id.startsWith(authMode + ':') ? sessionUser : null;
      const auth = () => { if (!user) fail(401, 'Inicia sesión para continuar.'); if (user.membership === 'none') fail(403, SUSPENDED_ACCESS); if (user.membership === 'pending') fail(403, PENDING_ACCESS); return user; };
      const admin = () => { auth(); if (user.role !== 'admin') fail(403, 'Se requiere una cuenta administradora.'); };
      const staff = () => { auth(); if (!['admin','teacher'].includes(user.role)) fail(403, 'Se requiere una cuenta docente o administradora.'); if (user.role === 'teacher' && user.membership !== 'approved') fail(403, 'Tu perfil docente aún debe ser aprobado por administración.'); return user; };
      const member = () => { auth(); if (user.role !== 'admin' && user.membership !== 'approved') fail(403, 'Tu acceso de asociado debe ser aprobado por administración.'); };
      const managedCourse = (id, includeArchived = false) => {
        const staffUser = staff(); const row = get('SELECT * FROM courses WHERE id=?', id);
        if (!row || (!includeArchived && row.archived_at)) fail(404, 'Curso no encontrado.');
        if (staffUser.role !== 'admin' && row.owner_id !== staffUser.id) fail(403, 'Solo puedes gestionar tus propios cursos.');
        return row;
      };
      const accessCourse = id => { auth(); const row = get('SELECT * FROM courses WHERE id=?', id); if (!row || (row.archived_at || (!row.published && user.role !== 'admin'))) fail(404, 'Curso no encontrado.'); const course = courseData(row); if (!course.free) member(); return course; };
      const accessLesson = id => { const lesson = get('SELECT * FROM lessons WHERE id=?', id); if (!lesson || (lesson.archived_at || (!lesson.published && user?.role !== 'admin'))) fail(404, 'Lección no encontrada.'); accessCourse(lesson.course_id); return lesson; };
      const revokeCurrentSession = () => { if (rawToken) run('DELETE FROM sessions WHERE token=?', digest(rawToken)); };
      const session = userId => { const value = token(); run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?,?)', digest(value), userId, Date.now()+7*86400000); res.setHeader('Set-Cookie', `academy_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies ? '; Secure' : ''}`); };
      if (route === '/api/health') return send(200, { status: 'ok' });
      if (route === '/api/auth/me' && method === 'GET') { if (user && user.membership !== 'approved') { revokeCurrentSession(); return send(200, { user: null, authMode, accessMessage: user.membership === 'none' ? SUSPENDED_ACCESS : PENDING_ACCESS }); } return send(200, { user: publicUser(user), authMode }); }
      if (route === '/api/auth/login' && method === 'POST') {
        limited('login:' + req.socket.remoteAddress, 30);
        const b = await body(), username=clean(b.username,254);
        limited('identity:'+digest(username),12);
        if (!username || typeof b.password !== 'string' || !b.password || b.password.length > 256) fail(401, INVALID_LOGIN);
        if (authMode === 'local') {
          const found = get("SELECT * FROM users WHERE email=? COLLATE NOCASE AND id LIKE 'local:%'", username);
          let valid = false; try { valid = await verifyPassword(b.password, found?.password || '00000000000000000000000000000000:' + '00'.repeat(64)); } catch { valid = false; }
          if (!found || !valid) fail(401, INVALID_LOGIN);
          if (found.membership === 'none') fail(403, SUSPENDED_ACCESS);
          if (found.membership === 'pending') fail(403, PENDING_ACCESS);
          revokeCurrentSession();
          session(found.id); return send(200, { user: publicUser(found) });
        }
        let identity; try { identity = await authProvider({ username, password:b.password }); } catch (error) { if (error?.status === 401 || error?.status === 403) fail(401, INVALID_LOGIN); throw error; }
        const id='office:'+identity.id;
        run("INSERT INTO users(id,name,email,password,membership,created_at) VALUES(?,?,?,'','approved',?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,membership='approved'",id,identity.name,identity.email,now());
        const found=get('SELECT * FROM users WHERE id=?',id);
        revokeCurrentSession();
        session(found.id); return send(200,{user:publicUser(found)});
      }
      if (route === '/api/auth/logout' && method === 'POST') { revokeCurrentSession(); res.setHeader('Set-Cookie',`academy_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureCookies ? '; Secure' : ''}`); res.setHeader('Clear-Site-Data','"cookies"'); return send(200,{ok:true,sessionRevoked:true}); }
      if (route === '/api/profile' && method === 'PATCH') {
        auth(); if (authMode !== 'local') fail(400, 'Actualiza tus datos en la oficina virtual Coovitel.');
        const b = rejectClientIdentity(await body()), name = clean(b.name, 100);
        if (name.length < 2) fail(400, 'Escribe tu nombre completo.');
        if (b.newPassword) {
          if (!validPassword(b.newPassword) || typeof b.currentPassword !== 'string' || b.currentPassword.length > 256 || !await verifyPassword(b.currentPassword, user.password)) fail(400, 'Verifica la contraseña actual y usa una nueva de al menos 12 caracteres.');
          const password = await hashPassword(b.newPassword);
          run('UPDATE users SET password=? WHERE id=?', password, user.id);
          run('DELETE FROM sessions WHERE user_id=?', user.id); session(user.id);
        }
        // Las fotos se actualizan únicamente mediante /api/profile/avatar para profesores
        // o mediante el panel administrativo; el perfil general nunca acepta URLs de avatar.
        run('UPDATE users SET name=? WHERE id=?', name, user.id);
        return send(200, { user: publicUser(get('SELECT * FROM users WHERE id=?', user.id)) });
      }
      if (route === '/api/courses' && method === 'GET') { const leaderboard=courseLeaderboard(); return send(200,all('SELECT * FROM courses WHERE published=1 ORDER BY id').map(row=>courseData(row,false,leaderboard))); }
      if (route === '/api/instructors' && method === 'GET') {
        const teachers = all("SELECT id,name,avatar_url FROM users WHERE role='teacher' AND membership='approved' ORDER BY name COLLATE NOCASE");
        return send(200, teachers.map(teacher => {
          const owned = all('SELECT id,data FROM courses WHERE owner_id=? AND published=1', teacher.id);
          const categories = [...new Set(owned.map(row => JSON.parse(row.data).category).filter(Boolean))];
          const students = get("SELECT count(DISTINCT u.id) n FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id WHERE c.owner_id=? AND u.role='student'", teacher.id).n;
          return { name: teacher.name, role: 'Profesor CooviAcademy', courses: owned.length, students, avatar: teacher.avatar_url || '', specialty: categories.join(' · ') || 'Formación financiera' };
        }));
      }
      if (route === '/api/paths' && method === 'GET') { const leaderboard=courseLeaderboard(); return send(200, all('SELECT * FROM learning_paths WHERE published=1 ORDER BY id').map(row=>pathData(row,leaderboard))); }
      if (route === '/api/dashboard' && method === 'GET') {
        auth(); const leaderboard=courseLeaderboard(); const courses=all('SELECT c.* FROM courses c JOIN enrollments e ON e.course_id=c.id WHERE e.user_id=? AND c.published=1 ORDER BY e.created_at DESC',user.id).map(row=>({...courseData(row,false,leaderboard),completed:get('SELECT count(*) n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND p.completed=1 AND l.course_id=? AND l.published=1',user.id,row.id).n}));
        return send(200,{courses,certificates:all('SELECT cert.*,c.data FROM certificates cert JOIN courses c ON c.id=cert.course_id WHERE cert.user_id=?',user.id).map(c=>({...c,title:JSON.parse(c.data).title,data:undefined}))});
      }
      let m;
      if ((m = route.match(/^\/api\/courses\/(\d+)$/)) && method === 'GET') {
        const row = get('SELECT * FROM courses WHERE id=? AND published=1', +m[1]);
        if (!row) fail(404, 'Curso no encontrado.'); return send(200, courseData(row));
      }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/enroll$/)) && method === 'POST') {
        const course=accessCourse(+m[1]);
        const already = get('SELECT 1 FROM enrollments WHERE user_id=? AND course_id=?', user.id, course.id);
        if (!already && user.role === 'student') {
          const path = pathForCourse(course.id);
          if (path && path.position > 0) { const previousId = path.courseIds[path.position - 1]; const previousLessons = get('SELECT count(*) n FROM lessons WHERE course_id=? AND published=1', previousId).n; const previousPassed = get("SELECT count(*) n FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=? AND l.course_id=? AND l.published=1 AND p.completed=1 AND (l.evaluation_mode='informative' OR p.score>=70)", user.id, previousId).n; if (!previousLessons || previousPassed !== previousLessons) fail(409, 'Sigue el orden de la ruta: primero completa y aprueba el curso anterior.'); }
          const active = get("SELECT count(DISTINCT e.course_id) n FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND c.published=1 AND EXISTS (SELECT 1 FROM lessons l WHERE l.course_id=c.id AND l.published=1) AND (SELECT count(*) FROM lessons l JOIN progress p ON p.lesson_id=l.id AND p.user_id=e.user_id WHERE l.course_id=c.id AND l.published=1 AND p.completed=1) < (SELECT count(*) FROM lessons l WHERE l.course_id=c.id AND l.published=1)", user.id).n;
          if (active >= 3) fail(409, 'Ya tienes 3 cursos activos sin terminar. Completa uno para inscribirte en otro.');
        }
        run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)',user.id,course.id,now()); return send(200,{ok:true});
      }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/lessons$/)) && method === 'GET') { accessCourse(+m[1]); return send(200,all('SELECT l.*,coalesce(p.completed,0) completed,coalesce(p.note,\'\') note,p.score,p.teacher_note FROM lessons l LEFT JOIN progress p ON p.lesson_id=l.id AND p.user_id=? WHERE l.course_id=? AND l.published=1 ORDER BY l.position,l.id',user.id,+m[1])); }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/progress$/)) && method === 'PUT') {
        const lesson=accessLesson(+m[1]); const b=rejectClientIdentity(await body()); const old=get('SELECT * FROM progress WHERE user_id=? AND lesson_id=?',user.id,lesson.id); const completed=lesson.evaluation_mode==='informative' && typeof b.completed==='boolean' ? Number(b.completed) : old?.completed||0;
        run('INSERT OR IGNORE INTO enrollments VALUES(?,?,?)',user.id,lesson.course_id,now());
        run('INSERT INTO progress(user_id,lesson_id,completed,note,updated_at,score,graded_by,graded_at,teacher_note) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,note=excluded.note,updated_at=excluded.updated_at,score=progress.score,graded_by=progress.graded_by,graded_at=progress.graded_at,teacher_note=progress.teacher_note',user.id,lesson.id,completed,typeof b.note==='string'?b.note.slice(0,20000):old?.note||'',now(),old?.score ?? null,old?.graded_by ?? null,old?.graded_at ?? null,old?.teacher_note || '');
        return send(200,{ok:true});
      }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/submissions$/))) {
        const lesson=accessLesson(+m[1]); member();
        if(method==='GET') return send(200,all('SELECT id,file_url,file_name,note,status,feedback,submitted_at,reviewed_at FROM submissions WHERE lesson_id=? AND user_id=? ORDER BY submitted_at DESC',lesson.id,user.id));
        if(method==='POST') {
          const b=rejectClientIdentity(await body()), file_url=safeURL(b.file_url,true);
          const uploadId=file_url.match(MEDIA_PATH_RE)?.[1];
          const uploaded=uploadId&&get("SELECT * FROM uploads WHERE id=? AND owner_id=? AND purpose='attachment'",uploadId,user.id);
          if(!uploaded || uploaded.size>MAX_ATTACHMENT_BYTES)fail(400,'Sube primero un archivo propio en PDF, Excel (.xlsx) o Word (.docx), de hasta 10 MB.');
          const id=randomUUID();run('INSERT INTO submissions(id,user_id,lesson_id,file_url,file_name,note,submitted_at) VALUES(?,?,?,?,?,?,?)',id,user.id,lesson.id,file_url,uploaded.name,clean(b.note,3000),now());
          return send(201,{id});
        }
      }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/form-responses$/))) {
        const lesson=accessLesson(+m[1]); member(); if(lesson.lesson_type!=='form') fail(400,'Esta lección no es un formulario.');
        if(method==='GET') return send(200,get('SELECT id,answers,validated,submitted_at,form_schema,question_grades FROM form_responses WHERE lesson_id=? AND user_id=?',lesson.id,user.id)||null);
         if(method==='POST'){const b=rejectClientIdentity(await body());if(get('SELECT id FROM form_responses WHERE lesson_id=? AND user_id=?',lesson.id,user.id))fail(409,'Este formulario ya fue enviado y no se puede modificar.');let schema;try{schema=JSON.parse(lesson.form_schema||'{"fields":[]}');}catch{fail(400,'Formulario no disponible.');}if(!b.answers||typeof b.answers!=='object')fail(400,'Responde el formulario.');for(const field of schema.fields||[]){const answer=b.answers[field.id];if(field.required&&(answer===undefined||answer===null||String(answer).trim()===''))fail(400,`Completa el campo: ${field.label}`);if(field.type==='number'&&answer!==undefined&&answer!==''&&!Number.isFinite(Number(answer)))fail(400,`El campo ${field.label} debe ser numérico.`);if(field.type==='number'&&answer!==undefined&&answer!==''&&field.min!==undefined&&Number(answer)<field.min)fail(400,`El campo ${field.label} debe ser mayor o igual a ${field.min}.`);if(field.type==='number'&&answer!==undefined&&answer!==''&&field.max!==undefined&&Number(answer)>field.max)fail(400,`El campo ${field.label} debe ser menor o igual a ${field.max}.`);if(field.type==='select'&&field.options?.length&&answer!==undefined&&!field.options.includes(answer))fail(400,`Selecciona una opción válida en ${field.label}.`);}const result=run('INSERT INTO form_responses(id,user_id,lesson_id,answers,validated,submitted_at,form_schema) VALUES(?,?,?,?,0,?,?)',randomUUID(),user.id,lesson.id,JSON.stringify(b.answers),now(),lesson.form_schema);if(lesson.evaluation_mode==='informative')run('INSERT INTO progress(user_id,lesson_id,completed,note,updated_at,score,graded_by,graded_at,teacher_note) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=1,updated_at=excluded.updated_at',user.id,lesson.id,1,'',now(),null,null,null,'');return send(201,{id:result.lastInsertRowid,locked:true});}
      }
      if ((m=route.match(/^\/api\/lessons\/(\d+)\/comments$/))) {
        accessLesson(+m[1]);
        if(method==='GET') return send(200,all('SELECT c.id,c.body,c.created_at,u.name,c.user_id FROM comments c JOIN users u ON u.id=c.user_id WHERE c.lesson_id=? ORDER BY c.id DESC LIMIT 100',+m[1]).map(comment=>({id:comment.id,body:comment.body,created_at:comment.created_at,name:comment.name,owner:comment.user_id===user.id})));
        if(method==='POST') { limited('comments:'+user.id,30,60000); const b=rejectClientIdentity(await body()); const text=clean(b.body,3000); if(!text) fail(400,'Escribe tu comentario.'); run('INSERT INTO comments(user_id,lesson_id,body,created_at) VALUES(?,?,?,?)',user.id,+m[1],text,now()); return send(201,{ok:true}); }
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
        const esc=value=>String(value).replace(/\\/g,'\\\\').replace(/\r?
/g,'\
').replace(/[,;]/g,c=>'\\'+c);
        const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
        const rows=events().map(e=>`BEGIN:VEVENT\r
UID:coovi-${e.id}@cooviacademy\r
DTSTAMP:${date(now())}\r
DTSTART:${date(e.starts_at)}\r
DTEND:${date(Date.parse(e.starts_at)+3600000)}\r
SUMMARY:${esc(e.title)}\r
DESCRIPTION:${esc(e.instructor)}\r
END:VEVENT`).join('\r
');
        res.setHeader('Content-Disposition','attachment; filename="cooviacademy.ics"'); return sendText(`BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//CooviAcademy//ES\r
${rows}\r
END:VCALENDAR\r
`,'text/calendar; charset=utf-8');
      }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/results$/)) && method==='GET') {
        const course=accessCourse(+m[1]), result=resultForCourse(course.id,user.id);
        const certificate=result.allCompleted ? get('SELECT id FROM certificates WHERE user_id=? AND course_id=?',user.id,course.id) : null;
        return send(200,{...result,certificateId:certificate?.id || null,nextCourse:result.allCompleted ? nextPathCourse(course.id,user.id) : null});
      }
      if ((m=route.match(/^\/api\/courses\/(\d+)\/certificate$/)) && method==='POST') {
        const course=accessCourse(+m[1]), result=resultForCourse(course.id,user.id);
        if(!result.allCompleted) fail(400,'Necesitas aprobar el 100% de las lecciones para obtener la constancia.');
        run('INSERT OR IGNORE INTO certificates VALUES(?,?,?,?)',randomUUID(),user.id,course.id,now());
        const certificate=get('SELECT * FROM certificates WHERE user_id=? AND course_id=?',user.id,course.id);
        const nextCourse=nextPathCourse(course.id,user.id);
        return send(200,{...certificate,nextCourse,approvalPercentage:result.completionPercentage,finalScore:result.finalScore});
      }
      if ((m=route.match(/^\/api\/certificates\/([a-f0-9-]+)$/)) && method==='GET') {
        auth();
        const cert=get('SELECT cert.*,c.data,u.name FROM certificates cert JOIN courses c ON c.id=cert.course_id JOIN users u ON u.id=cert.user_id WHERE cert.id=? AND cert.user_id=?',m[1],user.id);
        if(!cert) fail(404,'Constancia no encontrada.');
        accessCourse(cert.course_id);
        const result=resultForCourse(cert.course_id,user.id);
        if(!result.allCompleted) fail(403,'La constancia está bloqueada hasta aprobar el 100% del curso.');
        const scoreText=result.finalScore===null ? 'Curso informativo sin nota numérica.' : 'Nota final: '+result.finalScore.toLocaleString('es-CO')+'%.';
        return sendText(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Constancia de finalización</title><style>body{font-family:Arial;padding:8vw;color:#173d6e}main{border:6px solid #ebc302;padding:5vw;text-align:center}h1{font-size:36px}p{line-height:1.7}@media print{button{display:none}}</style><main><p>Coovitel | CooviAcademy</p><h1>Constancia de finalización</h1><p>${escapeHtml(cert.name)} aprobó el 100% del curso</p><h2>${escapeHtml(JSON.parse(cert.data).title)}</h2><p><strong>${escapeHtml(scoreText)}</strong></p><p>${escapeHtml(cert.issued_at.slice(0,10))}</p><small>Registro ${escapeHtml(cert.id)}<br>Constancia de participación de la plataforma. No equivale a un título ni a una certificación oficial.</small></main><p>Usa la opción Imprimir de tu navegador para guardar como PDF.</p></html>`);
      }
      if(route==='/api/admin/uploads' && method==='POST') {
        staff();
        const mime=req.headers['content-type'];
        if(!['video/mp4','video/webm','application/pdf','image/png','image/jpeg','image/webp'].includes(mime)) fail(415,'Solo MP4, WebM, PDF, PNG, JPEG o WebP.');
        const max=MAX_MEDIA_BYTES;
        if(Number(req.headers['content-length'])>max) fail(413,'El archivo supera 100 MB.');
        let name='archivo';
        try { name=decodeURIComponent(req.headers['x-file-name']||'archivo'); } catch { fail(400,'Nombre de archivo no válido.'); }
        const id=randomUUID(); await mkdir(resolve(dataDir,'uploads'),{recursive:true}); const path=resolve(dataDir,'uploads',id);
        try {
          const size=await writeUpload(req,path,max,'El archivo supera 100 MB.');
          if(!size) fail(400,'Archivo vacío.');
          run('INSERT INTO uploads(id,mime,name,size) VALUES(?,?,?,?)',id,mime,clean(name,150),size);
          return send(201,{url:'/api/media/'+id});
        } catch(error) { await unlink(path).catch(() => {}); throw error; }
      }
      if(route==='/api/profile/avatar' && method==='POST') {
        auth();
        if(user.role!=='teacher') fail(403,'Solo los profesores pueden actualizar su foto.');
        const mime=req.headers['content-type'];
        if(!['image/png','image/jpeg','image/webp'].includes(mime)) fail(415,'La foto debe ser PNG, JPEG o WebP.');
        const max=MAX_AVATAR_BYTES;
        if(Number(req.headers['content-length'])>max) fail(413,'La foto supera 5 MB.');
        const id=randomUUID(); await mkdir(resolve(dataDir,'uploads'),{recursive:true}); const path=resolve(dataDir,'uploads',id);
        try {
          const size=await writeUpload(req,path,max,'La foto supera 5 MB.');
          if(!size) fail(400,'Archivo vacío.');
          run('INSERT INTO uploads(id,mime,name,size) VALUES(?,?,?,?)',id,mime,'foto de perfil',size);
          run('UPDATE users SET avatar_url=? WHERE id=?','/api/media/'+id,user.id);
          return send(200,{user:publicUser(get('SELECT * FROM users WHERE id=?',user.id))});
        } catch(error) { await unlink(path).catch(() => {}); throw error; }
      }
      if(route==='/api/uploads' && method==='POST') {
        member();
        limited('attachments:'+user.id,20,60000);
        let fileName;try{fileName=decodeURIComponent(req.headers['x-file-name']||'');}catch{fail(400,'Nombre de archivo no válido.');}
        const name=clean(fileName,150), incoming=req.headers['content-type']?.split(';')[0] || 'application/octet-stream';
        const mime=validateAttachmentMetadata(name,incoming);
        if(Number(req.headers['content-length'])>MAX_ATTACHMENT_BYTES)fail(413,'El archivo supera el límite de 10 MB.');
        const id=randomUUID(); await mkdir(resolve(dataDir,'uploads'),{recursive:true});
        const path=resolve(dataDir,'uploads',id);
        let size=0;
        try {
          size=await writeUpload(req,path,MAX_ATTACHMENT_BYTES,'El archivo supera el límite de 10 MB.');
          if(!size) fail(400,'Archivo vacío.');
          validateAttachment(await readFile(path),name,mime);
          run('INSERT INTO uploads(id,mime,name,size,owner_id,purpose) VALUES(?,?,?,?,?,?)',id,mime,name,size,user.id,'attachment');
        } catch(error) { await unlink(path).catch(()=>{}); throw error; }
        return send(201,{url:'/api/media/'+id,name,size});
      }
      if ((m=route.match(/^\/api\/(admin|teacher)\/trash$/)) && method==='GET') {
        if(m[1]==='admin')admin();else staff();
        purgeExpiredTrash();
        const scope=user.role==='admin'?'':' AND c.owner_id=?', args=user.role==='admin'?[]:[user.id];
        const trashItem = row => ({ id:row.id, title:row.title, archived_at:row.archived_at, expires_at:new Date(Date.parse(row.archived_at)+TRASH_RETENTION_MS).toISOString() });
        return send(200,{
          courses:all('SELECT c.id,c.data,c.archived_at FROM courses c WHERE c.archived_at IS NOT NULL'+scope+' ORDER BY c.archived_at DESC',...args).map(row=>trashItem({...row,title:JSON.parse(row.data).title})),
          lessons:all('SELECT l.id,l.course_id,l.title,l.archived_at,c.data FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.archived_at IS NOT NULL AND c.archived_at IS NULL'+scope+' ORDER BY l.archived_at DESC',...args).map(row=>({...trashItem(row),course_title:JSON.parse(row.data).title}))
        });
      }
      if ((m=route.match(/^\/api\/admin\/trash\/(courses|lessons)\/(\d+)$/)) && method==='DELETE') { admin(); permanentlyDeleteTrash(m[1], Number(m[2])); return send(200,{ok:true,permanentlyDeleted:true}); }
      if ((m=route.match(/^\/api\/(admin|teacher)\/(courses|lessons)\/(\d+)(\/restore)?$/)) && (method==='DELETE' || (method==='POST' && m[4]))) {
        if(m[1]==='admin')admin();else staff();
        if(m[1]!=='admin') fail(403,'Solo el administrador puede eliminar o restaurar contenido.');
        const restore=method==='POST', id=Number(m[3]), table=m[2];
        if(table==='courses')managedCourse(id,true);
        else { const lesson=get('SELECT * FROM lessons WHERE id=?',id);if(!lesson)fail(404,'Lección no encontrada.');managedCourse(lesson.course_id); }
        run('UPDATE '+table+' SET archived_at=?,published=0 WHERE id=?',restore?null:now(),id);
        return send(200,{ok:true,restored:restore});
      }
      if (route.startsWith('/api/teacher/')) {
        const teacher = staff();
        if (teacher.role !== 'teacher') fail(403, 'Esta sección corresponde al panel docente.');
        if (route === '/api/teacher/overview' && method === 'GET') { const leaderboard=courseLeaderboard(); return send(200, { courses: all('SELECT * FROM courses WHERE owner_id=? AND archived_at IS NULL ORDER BY id DESC', teacher.id).map(row => courseData(row, true, leaderboard)) }); }
        if (route === '/api/teacher/courses' && method === 'POST') {
          const b = rejectClientIdentity(await body());
          const data = { title:clean(b.title), category:clean(b.category,60), description:clean(b.description,5000), instructor:clean(b.instructor)||teacher.name, instructorRole:clean(b.instructorRole)||'Profesor CooviAcademy', duration:clean(b.duration,50), level:clean(b.level,50), image:safeURL(b.image,true), free:!!b.free, new:false, rating:0, students:0, lessons:0 };
          if (!data.title || !data.category || !data.description) fail(400, 'Completa título, categoría y descripción.');
          const result=run('INSERT INTO courses(data,published,owner_id,created_by) VALUES(?,0,?,?)',JSON.stringify(data),teacher.id,teacher.id); return send(201,{id:Number(result.lastInsertRowid),pendingApproval:true});
        }
        if ((m=route.match(/^\/api\/teacher\/courses\/(\d+)$/)) && method === 'PUT') {
          const row=managedCourse(+m[1]); const b=rejectClientIdentity(await body()); const previous=JSON.parse(row.data); const data={title:clean(b.title),category:clean(b.category,60),description:clean(b.description,5000),instructor:clean(b.instructor)||teacher.name,instructorRole:clean(b.instructorRole)||'Profesor CooviAcademy',duration:clean(b.duration,50),level:clean(b.level,50),image:safeURL(b.image,true),free:!!b.free,new:false,rating:previous.rating||0,students:0,lessons:0};
          if(!data.title||!data.category||!data.description) fail(400,'Completa título, categoría y descripción.');
          run('UPDATE courses SET data=?,published=0 WHERE id=?',JSON.stringify(data),+m[1]); return send(200,{ok:true,pendingApproval:true});
        }
        if ((m=route.match(/^\/api\/teacher\/courses\/(\d+)\/lessons$/))) {
          managedCourse(+m[1]);
          if(method==='GET') return send(200,all('SELECT * FROM lessons WHERE course_id=? AND archived_at IS NULL ORDER BY position,id',+m[1]));
           if(method==='POST'){const b=rejectClientIdentity(await body());const lessonType=b.lesson_type==='form'?'form':'content';const mode=evaluationMode(b.evaluation_mode);if(!clean(b.title))fail(400,'Escribe el título.');if(lessonType==='content'&&b.published&& !clean(b.content,50000)&&!b.video_url)fail(400,'Añade contenido o video antes de publicar.');if(lessonType==='form'&&b.published&&!normalizeFormSchema(b.form_schema))fail(400,'Configura al menos un campo del formulario.');const formSchema=lessonType==='form'?normalizeFormSchema(b.form_schema):'';const result=run('INSERT INTO lessons(course_id,title,content,video_url,resource_url,position,published,lesson_type,evaluation_mode,form_schema) VALUES(?,?,?,?,?,?,?,?,?,?)',+m[1],clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published),lessonType,mode,formSchema);return send(201,{id:Number(result.lastInsertRowid)});}
        }
        if ((m=route.match(/^\/api\/teacher\/lessons\/(\d+)$/)) && method === 'PUT') {
           const lesson=get('SELECT * FROM lessons WHERE id=?',+m[1]);if(!lesson)fail(404,'Lección no encontrada.');managedCourse(lesson.course_id);const b=rejectClientIdentity(await body());const lessonType=b.lesson_type==='form'?'form':'content';const mode=evaluationMode(b.evaluation_mode);if(!clean(b.title))fail(400,'Escribe el título.');if(lessonType==='content'&&b.published&&!clean(b.content,50000)&&!b.video_url)fail(400,'Añade contenido o video antes de publicar.');const formSchema=lessonType==='form'?normalizeFormSchema(b.form_schema):'';if(lessonType==='form'&&b.published&&!formSchema)fail(400,'Configura al menos un campo del formulario.');run('UPDATE lessons SET title=?,content=?,video_url=?,resource_url=?,position=?,published=?,lesson_type=?,evaluation_mode=?,form_schema=? WHERE id=?',clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published),lessonType,mode,formSchema,+m[1]);return send(200,{ok:true});
        }
        if ((m=route.match(/^\/api\/teacher\/courses\/(\d+)\/roster$/)) && method === 'GET') {
           const course=managedCourse(+m[1]);const lessons=all('SELECT id,title,position,lesson_type,evaluation_mode,form_schema FROM lessons WHERE course_id=? AND archived_at IS NULL ORDER BY position,id',course.id);const students=all("SELECT u.id,u.name,u.email,u.avatar_url FROM users u JOIN enrollments e ON e.user_id=u.id WHERE e.course_id=? AND u.role='student' ORDER BY u.name",course.id).map(student=>({...student,progress:all('SELECT lesson_id,completed,note,score,teacher_note,graded_at FROM progress WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?)',student.id,course.id),submissions:all('SELECT id,lesson_id,file_url,file_name,note,status,feedback,submitted_at FROM submissions WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?) ORDER BY submitted_at DESC',student.id,course.id),form_responses:all('SELECT id,lesson_id,answers,submitted_at,form_schema,question_grades FROM form_responses WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?) ORDER BY submitted_at DESC',student.id,course.id)}));return send(200,{course:courseData(course,true),lessons,students});
        }
      if ((m=route.match(/^\/api\/teacher\/lessons\/(\d+)\/grades\/([^/]+)$/)) && method === 'PUT') {
          const lesson=get('SELECT * FROM lessons WHERE id=?',+m[1]);
          if(!lesson)fail(404,'Lección no encontrada.');
          managedCourse(lesson.course_id);
          return send(200,saveLessonGrade(lesson,decodeURIComponent(m[2]),rejectClientIdentity(await body()),user.id));
        }
        if ((m=route.match(/^\/api\/teacher\/submissions\/(.*)$/)) && method === 'PUT') {
          const teacher=staff();const submission=get('SELECT s.*,l.course_id FROM submissions s JOIN lessons l ON l.id=s.lesson_id WHERE s.id=?',decodeURIComponent(m[1]));if(!submission)fail(404,'Entrega no encontrada.');managedCourse(submission.course_id);const b=rejectClientIdentity(await body());if(!['pending','approved','rejected'].includes(b.status))fail(400,'Estado de entrega inválido.');run('UPDATE submissions SET status=?,feedback=?,reviewed_by=?,reviewed_at=? WHERE id=?',b.status,clean(b.feedback,3000),teacher.id,now(),submission.id);return send(200,{ok:true});
        }
      }
      if(route.startsWith('/api/admin/')) {
        admin();
        const adminPathData = (row, leaderboard = courseLeaderboard()) => { const courses = all('SELECT c.id,c.data,c.published FROM learning_path_courses pc JOIN courses c ON c.id=pc.course_id WHERE pc.path_id=? AND c.archived_at IS NULL ORDER BY pc.position', row.id).map(course => ({ id:course.id, ...JSON.parse(course.data), published:!!course.published })); return { ...pathData(row, leaderboard), courseIds:courses.map(course => course.id), courses }; };
         if (route === '/api/admin/paths' && method === 'GET') return send(200, all('SELECT * FROM learning_paths ORDER BY id').map(row => adminPathData(row)));
        if (route === '/api/admin/paths' && method === 'POST' || (m=route.match(/^\/api\/admin\/paths\/(\d+)$/)) && (method === 'PUT' || method === 'DELETE')) {
          const id = m ? Number(m[1]) : null;
          if (method === 'DELETE') { if (!get('SELECT id FROM learning_paths WHERE id=?', id)) fail(404, 'Ruta no encontrada.'); run('DELETE FROM learning_paths WHERE id=?', id); return send(200, { ok:true }); }
          const b = await body(), title = clean(b.title, 160), description = clean(b.description, 2000), level = clean(b.level, 40) || 'Principiante', duration = clean(b.duration, 50), icon = clean(b.icon, 8) || '🧭', color = clean(b.color, 20) || '#27548F', accent = clean(b.accent, 20) || '#81A1DB';
          const courseIds = Array.isArray(b.courseIds) ? [...new Set(b.courseIds.map(Number).filter(Number.isInteger))] : [];
          if (title.length < 3 || !description || courseIds.length < 1 || courseIds.length > 20) fail(400, 'Completa nombre, descripción y selecciona entre 1 y 20 cursos.');
          for (const courseId of courseIds) if (!get('SELECT id FROM courses WHERE id=? AND archived_at IS NULL', courseId)) fail(400, 'Uno de los cursos seleccionados no existe.');
          if (b.published !== false && courseIds.some(courseId => !get('SELECT id FROM courses WHERE id=? AND published=1 AND archived_at IS NULL', courseId))) fail(400, 'Publica todos los cursos seleccionados antes de publicar la ruta.');
          const stamp = now();
          db.exec('BEGIN IMMEDIATE');
          try {
            const pathId = id || Number(run('INSERT INTO learning_paths(title,description,level,duration,icon,color,accent,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,?,?)', title, description, level, duration, icon, color, accent, Number(b.published !== false), stamp, stamp).lastInsertRowid);
            if (id && !get('SELECT id FROM learning_paths WHERE id=?', id)) fail(404, 'Ruta no encontrada.');
            if (id) run('UPDATE learning_paths SET title=?,description=?,level=?,duration=?,icon=?,color=?,accent=?,published=?,updated_at=? WHERE id=?', title, description, level, duration, icon, color, accent, Number(b.published !== false), stamp, id);
            run('DELETE FROM learning_path_courses WHERE path_id=?', pathId);
            courseIds.forEach((courseId, position) => run('INSERT INTO learning_path_courses(path_id,course_id,position) VALUES(?,?,?)', pathId, courseId, position));
            db.exec('COMMIT');
            return send(id ? 200 : 201, { id:pathId });
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        if ((m=route.match(/^\/api\/admin\/courses\/(\d+)\/roster$/)) && method === 'GET') {
           const course=managedCourse(+m[1]);const lessons=all('SELECT id,title,position,lesson_type,evaluation_mode,form_schema FROM lessons WHERE course_id=? AND archived_at IS NULL ORDER BY position,id',course.id);const students=all("SELECT u.id,u.name,u.email,u.avatar_url FROM users u JOIN enrollments e ON e.user_id=u.id WHERE e.course_id=? AND u.role='student' ORDER BY u.name",course.id).map(student=>({...student,progress:all('SELECT lesson_id,completed,note,score,teacher_note,graded_at FROM progress WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?)',student.id,course.id),submissions:all('SELECT id,lesson_id,file_url,file_name,note,status,feedback,submitted_at FROM submissions WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?) ORDER BY submitted_at DESC',student.id,course.id),form_responses:all('SELECT id,lesson_id,answers,submitted_at,form_schema,question_grades FROM form_responses WHERE user_id=? AND lesson_id IN (SELECT id FROM lessons WHERE course_id=?) ORDER BY submitted_at DESC',student.id,course.id)}));return send(200,{course:courseData(course,true),lessons,students});
        }
        if ((m=route.match(/^\/api\/admin\/lessons\/(\d+)\/grades\/([^/]+)$/)) && method === 'PUT') {
          const lesson=get('SELECT * FROM lessons WHERE id=?',+m[1]);
          if(!lesson)fail(404,'Lección no encontrada.');
          managedCourse(lesson.course_id);
          return send(200,saveLessonGrade(lesson,decodeURIComponent(m[2]),rejectClientIdentity(await body()),user.id));
        }
        if ((m=route.match(/^\/api\/admin\/submissions\/(.*)$/)) && method === 'PUT') { const submission=get('SELECT id FROM submissions WHERE id=?',decodeURIComponent(m[1])); if(!submission)fail(404,'Entrega no encontrada.'); const b=rejectClientIdentity(await body()); if(!['pending','approved','rejected'].includes(b.status))fail(400,'Estado de entrega inválido.'); run('UPDATE submissions SET status=?,feedback=?,reviewed_by=?,reviewed_at=? WHERE id=?',b.status,clean(b.feedback,3000),user.id,now(),submission.id); return send(200,{ok:true}); }
        if(route==='/api/admin/overview' && method==='GET') { const leaderboard=courseLeaderboard(); return send(200,{users:all('SELECT id,name,email,role,membership,avatar_url,created_at FROM users ORDER BY created_at DESC'),courses:all('SELECT * FROM courses WHERE archived_at IS NULL ORDER BY id').map(row=>courseData(row,true,leaderboard)),events:all('SELECT * FROM events ORDER BY starts_at'),paths:all('SELECT * FROM learning_paths ORDER BY id').map(row=>adminPathData(row,leaderboard))}); }
        if(route==='/api/admin/users' && method==='POST') {
          const b=rejectClientIdentity(await body()); const name=clean(b.name,100), email=emailOf(b.email), role=clean(b.role,20), membership=clean(b.membership,20), avatar_url=safeURL(b.avatar_url,true);
          if(name.length<2||!email.includes('@')||!['admin','teacher','student'].includes(role)||!['none','pending','approved'].includes(membership)||!validPassword(b.password)) fail(400,'Verifica nombre, correo, rol, estado y una contraseña de al menos 12 caracteres.');
          const id=authMode+':'+randomUUID(); const password=await hashPassword(b.password); try { run('INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,?,?,?)',id,name,email,password,role,membership,avatar_url,now()); } catch(error) { if(String(error.message).includes('UNIQUE')) fail(409,'Ese correo ya está registrado.'); throw error; }
          return send(201,{user:publicUser(get('SELECT * FROM users WHERE id=?',id))});
        }
        if((m=route.match(/^\/api\/admin\/users\/([^/]+)$/)) && (method==='PATCH'||method==='DELETE')) {
          const targetId=decodeURIComponent(m[1]); const target=get('SELECT * FROM users WHERE id=?',targetId); if(!target) fail(404,'Usuario no encontrado.');
          if(method==='DELETE') { if(target.id===user.id) fail(400,'No puedes eliminar tu propia cuenta.'); if(target.role==='admin'&&get("SELECT count(*) n FROM users WHERE role='admin'",).n<=1) fail(400,'Debe existir al menos un administrador.'); permanentlyDeleteUser(target.id); return send(200,{ok:true}); }
          const b=rejectClientIdentity(await body()); const name=b.name===undefined?target.name:clean(b.name,100), email=b.email===undefined?target.email:emailOf(b.email), role=b.role===undefined?target.role:clean(b.role,20), membership=b.membership===undefined?target.membership:clean(b.membership,20), avatar_url=b.avatar_url===undefined?(target.avatar_url||''):safeURL(b.avatar_url,true);
          if(name.length<2||!email.includes('@')||!['admin','teacher','student'].includes(role)||!['none','pending','approved'].includes(membership)) fail(400,'Verifica nombre, correo, rol y estado.');
          if(target.id===user.id&&role!=='admin') fail(400,'No puedes quitarte el rol de administrador.');
          if(target.role==='admin'&&role!=='admin'&&get("SELECT count(*) n FROM users WHERE role='admin'",).n<=1) fail(400,'Debe existir al menos un administrador.');
          let password=target.password; if(b.password!==undefined&&b.password!==''){if(!validPassword(b.password))fail(400,'La contraseña debe tener al menos 12 caracteres.');password=await hashPassword(b.password);}
           try { run('UPDATE users SET name=?,email=?,role=?,membership=?,avatar_url=?,password=? WHERE id=?',name,email,role,membership,avatar_url,password,target.id); } catch(error) { if(String(error.message).includes('UNIQUE')) fail(409,'Ese correo ya está registrado.'); throw error; }
           if (membership !== 'approved') run('DELETE FROM sessions WHERE user_id=?', target.id);
           return send(200,{user:publicUser(get('SELECT * FROM users WHERE id=?',target.id))});
        }
        if(route==='/api/admin/courses' && method==='POST' || (m=route.match(/^\/api\/admin\/courses\/(\d+)$/)) && method==='PUT') {
          const id=m?+m[1]:null; const b=await body(); const previous=id?get('SELECT * FROM courses WHERE id=?',id):null; if(id && !previous) fail(404,'Curso no encontrado.');
          const selectedTeacher=b.instructor_id ? get("SELECT id,name FROM users WHERE id=? AND role='teacher' AND (membership='approved' OR id=?)",b.instructor_id,previous?.owner_id||'') : (previous?.owner_id ? get("SELECT id,name FROM users WHERE id=? AND role='teacher'",previous.owner_id) : null); if(b.instructor_id && !selectedTeacher) fail(400,'Selecciona un profesor aprobado.');
          const data={title:clean(b.title),category:clean(b.category,60),description:clean(b.description,5000),instructor:selectedTeacher?.name||clean(b.instructor),instructorRole:clean(b.instructorRole),duration:clean(b.duration,50),level:clean(b.level,50),image:safeURL(b.image,true),free:!!b.free,new:!!b.new,rating:previous?JSON.parse(previous.data).rating||0:0,students:0,lessons:0};
          if(!data.title || !data.category) fail(400,'Escribe título y categoría.');
          if(id) run('UPDATE courses SET data=?,published=?,owner_id=? WHERE id=?',JSON.stringify(data),Number(!!b.published),selectedTeacher?.id||previous?.owner_id||null,id); else { const result=run('INSERT INTO courses(data,published,owner_id) VALUES(?,?,?)',JSON.stringify(data),Number(!!b.published),selectedTeacher?.id||null); return send(201,{id:Number(result.lastInsertRowid)}); }
          return send(200,{id});
        }
        if((m=route.match(/^\/api\/admin\/courses\/(\d+)\/lessons$/))) {
          if(!get('SELECT id FROM courses WHERE id=? AND archived_at IS NULL',+m[1])) fail(404,'Curso no encontrado.');
           if(method==='GET') return send(200,all('SELECT * FROM lessons WHERE course_id=? AND archived_at IS NULL ORDER BY position,id',+m[1]));
           if(method==='POST') { const b=await body(); const lessonType=b.lesson_type==='form'?'form':'content'; const mode=evaluationMode(b.evaluation_mode); if(!clean(b.title)) fail(400,'Escribe el título.'); if(lessonType==='content'&&b.published && !clean(b.content,50000) && !b.video_url) fail(400,'Añade contenido o video antes de publicar.'); const formSchema=lessonType==='form'?normalizeFormSchema(b.form_schema):''; const result=run('INSERT INTO lessons(course_id,title,content,video_url,resource_url,position,published,lesson_type,evaluation_mode,form_schema) VALUES(?,?,?,?,?,?,?,?,?,?)',+m[1],clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published),lessonType,mode,formSchema); return send(201,{id:Number(result.lastInsertRowid)}); }
        }
         if((m=route.match(/^\/api\/admin\/lessons\/(\d+)$/)) && method==='PUT') { const b=await body(); const lessonType=b.lesson_type==='form'?'form':'content'; const mode=evaluationMode(b.evaluation_mode); if(!get('SELECT id FROM lessons WHERE id=?',+m[1])) fail(404,'Lección no encontrada.'); if(!clean(b.title)) fail(400,'Escribe el título.'); if(lessonType==='content'&&b.published && !clean(b.content,50000) && !b.video_url) fail(400,'Añade contenido o video antes de publicar.'); const formSchema=lessonType==='form'?normalizeFormSchema(b.form_schema):''; run('UPDATE lessons SET title=?,content=?,video_url=?,resource_url=?,position=?,published=?,lesson_type=?,evaluation_mode=?,form_schema=? WHERE id=?',clean(b.title),clean(b.content,50000),safeURL(b.video_url,true),safeURL(b.resource_url,true),Number.isInteger(b.position)?b.position:0,Number(!!b.published),lessonType,mode,formSchema,+m[1]); return send(200,{ok:true}); }
        if(route==='/api/admin/events' && method==='POST' || (m=route.match(/^\/api\/admin\/events\/(\d+)$/)) && method==='PUT') {
          const b=await body(), id=m?+m[1]:null;
          if(!clean(b.title) || !Number.isFinite(Date.parse(b.starts_at)) || !Number.isInteger(b.capacity) || b.capacity<1 || b.capacity>100000) fail(400,'Verifica título, fecha y cupos.');
          if(id && !get('SELECT id FROM events WHERE id=?',id)) fail(404,'Sesión no encontrada.');
          if(id && get('SELECT count(*) n FROM reservations WHERE event_id=?',id).n>b.capacity) fail(400,'Los cupos no pueden ser menores que las reservas existentes.');
          const values=[clean(b.title),clean(b.instructor),clean(b.category),new Date(b.starts_at).toISOString(),b.capacity,safeURL(b.meeting_url),Number(!!b.published)];
          if(id) run('UPDATE events SET title=?,instructor=?,category=?,starts_at=?,capacity=?,meeting_url=?,published=? WHERE id=?',...values,id); else run('INSERT INTO events(title,instructor,category,starts_at,capacity,meeting_url,published) VALUES(?,?,?,?,?,?,?)',...values);
          return send(200,{ok:true});
        }
      }
      if((m=route.match(MEDIA_PATH_RE)) && ['GET','HEAD'].includes(method)) {
        const file=get('SELECT * FROM uploads WHERE id=?',m[1]); if(!file) fail(404,'Archivo no encontrado.');
        if(user?.role!=='admin') { const linked=all('SELECT * FROM lessons WHERE published=1 AND (video_url=? OR resource_url=?)',route,route); let allowed=false; for(const lesson of linked){try{accessCourse(lesson.course_id);allowed=true;break;}catch{}} const ownSubmission=!!(user&&get('SELECT 1 FROM submissions WHERE file_url=? AND user_id=?',route,user.id)); const teacherSubmission=!!(user&&user.role==='teacher'&&get('SELECT 1 FROM submissions s JOIN lessons l ON l.id=s.lesson_id JOIN courses c ON c.id=l.course_id WHERE s.file_url=? AND c.owner_id=?',route,user.id)); const imageCourse=file.mime.startsWith('image/') && all('SELECT data FROM courses WHERE published=1').some(c=>JSON.parse(c.data).image===route); const profileImage=file.mime.startsWith('image/') && !!get("SELECT 1 FROM users WHERE avatar_url=? AND role='teacher' AND membership='approved'",route); if(!allowed&&!ownSubmission&&!teacherSubmission&&!imageCourse&&!profileImage) fail(user?403:401,'No tienes acceso a este archivo.'); }
        const path=resolve(dataDir,'uploads',file.id); const range=req.headers.range;
        res.setHeader('Accept-Ranges','bytes'); res.setHeader('Content-Type',file.mime); res.setHeader('Cache-Control','private, no-store');
        let start=0,end=file.size-1;
        if(range){ const parts=/^bytes=(\d+)-(\d*)$/.exec(range); if(!parts) fail(416,'Rango no válido.');start=+parts[1];end=parts[2]?Math.min(+parts[2],end):end;if(start>end) fail(416,'Rango no válido.');res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${file.size}`); }
        res.setHeader('Content-Length',end-start+1); if(method==='HEAD') return res.end(); const stream=createReadStream(path,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      if(route.startsWith('/api/')) fail(404,'Ruta no encontrada.');
      if(!['GET','HEAD'].includes(method)) fail(405,'Método no permitido.');
      if (/^(?:\/(?:src|server|node_modules)(?:\/|$)|.*\.map$|\/\.env(?:$|\/)|\/package(?:-lock)?\.json$)/i.test(route)) fail(404,'Ruta no encontrada.');
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

