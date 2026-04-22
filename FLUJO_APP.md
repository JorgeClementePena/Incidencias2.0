# Flujo de la App

Este documento resume como funciona la aplicacion de incidencias a nivel de uso, administracion y operaciones habituales.

## 1. Acceso a la aplicacion

La app tiene dos entradas:

- Escritorio: `frontend/index.html`
- Movil: `frontend/mobile.html`

Ambas usan la misma API backend y el mismo modelo de datos, pero no exactamente la misma interfaz.

Comportamiento general:

- En escritorio existe flujo de login y registro.
- En movil existe login y uso de la app, pero no el flujo completo de registro.
- El backend detecta user-agent movil y puede redirigir a `/mobile`.

## 2. Registro y autenticacion

### Registro

El registro se hace desde la interfaz de escritorio.

Datos principales:

- nombre
- correo corporativo
- departamento
- contrasena

Reglas:

- solo se admiten correos `@fidamc.es`
- la contrasena debe tener al menos 6 caracteres
- el alta no se completa al instante

Proceso:

1. El usuario introduce sus datos.
2. El backend crea un registro temporal en `pending_registrations`.
3. Se genera un codigo de 6 digitos con caducidad de 15 minutos.
4. Se envia ese codigo por email.
5. El usuario introduce el codigo.
6. Si el codigo es correcto, el backend crea el usuario real en `users`.
7. Se devuelve un JWT y el usuario entra directamente en la aplicacion.

### Login

El login existe en escritorio y en movil.

Proceso:

1. El usuario introduce email y contrasena.
2. El backend valida credenciales.
3. Si la cuenta esta activa, devuelve un JWT.
4. El frontend guarda el token en `localStorage`.
5. La app carga la interfaz principal segun el rol del usuario.

## 3. Roles y permisos

Hay dos roles:

- `user`
- `admin`

### Usuario normal

Puede:

- iniciar sesion
- crear incidencias
- consultar el flujo normal que le corresponda en la interfaz

No puede:

- revisar pendientes
- editar incidencias como administrador
- gestionar usuarios
- gestionar categorias
- importar Excel

### Administrador

Puede ademas:

- revisar incidencias pendientes
- editar incidencias
- cambiar estado abierta/cerrada
- gestionar usuarios
- gestionar responsabilidades
- gestionar categorias por area
- importar incidencias desde Excel
- notificar al creador tras la revision

## 4. Flujo principal de usuario

El flujo estandar de un usuario normal es:

1. Iniciar sesion
2. Ir a `Nueva Incidencia`
3. Rellenar el formulario
4. Enviar la incidencia

### Campos que rellena el usuario

Bloque de identificacion:

- codigo de proyecto
- proceso
- fecha de deteccion
- detectado por
- departamento
- area
- programa

Bloque de descripcion:

- descripcion de la incidencia
- causas
- accion inmediata

Bloque de impacto:

- valoracion economica
- afecta al MA
- afecta al resultado
- observaciones en algunos flujos de edicion, no en el alta basica de escritorio

### Que ocurre al enviarla

Cuando el usuario envia la incidencia:

1. El backend valida los campos obligatorios.
2. Calcula responsables segun area, departamento y programa.
3. Crea la incidencia en base de datos.
4. Genera un identificador visible tipo `NC-0001`.
5. Guarda el log de correo en `email_log`.
6. Intenta enviar notificacion por email.

Estado inicial de la incidencia:

- `estado = 'Abierta'`
- `revisada = 0`

Importante:

- la categoria no la pone el usuario en el alta normal
- la incidencia todavia no entra en el circuito final de analitica

## 5. Flujo de revision del administrador

Las incidencias nuevas pasan al circuito de revision.

### Pantalla de pendientes

Los administradores ven una seccion `Pendientes`.

Ahi aparecen las incidencias con:

- `revisada = 0`

El admin abre una incidencia pendiente y completa o corrige sus datos.

### Que puede editar el admin

En la revision o edicion puede trabajar con:

- proyecto
- proceso
- fecha
- detectado por
- departamento
- area
- programa
- descripcion de programa
- categoria
- afecta al MA
- afecta al resultado
- descripcion
- causas
- accion inmediata
- accion correctora
- observaciones
- valoracion
- email destino

### Regla de categoria

La categoria:

- no es libre
- depende del area seleccionada
- se carga desde el catalogo de categorias por area

Si el admin intenta guardar una categoria que no pertenece a ese area, el backend la rechaza.

### Resultado de la revision

Cuando el admin guarda:

1. La incidencia se actualiza.
2. Si tiene categoria, queda marcada como `revisada = 1`.
3. Pasa a formar parte del circuito normal de consulta y dashboard.

Opcionalmente:

- el admin puede guardar y notificar al creador

En movil admin existen dos acciones diferenciadas:

- guardar revision
- guardar y notificar

## 6. Gestion de incidencias revisadas

Una vez revisada, la incidencia aparece en:

- listado de incidencias
- dashboard
- modal de detalle

El admin puede:

- volver a editarla
- cambiar su estado
- eliminarla

Estados disponibles actualmente:

- `Abierta`
- `Cerrada`

Cuando se cierra:

- se guarda `closed_at`
- se registra una traza en `nc_historial`

## 7. Importacion de incidencias desde Excel

La aplicacion incluye una pantalla especifica de importacion para administradores.

### Objetivo

Permite cargar incidencias historicas desde un Excel y validarlas antes de insertarlas.

### Flujo de importacion

1. El admin entra en `Importar Excel`.
2. Selecciona un archivo `.xlsx`, `.xls` o `.csv`.
3. La app envia el archivo al endpoint de preview.
4. El backend lee la primera hoja, detecta cabeceras y valida filas.
5. El frontend muestra:
   - filas leidas
   - filas validas
   - filas con errores
6. El admin confirma la importacion.
7. El frontend envia solo las filas validas.
8. El backend vuelve a validarlas y las inserta en transaccion.

### Reglas relevantes

- la importacion no exporta Excel; solo importa
- hay doble validacion: preview y commit
- `afecta_ma` y `afecta_resultado` se tratan como booleanos
- la categoria debe pertenecer al area
- las incidencias importadas quedan con `revisada = 1`
- por defecto se usa `Importacion Excel` como proceso y detectado por si esos datos no vienen en el fichero

## 8. Catalogos de la aplicacion

La app usa catalogos para varios campos:

- areas
- departamentos
- programas
- categorias por area

### Categorias por area

Las categorias ya no estan fijas en codigo como unico origen funcional.

Ahora:

- se guardan en la tabla `area_categorias`
- el admin puede gestionarlas desde la pantalla `Categorias`

Acciones permitidas:

- anadir categoria
- editar categoria
- eliminar o desactivar categoria segun implementacion actual

Impacto:

- escritorio y movil consumen el mismo catalogo
- la revision admin solo debe ofrecer categorias validas para el area elegida
- la importacion Excel valida contra estas categorias

### Areas, departamentos y programas

Estos catalogos tienen soporte en backend y frontend y ademas usan aliases para normalizar datos historicos o importados.

Esto es importante porque:

- la app corrige nombres antiguos
- la importacion Excel admite variantes de escritura

## 9. Gestion de usuarios y responsabilidades

El administrador puede gestionar:

- usuarios
- activacion y desactivacion
- rol admin o user
- responsabilidades

Tambien existen restricciones de seguridad:

- un admin no puede quitarse su propio rol
- un admin no puede desactivarse a si mismo
- no se puede dejar la app sin administradores activos

### Responsabilidades

Las responsabilidades se usan para decidir quien recibe notificaciones.

Cada usuario puede tener responsabilidades por:

- area
- departamento
- programa

Cuando se crea una incidencia, el sistema busca responsables que coincidan con esos valores.

Si no hay responsables especificos:

- se recurre a los administradores activos

## 10. Dashboard y consultas

Las incidencias revisadas alimentan:

- KPIs
- graficas
- filtros
- listados

### Regla base

El dashboard trabaja con incidencias revisadas:

- `revisada = 1`

### Filtros

En backend existen filtros por:

- area
- departamento
- programa
- ano
- mes

En el listado principal de incidencias se usan habitualmente:

- busqueda por texto
- estado
- departamento
- area
- categoria

## 11. Flujo movil

La version movil permite:

- login
- creacion de incidencias
- revision de pendientes si el usuario es admin

Comparte la misma API que escritorio:

- mismos endpoints
- mismo modelo de datos
- mismo catalogo de categorias por area

Diferencias relevantes:

- no replica exactamente toda la UX de escritorio
- tiene logica JS embebida dentro de `mobile.html`
- el admin puede revisar pendientes directamente desde pestañas moviles

## 12. Emails

La app puede enviar varios tipos de email:

- verificacion de registro
- nueva incidencia
- notificacion al creador tras revision o edicion

Si SMTP no esta configurado correctamente:

- el flujo funcional no deberia bloquearse
- el backend registra el intento y puede degradar el comportamiento a log en consola

## 13. Datos de prueba

La aplicacion dispone de un script de seed:

- `backend/db/seed.js`

Ese script genera datos de prueba coherentes con:

- areas actuales
- categorias validas por area
- estados
- valoraciones
- textos de ejemplo

## 14. Resumen del flujo general

Flujo corto:

1. Usuario se registra o inicia sesion.
2. Usuario crea una incidencia.
3. La incidencia queda abierta y pendiente de revision.
4. El admin revisa y asigna categoria segun el area.
5. La incidencia pasa a revisada.
6. Ya aparece en dashboard, consultas y estadisticas.
7. El admin puede cerrarla, editarla de nuevo o eliminarla.
8. De forma separada, un admin tambien puede importar incidencias historicas desde Excel.
