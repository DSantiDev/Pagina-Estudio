import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeFile, access } from 'node:fs/promises';
import { openDatabase } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const db = openDatabase(resolve(root, 'server/data'));
const accounts = [];
try {
  for (const [email, name, role, password, id] of [['admin@cooviacademy.test', 'Administrador CooviAcademy', 'admin', 'CooviAdmin-2026!', 'local:admin'], ['alumno@cooviacademy.test', 'Estudiante CooviAcademy', 'student', 'CooviAlumno-2026!', 'local:student'], ['profesor@cooviacademy.test', 'Profesor CooviAcademy', 'teacher', 'CooviProfesor-2026!', 'local:teacher']]) {
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (existing) db.prepare("UPDATE users SET password=?,role=?,membership='approved',name=? WHERE id=?").run(await hashPassword(password), role, name, existing.id);
    else db.prepare("INSERT INTO users(id,name,email,password,role,membership,avatar_url,created_at) VALUES(?,?,?,?,?,'approved','',?)").run(id, name, email, await hashPassword(password), role, new Date().toISOString());
    accounts.push({ usuario: email, contraseña: password, rol: role });
  }
  for (const row of db.prepare('SELECT * FROM courses').all()) {
    if (db.prepare('SELECT 1 FROM lessons WHERE course_id=?').get(row.id)) continue;
    const course = JSON.parse(row.data);
    const lessons = [
      ['Bienvenida y objetivos', `Bienvenido a ${course.title}.\n\nEn esta lección conocerás el propósito del curso y las herramientas disponibles en CooviAcademy.\n\nPuedes abrir lecciones, escribir notas privadas, comentar y guardar tu avance.\n\nPara empezar, escribe en tus notas qué te gustaría aprender sobre ${course.category.toLowerCase()}. Después selecciona “Marcar como vista”.`],
      ['Actividad: organiza tus ideas', `Actividad · ${course.category}\n\nPiensa en una situación cotidiana relacionada con este tema. Describe qué información te falta para comprenderla mejor.\n\nAnota una pregunta y una pequeña acción que te gustaría explorar. Puedes guardar el borrador en Mis notas o compartir una pregunta en la conversación.\n\nEsta actividad te ayuda a seguir tu avance y conectar el contenido con tus objetivos.`],
      ['Cierre del recorrido', `Has llegado al final del recorrido.\n\nRevisa las notas que guardaste y escribe una idea que quieras retomar más adelante.\n\nTu profesor revisará las actividades calificables y aprobará las lecciones cuando alcancen 70 puntos o más. Cuando todas estén aprobadas podrás solicitar tu constancia.\n\nDesde Administración se pueden añadir videos, recursos y nuevas lecciones.`],
    ];
    lessons.forEach(([title, content], position) => db.prepare("INSERT INTO lessons(course_id,title,content,position,published,evaluation_mode) VALUES(?,?,?,?,1,?)").run(row.id, title, content, position + 1, position === 0 ? 'informative' : 'graded'));
  }
  const student = db.prepare("SELECT id FROM users WHERE id='local:student'").get();
  const teacher = db.prepare("SELECT id FROM users WHERE id='local:teacher'").get();
  const firstCourse = db.prepare('SELECT id FROM courses ORDER BY id LIMIT 1').get();
  if (student && firstCourse) db.prepare('INSERT OR IGNORE INTO enrollments(user_id,course_id,created_at) VALUES(?,?,?)').run(student.id, firstCourse.id, new Date().toISOString());
  if (teacher && firstCourse) db.prepare('UPDATE courses SET owner_id=? WHERE id=? AND (owner_id IS NULL OR owner_id=?)').run(teacher.id, firstCourse.id, teacher.id);
  if (!db.prepare('SELECT 1 FROM events').get()) {
    const date = new Date(); date.setDate(date.getDate() + 7); date.setHours(17, 0, 0, 0);
    db.prepare("INSERT INTO events(title,instructor,category,starts_at,capacity,published) VALUES(?,?,?,?,?,1)").run('Sesión de bienvenida: conoce la academia', 'Equipo de formación', 'Bienvenida', date.toISOString(), 30);
  }
  try { await access(resolve(root, '.env')); }
  catch { await writeFile(resolve(root, '.env'), 'AUTH_MODE=local\nHOST=127.0.0.1\nPORT=3001\n'); }
  if (accounts.length) {
    const file = resolve(root, 'ACCESOS-PRUEBA.md');
    const prior = '# Accesos locales de desarrollo\n\nAbre `http://localhost:3001` e inicia sesión. Estas cuentas existen solo en la base SQLite local.\n';
    const descriptions = { admin:'Puede aprobar cursos, crear y eliminar usuarios, asignar profesores, administrar lecciones, sesiones y archivos.', teacher:'Puede crear cursos y lecciones pendientes de aprobación, calificar estudiantes, revisar formularios y entregas de archivos.', student:'Tiene el primer curso inscrito para probar notas, formularios, entregas, calificaciones y constancias.' };
    await writeFile(file, prior + accounts.map(a => `\n## ${a.rol}\n\n- Usuario: \`${a.usuario}\`\n- Contraseña: \`${a.contraseña}\`\n\n${descriptions[a.rol]||''}\n`).join('') + '\nEjecuta `npm run setup:test` después de instalar para preparar o migrar la base local.\n');
    console.log(JSON.stringify(accounts, null, 2));
  } else console.log('La base de prueba ya existe. Los usuarios y su progreso se conservan.');
} finally { db.close(); }
