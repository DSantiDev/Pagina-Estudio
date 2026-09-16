# CooviAcademy

CooviAcademy es una plataforma React + TypeScript + Tailwind CSS con una API Node.js. Incluye catálogo, ranking de cursos más inscritos, rutas de aprendizaje, sesiones en vivo, aula, progreso, formularios, entregas, calificaciones, constancias y administración de usuarios.

## Requisitos y ejecución

Node.js 24 o superior.

```sh
npm install
npm run dev
```

Abre http://localhost:5173. El comando inicia React y la API (puerto 3001).

Para preparar el entorno local, ejecuta una vez `npm run setup:test`. El archivo `ACCESOS-PRUEBA.md` contiene tres cuentas de desarrollo: administrador, profesor y estudiante. El profesor puede crear cursos y lecciones, que quedan pendientes de aprobación; cada lección puede configurarse como informativa o calificable. Los formularios admiten campos, opciones y límites, y quedan bloqueados después del envío. El administrador publica cursos, gestiona sesiones, usuarios y rutas de aprendizaje. En Administración > Rutas de aprendizaje puede crear un recorrido, seleccionar sus cursos y ordenar la secuencia; al completar cada curso se habilita automáticamente el siguiente. Un estudiante no puede mantener más de tres cursos activos sin terminar; al completar uno se habilita otra inscripción. Los cursos y lecciones enviados a la papelera permanecen 30 días; solo el administrador puede restaurarlos o eliminarlos definitivamente.

Para ejecutar la compilación de producción:

```sh
npm run build
npm start
```

Abre http://localhost:3001. HOST y PORT permiten configurar el servidor de producción.

```sh
npm test
```

## Estructura

- src/App.tsx: home, catálogo y carrusel de cursos más inscritos.
- src/AcademyContext.tsx: sesión, navegación, protección de páginas y login.
- src/Workspace.tsx: mis cursos, aula, calendario, perfil y estados vacíos.
- src/CoursePlayer.tsx: lecciones, videos, notas, comentarios, progreso y constancias.
- src/AdminPanel.tsx: administración de usuarios, cursos, lecciones, rutas, archivos y sesiones.
- src/index.css: estilos y colores originales.
- src/assets: recursos gráficos del ZIP.
- shared/catalog.json: catálogo inicial compartido por el cliente y el servidor; es la única fuente de los cursos base.
- shared/paths.json: definición compartida de las rutas iniciales y su orden de cursos.
- src/courses.ts y server/courses.js: adaptadores de importación del catálogo compartido.
- server/index.js: servidor HTTP, validación, persistencia y archivos estáticos.
- server/data/academy.sqlite: base local de prueba; se crea con `setup:test` y no debe subirse a producción con contraseñas de prueba.

## API

POST /api/auth/login: valida usuario y contraseña en modo local o mediante `COOVITEL_AUTH_URL`.
GET /api/auth/me: sesión actual.
GET /api/courses: catálogo publicado.
GET /api/dashboard: cursos inscritos y constancias.
GET /api/instructors: profesores aprobados para la sección Nuestro equipo.
GET /api/paths: rutas publicadas con sus cursos ordenados.
GET/POST/PUT/DELETE /api/admin/paths: gestión administrativa de rutas y secuencia de cursos.
GET /api/teacher/overview, POST /api/teacher/courses: panel docente y cursos en aprobación.
GET /api/teacher/courses/:id/roster, PUT /api/teacher/lessons/:id/grades/:studentId: lista y calificaciones docentes.
POST/PATCH/DELETE /api/admin/users/:id: gestión global de usuarios (solo administrador).
GET /api/courses/:id/lessons: lecciones del curso.
PUT /api/lessons/:id/progress: guarda progreso y notas; las lecciones informativas pueden marcarse como vistas.
GET/POST /api/lessons/:id/form-responses: consulta o envía un formulario; un envío existente queda bloqueado.
GET/POST /api/lessons/:id/comments: foro de la lección.
GET /api/events: sesiones en vivo.
POST/DELETE /api/events/:id/reserve: reservas de asociados.
GET /api/events/calendar: descarga calendario ICS.
POST /api/courses/:id/certificate: emite constancia al completar.
GET /api/admin/trash: papelera con vencimiento a 30 días; DELETE /api/admin/trash/:kind/:id elimina definitivamente.

## Seguridad de producción

La API nunca toma el identificador del asociado desde el body, query string o headers: lo resuelve desde la sesión almacenada en el servidor. Las respuestas públicas tampoco exponen el identificador interno de la sesión; los comentarios reciben únicamente una marca `owner` para habilitar sus acciones.

El build no genera source maps y el servidor no publica `src`, `server`, `.env`, `package.json` ni archivos `.map`. Las claves de integración, incluido `COOVITEL_AUTH_TOKEN`, solo se leen en `server/office-auth.js` y deben existir únicamente como variables del servidor.

`server/rls.sql` activa y fuerza Row Level Security en cada tabla de PostgreSQL para producción. Antes de cada transacción autenticada, el backend debe establecer `SET LOCAL app.user_id` y `SET LOCAL app.user_role`; las tareas internas usan `SET LOCAL app.service_role = 'true'`. El SQLite local no tiene RLS nativo, por eso sus consultas se mantienen dentro de las mismas reglas de sesión y pertenencia en la API.

Para aplicarlo en el servidor PostgreSQL: `psql "$DATABASE_URL" -f server/rls.sql`.

## Alcance

El entorno incluido usa `AUTH_MODE=local` y las cuentas de desarrollo. Cuando Coovitel entregue la integración, cambia a `AUTH_MODE=office` y configura `COOVITEL_AUTH_URL` en el `.env`; el adaptador `server/office-auth.js` espera una confirmación HTTPS del sistema externo. Al confirmar la identidad se habilitan los cursos exclusivos y se crea una sesión segura en la academia. Asóciate abre https://coovitel.coop/. El panel de administración permite publicar cursos, lecciones, videos, recursos, sesiones en vivo, reservas, comentarios, calificaciones, progreso y constancias.

Las imágenes de cursos y Google Fonts necesitan Internet; logo y recursos del diseño son locales. Antes de un lanzamiento público se requiere autenticación real, contenidos autorizados, políticas de tratamiento de datos y protección contra abuso del formulario. Este entregable está preparado para desarrollo local.

Los archivos de instrucciones y automatización incluidos dentro del ZIP se trataron como material de origen y no se incorporaron a la configuración del proyecto.


