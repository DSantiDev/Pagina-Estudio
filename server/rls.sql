-- CooviAcademy · Row Level Security para PostgreSQL de producción
--
-- Esta migración se ejecuta en la base de datos real, no en el SQLite local.
-- Antes de cada transacción autenticada, la API debe establecer:
--   SET LOCAL app.user_id = '<id interno de la sesión>';
--   SET LOCAL app.user_role = 'student' | 'teacher' | 'admin';
-- Para tareas de backend sin usuario (login, limpieza y migraciones), usar
--   SET LOCAL app.service_role = 'true';

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_user_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_role', true), '')
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_user_role() = 'admin'
$$;

CREATE OR REPLACE FUNCTION app.is_service_role() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.service_role', true) = 'true'
$$;

CREATE OR REPLACE FUNCTION app.can_access_course(target_course_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT app.is_admin() OR EXISTS (
    SELECT 1
    FROM courses c
    WHERE c.id = target_course_id
      AND c.published = true
      AND (
        COALESCE(((c.data::jsonb)->>'free')::boolean, false)
        OR EXISTS (
          SELECT 1
          FROM enrollments e
          JOIN users u ON u.id = e.user_id
          WHERE e.course_id = c.id
            AND e.user_id = app.current_user_id()
            AND u.membership = 'approved'
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION app.can_access_lesson(target_lesson_id bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app AS $$
  SELECT EXISTS (
    SELECT 1 FROM lessons l
    WHERE l.id = target_lesson_id
      AND l.published = true
      AND app.can_access_course(l.course_id)
  )
$$;

-- Activación explícita en cada tabla. FORCE también protege contra consultas
-- ejecutadas por el propietario de las tablas fuera del rol de servicio.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE resets FORCE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress FORCE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads FORCE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates FORCE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_paths FORCE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_path_courses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_select ON users FOR SELECT USING (app.is_service_role() OR app.is_admin() OR id = app.current_user_id());
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (app.is_service_role() OR app.is_admin());
CREATE POLICY users_update ON users FOR UPDATE USING (app.is_service_role() OR app.is_admin() OR id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR id = app.current_user_id());

DROP POLICY IF EXISTS sessions_backend ON sessions;
CREATE POLICY sessions_backend ON sessions USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS resets_backend ON resets;
CREATE POLICY resets_backend ON resets USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS courses_select ON courses;
DROP POLICY IF EXISTS courses_manage ON courses;
CREATE POLICY courses_select ON courses FOR SELECT USING (app.is_service_role() OR app.is_admin() OR published = true);
CREATE POLICY courses_manage ON courses FOR ALL USING (app.is_service_role() OR app.is_admin() OR (app.current_user_role() = 'teacher' AND owner_id = app.current_user_id())) WITH CHECK (app.is_service_role() OR app.is_admin() OR (app.current_user_role() = 'teacher' AND owner_id = app.current_user_id()));

DROP POLICY IF EXISTS lessons_select ON lessons;
DROP POLICY IF EXISTS lessons_manage ON lessons;
CREATE POLICY lessons_select ON lessons FOR SELECT USING (app.is_service_role() OR app.is_admin() OR (published = true AND app.can_access_course(course_id)));
CREATE POLICY lessons_manage ON lessons FOR ALL USING (app.is_service_role() OR app.is_admin() OR (app.current_user_role() = 'teacher' AND EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.owner_id = app.current_user_id()))) WITH CHECK (app.is_service_role() OR app.is_admin() OR (app.current_user_role() = 'teacher' AND EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.owner_id = app.current_user_id())));

DROP POLICY IF EXISTS enrollments_select ON enrollments;
DROP POLICY IF EXISTS enrollments_write ON enrollments;
CREATE POLICY enrollments_select ON enrollments FOR SELECT USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());
CREATE POLICY enrollments_write ON enrollments FOR ALL USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS progress_owner ON progress;
CREATE POLICY progress_owner ON progress USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS comments_select ON comments;
DROP POLICY IF EXISTS comments_write ON comments;
CREATE POLICY comments_select ON comments FOR SELECT USING (app.is_service_role() OR app.is_admin() OR EXISTS (SELECT 1 FROM lessons l WHERE l.id = comments.lesson_id AND l.published = true AND app.can_access_course(l.course_id)));
CREATE POLICY comments_write ON comments FOR ALL USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS events_select ON events;
DROP POLICY IF EXISTS events_manage ON events;
CREATE POLICY events_select ON events FOR SELECT USING (app.is_service_role() OR app.is_admin() OR published = true);
CREATE POLICY events_manage ON events FOR ALL USING (app.is_service_role() OR app.is_admin()) WITH CHECK (app.is_service_role() OR app.is_admin());

DROP POLICY IF EXISTS reservations_owner ON reservations;
CREATE POLICY reservations_owner ON reservations USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS uploads_select ON uploads;
DROP POLICY IF EXISTS uploads_manage ON uploads;
CREATE POLICY uploads_select ON uploads FOR SELECT USING (
  app.is_service_role() OR app.is_admin() OR EXISTS (
    SELECT 1 FROM lessons l
    WHERE l.published = true
      AND app.can_access_course(l.course_id)
      AND (l.video_url = '/api/media/' || id OR l.resource_url = '/api/media/' || id)
  )
);
CREATE POLICY uploads_manage ON uploads FOR ALL USING (app.is_service_role() OR app.is_admin()) WITH CHECK (app.is_service_role() OR app.is_admin());

DROP POLICY IF EXISTS certificates_owner ON certificates;
CREATE POLICY certificates_owner ON certificates USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id()) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS rate_limits_backend ON rate_limits;
CREATE POLICY rate_limits_backend ON rate_limits USING (app.is_service_role()) WITH CHECK (app.is_service_role());

DROP POLICY IF EXISTS submissions_owner ON submissions;
DROP POLICY IF EXISTS submissions_staff ON submissions;
CREATE POLICY submissions_owner ON submissions FOR SELECT USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id() OR EXISTS (SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=submissions.lesson_id AND c.owner_id=app.current_user_id()));
CREATE POLICY submissions_staff ON submissions FOR ALL USING (app.is_service_role() OR app.is_admin() OR (app.current_user_role() = 'teacher' AND EXISTS (SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=submissions.lesson_id AND c.owner_id=app.current_user_id()))) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS form_responses_owner ON form_responses;
CREATE POLICY form_responses_owner ON form_responses FOR ALL USING (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id() OR (app.current_user_role() = 'teacher' AND EXISTS (SELECT 1 FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=form_responses.lesson_id AND c.owner_id=app.current_user_id()))) WITH CHECK (app.is_service_role() OR app.is_admin() OR user_id = app.current_user_id());

DROP POLICY IF EXISTS learning_paths_select ON learning_paths;
DROP POLICY IF EXISTS learning_paths_manage ON learning_paths;
CREATE POLICY learning_paths_select ON learning_paths FOR SELECT USING (app.is_service_role() OR app.is_admin() OR published = true);
CREATE POLICY learning_paths_manage ON learning_paths FOR ALL USING (app.is_service_role() OR app.is_admin()) WITH CHECK (app.is_service_role() OR app.is_admin());

DROP POLICY IF EXISTS learning_path_courses_select ON learning_path_courses;
DROP POLICY IF EXISTS learning_path_courses_manage ON learning_path_courses;
CREATE POLICY learning_path_courses_select ON learning_path_courses FOR SELECT USING (app.is_service_role() OR app.is_admin() OR EXISTS (SELECT 1 FROM learning_paths p WHERE p.id = learning_path_courses.path_id AND p.published = true));
CREATE POLICY learning_path_courses_manage ON learning_path_courses FOR ALL USING (app.is_service_role() OR app.is_admin()) WITH CHECK (app.is_service_role() OR app.is_admin());

COMMIT;
