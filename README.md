# CooviAcademy

Proyecto React + TypeScript + Tailwind CSS, con API Node.js. Conserva el diseño incluido en el ZIP de Figma: portada, catálogo, categorías, rutas, eventos, instructores y beneficios, con adaptación móvil.

## Requisitos y ejecución

Node.js 24 o superior.

```sh
npm install
npm run dev
```

Abre http://localhost:5173. El comando inicia React y la API (puerto 3001).

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

- src/App.tsx: interfaz y navegación del diseño original, búsqueda, filtros, detalle de cursos y formulario.
- src/index.css: estilos y colores originales.
- src/assets: recursos gráficos del ZIP.
- src/courses.ts: catálogo inicial usado si la API no responde.
- server/courses.js: catálogo servido por la API. Mantenerlo sincronizado con src/courses.ts al modificar contenido.
- server/index.js: servidor HTTP, validación, persistencia y archivos estáticos.
- server/data/membership-requests.jsonl: solicitudes locales; se crea automáticamente, no se expone mediante API y no se incluye en el entregable.

## API`r`n`r`nPOST /api/auth/login: valida usuario y contraseña con COOVITEL_AUTH_URL.`r`nGET /api/auth/me: sesión actual.`r`nGET /api/courses: catálogo publicado.`r`nGET /api/dashboard: cursos inscritos y constancias.`r`nGET /api/courses/:id/lessons: lecciones del curso.`r`nPUT /api/lessons/:id/progress: guarda progreso y notas.`r`nGET/POST /api/lessons/:id/comments: foro de la lección.`r`nGET /api/events: sesiones en vivo.`r`nPOST/DELETE /api/events/:id/reserve: reservas de asociados.`r`nGET /api/events/calendar: descarga calendario ICS.`r`nPOST /api/courses/:id/certificate: emite constancia al completar.`r`n`r`n## Alcance

El inicio de sesión usa las credenciales de la oficina virtual Coovitel mediante el adaptador server/office-auth.js. Cuando la oficina confirma la identidad, se habilitan los cursos exclusivos y se crea una sesión segura en la academia. Asóciate abre https://coovitel.coop/. El panel de administración permite publicar cursos, lecciones, videos, recursos, sesiones en vivo, reservas, comentarios, progreso y constancias.

Las imágenes de cursos y Google Fonts necesitan Internet; logo y recursos del diseño son locales. Antes de un lanzamiento público se requiere autenticación real, contenidos autorizados, políticas de tratamiento de datos y protección contra abuso del formulario. Este entregable está preparado para desarrollo local.

Los archivos de instrucciones y automatización incluidos dentro del ZIP se trataron como material de origen y no se incorporaron a la configuración del proyecto.


