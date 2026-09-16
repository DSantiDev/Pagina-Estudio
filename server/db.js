import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { COURSES } from './courses.js';
export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'academy.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', membership TEXT NOT NULL DEFAULT 'none', avatar_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL);
    CREATE TABLE IF NOT EXISTS learning_paths(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT 'Principiante', duration TEXT NOT NULL DEFAULT '', icon TEXT NOT NULL DEFAULT '🧭', color TEXT NOT NULL DEFAULT '#27548F', accent TEXT NOT NULL DEFAULT '#81A1DB', published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS learning_path_courses(path_id INTEGER NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, position INTEGER NOT NULL, PRIMARY KEY(path_id,course_id), UNIQUE(path_id,position));
    CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', resource_url TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, lesson_type TEXT NOT NULL DEFAULT 'content', evaluation_mode TEXT NOT NULL DEFAULT 'graded', form_schema TEXT NOT NULL DEFAULT '');
    CREATE INDEX IF NOT EXISTS idx_lessons_course_position ON lessons(course_id,position);
    CREATE TABLE IF NOT EXISTS enrollments(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id INTEGER NOT NULL REFERENCES courses(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,course_id));
    CREATE TABLE IF NOT EXISTS progress(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, completed INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, score INTEGER, graded_by TEXT REFERENCES users(id) ON DELETE SET NULL, graded_at TEXT, teacher_note TEXT NOT NULL DEFAULT '', PRIMARY KEY(user_id,lesson_id));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, file_url TEXT NOT NULL, file_name TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', feedback TEXT NOT NULL DEFAULT '', submitted_at TEXT NOT NULL, reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL, reviewed_at TEXT);
    CREATE TABLE IF NOT EXISTS form_responses(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, answers TEXT NOT NULL, validated INTEGER NOT NULL DEFAULT 0, submitted_at TEXT NOT NULL, UNIQUE(user_id,lesson_id));
    CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_comments_lesson ON comments(lesson_id,id);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, title TEXT NOT NULL, instructor TEXT NOT NULL, category TEXT NOT NULL, starts_at TEXT NOT NULL, capacity INTEGER NOT NULL, meeting_url TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS reservations(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(user_id,event_id));
    CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, mime TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS certificates(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), course_id INTEGER NOT NULL REFERENCES courses(id), issued_at TEXT NOT NULL, UNIQUE(user_id,course_id));
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS idx_learning_path_courses_order ON learning_path_courses(path_id,position);
  `);
  // Migración incremental para bases locales creadas antes de los roles docentes.
  const columns = [
    ['users', 'avatar_url TEXT NOT NULL DEFAULT \'\''],
    ['courses', 'owner_id TEXT REFERENCES users(id) ON DELETE SET NULL'],
    ['progress', 'score INTEGER'],
    ['progress', 'graded_by TEXT REFERENCES users(id) ON DELETE SET NULL'],
    ['progress', 'graded_at TEXT'],
    ['progress', 'teacher_note TEXT NOT NULL DEFAULT \'\''],
    ['lessons', 'lesson_type TEXT NOT NULL DEFAULT \'content\''],
    ['lessons', 'evaluation_mode TEXT NOT NULL DEFAULT \'graded\''],
    ['lessons', 'form_schema TEXT NOT NULL DEFAULT \'\''],
    ['form_responses', 'form_schema TEXT NOT NULL DEFAULT \'\''],
    ['form_responses', 'question_grades TEXT NOT NULL DEFAULT \'{}\''],
    ['uploads', 'owner_id TEXT REFERENCES users(id) ON DELETE SET NULL'],
    ['uploads', 'purpose TEXT NOT NULL DEFAULT \'material\''],
    ['courses', 'created_by TEXT REFERENCES users(id) ON DELETE SET NULL'],
    ['courses', 'archived_at TEXT'],
    ['lessons', 'archived_at TEXT'],
  ];
  for (const [table, definition] of columns) { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`); } catch (error) { if (!/duplicate column name|already exists/i.test(error.message)) throw error; } }
  // Preserve the available question labels for existing submissions before future edits.
  db.exec("UPDATE form_responses SET form_schema=coalesce((SELECT form_schema FROM lessons WHERE lessons.id=form_responses.lesson_id),'') WHERE form_schema=''");
  db.exec('UPDATE courses SET created_by=owner_id WHERE created_by IS NULL AND owner_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_courses_owner ON courses(owner_id); CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id,user_id); CREATE INDEX IF NOT EXISTS idx_progress_lesson ON progress(lesson_id,user_id); CREATE INDEX IF NOT EXISTS idx_submissions_lesson ON submissions(lesson_id,submitted_at); CREATE INDEX IF NOT EXISTS idx_submissions_user_lesson ON submissions(user_id,lesson_id,submitted_at); CREATE INDEX IF NOT EXISTS idx_form_responses_lesson_user ON form_responses(lesson_id,user_id);');
  // Los cursos base solo se cargan una vez. INSERT OR IGNORE por sí solo los
  // volvía a crear después de una eliminación permanente y un reinicio.
  const seeded = db.prepare("SELECT value FROM app_meta WHERE key='base_courses_seeded'").get();
  if (!seeded) {
    if (!db.prepare('SELECT 1 FROM courses LIMIT 1').get()) {
      const seed = db.prepare('INSERT OR IGNORE INTO courses(id,data) VALUES(?,?)');
      for (const course of COURSES) seed.run(course.id, JSON.stringify(course));
    }
    db.prepare("INSERT INTO app_meta(key,value) VALUES('base_courses_seeded',?)").run(new Date().toISOString());
  }
  return db;
}
