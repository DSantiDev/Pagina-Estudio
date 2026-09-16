import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';
import { openDatabase } from './db.js';
import { hashPassword } from './auth.js';

test('API: eliminar curso usa papelera y conserva la posibilidad de restaurarlo', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'coovi-trash-test-'));
  const db = openDatabase(dir);
  const password = 'CooviAdmin-2026!';
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run('local:admin', 'Admin', 'admin@trash.test', await hashPassword(password), 'admin', new Date().toISOString());
  db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run('local:teacher', 'Teacher', 'teacher@trash.test', await hashPassword('CooviTeacher-2026!'), 'teacher', new Date().toISOString());
  const course = db.prepare('SELECT id FROM courses ORDER BY id LIMIT 1').get();
  db.close();
  let server = createApp({ dataDir: dir, authMode: 'local' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username:'admin@trash.test', password }) });
    const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
    const teacherLogin = await fetch(base + '/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username:'teacher@trash.test', password:'CooviTeacher-2026!' }) });
    const teacherCookie = teacherLogin.headers.get('set-cookie')?.split(';', 1)[0];
    assert.equal((await fetch(base + `/api/teacher/courses/${course.id}`, { method:'DELETE', headers:{cookie:teacherCookie} })).status, 403);
    const deleted = await fetch(base + `/api/admin/courses/${course.id}`, { method:'DELETE', headers:{cookie,'Content-Type':'application/json'}, body:'{}' });
    assert.equal(deleted.status, 200);
    const trash = await fetch(base + '/api/admin/trash', { headers:{cookie} }).then(response => response.json());
    assert.ok(trash.courses.some(item => item.id === course.id));
    const hidden = await fetch(base + `/api/admin/courses/${course.id}/lessons`, { headers:{cookie} });
    assert.equal(hidden.status, 404);
    const restored = await fetch(base + `/api/admin/courses/${course.id}/restore`, { method:'POST', headers:{cookie,'Content-Type':'application/json'}, body:'{}' });
    assert.equal(restored.status, 200);
    await fetch(base + `/api/admin/courses/${course.id}`, { method:'DELETE', headers:{cookie} });
    const permanent = await fetch(base + `/api/admin/trash/courses/${course.id}`, { method:'DELETE', headers:{cookie} });
    assert.equal(permanent.status, 200);
    assert.equal((await fetch(base + '/api/admin/trash', { headers:{cookie} }).then(response => response.json())).courses.some(item => item.id === course.id), false);
    await new Promise(resolve => server.close(resolve));
    server = createApp({ dataDir: dir, authMode: 'local' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const catalogAfterRestart = await fetch(`http://127.0.0.1:${server.address().port}/api/courses`).then(response => response.json());
    assert.equal(catalogAfterRestart.some(item => item.id === course.id), false);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive:true }); }
});
