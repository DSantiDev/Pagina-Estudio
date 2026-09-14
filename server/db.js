import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { COURSES } from './courses.js';
export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'academy.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', membership TEXT NOT NULL DEFAULT 'none', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS courses(id INTEGER PRIMARY KEY, data TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', resource_url TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_lessons_course_position ON lessons(course_id,position);
    CREATE TABLE IF NOT EXISTS enrollments(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, course_id INTEGER NOT NULL REFERENCES courses(id), created_at TEXT NOT NULL, PRIMARY KEY(user_id,course_id));
    CREATE TABLE IF NOT EXISTS progress(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, completed INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY(user_id,lesson_id));
    CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_comments_lesson ON comments(lesson_id,id);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, title TEXT NOT NULL, instructor TEXT NOT NULL, category TEXT NOT NULL, starts_at TEXT NOT NULL, capacity INTEGER NOT NULL, meeting_url TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS reservations(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY(user_id,event_id));
    CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, mime TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS certificates(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), course_id INTEGER NOT NULL REFERENCES courses(id), issued_at TEXT NOT NULL, UNIQUE(user_id,course_id));
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires);
  `);
  const seed = db.prepare('INSERT OR IGNORE INTO courses(id,data) VALUES(?,?)');
  for (const course of COURSES) seed.run(course.id, JSON.stringify(course));
  return db;
}
