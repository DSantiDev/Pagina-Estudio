# Accesos locales de desarrollo

Abre `http://localhost:3001` e inicia sesión. Estas cuentas existen solo en la base SQLite local.

## admin

- Usuario: `admin@cooviacademy.test`
- Contraseña: `CooviAdmin-2026!`

Puede aprobar cursos, crear y eliminar usuarios, asignar profesores, administrar lecciones, sesiones y archivos.

## student

- Usuario: `alumno@cooviacademy.test`
- Contraseña: `CooviAlumno-2026!`

Tiene el primer curso inscrito para probar notas, formularios, entregas, calificaciones y constancias.

## teacher

- Usuario: `profesor@cooviacademy.test`
- Contraseña: `CooviProfesor-2026!`

Puede crear cursos y lecciones pendientes de aprobación, calificar estudiantes, revisar formularios y entregas de archivos.

Ejecuta `npm run setup:test` después de instalar para preparar o migrar la base local.
