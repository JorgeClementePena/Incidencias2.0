# Flujo de la App

Este documento resume cómo funciona la aplicación de incidencias a nivel de usuario y de administración.

## 1. Acceso a la aplicación

La app tiene dos entradas:

- Escritorio: `index.html`
- Móvil: `mobile.html`

Ambas usan la misma API backend y el mismo modelo de datos.

## 2. Registro y login

### Registro

Un usuario nuevo puede registrarse desde la pantalla de acceso.

Datos principales:

- Nombre
- Correo corporativo
- Departamento
- Contraseña

Condiciones:

- Solo se admiten correos `@fidamc.es`
- La cuenta no se activa directamente

Proceso:

1. El usuario introduce sus datos.
2. El backend genera un código temporal de verificación.
3. Se envía ese código por email.
4. El usuario introduce el código recibido.
5. Si el código es correcto, se crea la cuenta y se inicia sesión.

### Login

El usuario accede con:

- Email
- Contraseña

Si las credenciales son válidas, la app guarda un token JWT y carga la interfaz principal.

## 3. Flujo principal de usuario

El flujo estándar de un usuario normal es:

1. Iniciar sesión
2. Ir a `Nueva Incidencia`
3. Rellenar el formulario
4. Enviar la incidencia

### Campos que rellena el usuario

Bloque de identificación:

- Código de proyecto
- Proceso
- Fecha de detección
- Quién detecta
- Departamento
- Área
- Programa

Bloque de descripción:

- Descripción de la incidencia
- Causas
- Acción inmediata

Bloque de impacto:

- Valoración económica
- Afecta al MA
- Afecta resultado

### Qué ocurre al enviarla

Cuando el usuario envía la incidencia:

1. El backend valida los campos obligatorios.
2. Se genera un identificador interno tipo `NC-0001`.
3. Se guarda en base de datos con estado inicial:
   - `Abierta`
   - `revisada = 0`
4. Se buscan responsables por:
   - área
   - departamento
   - programa
5. Se envía notificación por email a responsables o, si no hay responsables, a administradores.

Importante:

- En este punto la incidencia todavía no está revisada.
- La categoría no la pone el usuario.

## 4. Flujo de revisión del administrador

Las incidencias nuevas pasan al circuito de revisión.

### Pantalla de pendientes

Los administradores ven una sección `Pendientes`.

Ahí aparecen las incidencias con:

- `revisada = 0`

El admin abre una incidencia pendiente y completa o corrige sus datos.

### Qué hace el admin en la revisión

Puede editar:

- Proyecto
- Proceso
- Fecha
- Detectado por
- Departamento
- Área
- Programa
- Categoría
- Causas
- Acción inmediata
- Acción correctora
- Valoración
- Email destino

### Regla de categoría

La categoría:

- no es libre
- depende del área seleccionada
- se carga desde el catálogo de categorías por área

Si el admin intenta guardar una categoría que no pertenece a ese área, el backend la rechaza.

### Resultado de la revisión

Cuando el admin guarda:

1. La incidencia se actualiza.
2. Si tiene categoría, queda marcada como:
   - `revisada = 1`
3. Ya pasa a formar parte del circuito normal de consulta.

Opcionalmente:

- el admin puede guardar y notificar al creador

## 5. Gestión de incidencias ya revisadas

Una vez revisada, la incidencia aparece en:

- listado de incidencias
- dashboard
- modal de detalle

El admin puede además:

- cambiar estado
- editar de nuevo la incidencia

Estados disponibles:

- `Abierta`
- `Cerrada`

Cuando se cierra:

- se guarda `closed_at`

## 6. Catálogos de la aplicación

La app usa catálogos para varios campos:

- Áreas
- Departamentos
- Programas
- Categorías por área

### Categorías por área

Las categorías ya no están fijas en código como antes.

Ahora:

- se guardan en la tabla `area_categorias`
- el admin puede gestionarlas desde la pantalla `Categorías`

Acciones permitidas:

- añadir categoría
- editar categoría
- eliminar categoría

Impacto:

- escritorio y móvil usan el mismo catálogo
- la revisión admin siempre ofrece categorías válidas para el área elegida

## 7. Gestión de usuarios y responsabilidades

El administrador puede gestionar:

- usuarios
- activación/desactivación
- rol admin/user
- responsabilidades

### Responsabilidades

Se usan para decidir quién recibe notificaciones.

Cada usuario puede tener responsabilidades por:

- área
- departamento
- programa

Cuando se crea una incidencia, el sistema busca responsables que coincidan con esos valores.

## 8. Dashboard y consultas

Las incidencias revisadas alimentan:

- KPIs
- gráficas
- filtros
- listados

Filtros disponibles:

- área
- departamento
- programa
- año
- mes
- categoría
- estado
- búsqueda por texto

## 9. Flujo móvil

La versión móvil permite:

- login
- creación de incidencias
- revisión de pendientes si el usuario es admin

Comparte la misma lógica que escritorio:

- mismos endpoints
- mismos catálogos
- mismas categorías por área

## 10. Emails

La app puede enviar tres tipos principales de emails:

- verificación de registro
- nueva incidencia
- notificación al creador tras revisión

Si SMTP no está configurado:

- la app no bloquea el flujo
- simula el envío en consola

## 11. Datos de prueba

La aplicación dispone de un script de seed:

- `backend/db/seed.js`

Ese script genera incidencias de prueba coherentes con:

- áreas actuales
- categorías válidas por área
- estados
- valoraciones
- textos de ejemplo

## 12. Resumen del flujo general

Flujo corto:

1. Usuario se registra o inicia sesión
2. Usuario crea incidencia
3. La incidencia queda abierta y pendiente de revisión
4. El admin revisa y asigna categoría según el área
5. La incidencia pasa a revisada
6. Ya aparece en dashboard, consultas y estadísticas
7. El admin puede cerrarla o volver a editarla

