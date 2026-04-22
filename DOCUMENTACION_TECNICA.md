# Documentacion Tecnica de la Aplicacion

## 1. Objetivo de la aplicacion

Esta aplicacion gestiona no conformidades internas. Permite:

- registrar usuarios y autenticar acceso
- crear incidencias
- revisar incidencias pendientes
- clasificar incidencias por area, departamento, programa y categoria
- consultar listados y metricas
- importar incidencias historicas desde Excel
- enviar notificaciones por correo

El objetivo funcional es cubrir el flujo completo desde la deteccion de una incidencia hasta su revision, clasificacion y cierre.

## 2. Stack tecnologico

La aplicacion usa un stack simple y directo:

- Backend: Node.js + Express
- Base de datos: MySQL
- Frontend: HTML, CSS y JavaScript plano
- Autenticacion: JWT
- Correo: Nodemailer
- Importacion Excel: `xlsx` + `multer`
- Despliegue opcional: Docker + Docker Compose

No usa React, Vue, Angular, TypeScript, Bun ni ORM.

## 3. Estructura general del proyecto

### Raiz del proyecto

- [backend]: API, logica de negocio, acceso a datos y servicios.
- [frontend]: interfaz web de escritorio y movil.
- [Dockerfile]: construccion del contenedor de la aplicacion.
- [docker-compose.yml]: orquestacion de app + base de datos.
- [README.md]: instrucciones basicas de arranque.
- [FLUJO_APP.md]: flujo funcional desde el punto de vista de usuario.
- `.env` y `.env.example`: configuracion del entorno.

### Backend

- [backend/server.js]: punto de entrada.
- [backend/routes]: endpoints de la API.
- [backend/db]: conexion SQL, esquema y seed.
- [backend/middleware]: autenticacion/autorizacion.
- [backend/services]: servicios auxiliares como email e importacion Excel.
- [backend/config]: catalogos y aliases funcionales.

### Frontend

- [frontend/index.html]: interfaz principal de escritorio.
- [frontend/mobile.html]: interfaz movil.
- [frontend/js]: modulos JavaScript de UI.
- [frontend/styles/main.css]: estilos globales.
- [frontend/img]: assets visuales.

## 4. Arquitectura de alto nivel

La arquitectura es monolitica y esta dividida en dos capas principales:

- cliente web
- servidor API

Flujo normal:

1. El navegador carga `index.html` o `mobile.html`.
2. Los modulos JS del frontend realizan peticiones HTTP a `/api/...`.
3. Express procesa la peticion, aplica middleware y ejecuta la ruta correspondiente.
4. La ruta consulta o modifica MySQL.
5. El backend responde en JSON.
6. El frontend actualiza la interfaz con los datos recibidos.

No hay una capa separada de servicios de dominio compleja, pero hay cierta separacion entre:

- rutas
- acceso a BD
- servicios auxiliares
- configuracion de catalogos

## 5. Backend en detalle

### 5.1 Punto de entrada

Archivo principal: [backend/server.js](C:/Users/liopr/OneDrive/Escritorio/AppIncidencias/incidencias2.1/backend/server.js)

Responsabilidades principales:

- cargar variables de entorno
- crear la app Express
- aplicar seguridad basica con `helmet`
- configurar CORS
- parsear JSON y formularios
- aplicar rate limit sobre `/api`
- registrar las rutas
- servir el frontend estatico
- redirigir a `mobile.html` si detecta user-agent movil
- ejecutar migraciones ligeras en arranque con `ensureRuntimeSchema()`
- crear un admin bootstrap si se configura por entorno

### 5.2 Esquema de base de datos

El esquema vive en [backend/db/schema.sql], pero ademas el servidor aplica ajustes runtime al arrancar.

Tablas principales:

- `users`: usuarios activos del sistema.
- `pending_registrations`: registros pendientes de verificar por codigo.
- `no_conformidades`: entidad principal de negocio.
- `area_categorias`: catalogo dinamico de categorias por area.
- `nc_historial`: historial basico de cambios.
- `email_log`: trazabilidad de envios de correo.
- `user_responsabilidades`: asignacion de responsables por area, departamento o programa.

### 5.3 Acceso a base de datos

Archivo clave: [backend/db/db.js]

Este modulo centraliza:

- pool de conexiones MySQL
- helper `query(...)`
- helper `getClient()` para transacciones

No existe ORM. Toda la persistencia se hace con SQL manual.

### 5.4 Middleware de seguridad

Archivo clave: [backend/middleware/auth.js]

Funciones principales:

- generar JWT
- validar JWT en peticiones autenticadas
- bloquear rutas si el usuario no esta autenticado
- bloquear rutas si el usuario no es admin

Modelo de permisos:

- `user`: puede crear incidencias y acceder a su flujo normal
- `admin`: puede revisar pendientes, editar, gestionar usuarios, catalogos e importar Excel

### 5.5 Rutas de la API

#### Auth

Archivo: [backend/routes/auth.js]

Gestiona:

- login
- solicitud de registro
- verificacion por codigo

Observacion:

- el dominio de correo corporativo esta validado en backend
- el alta no es inmediata; pasa por `pending_registrations`

#### No conformidades

Archivo: [backend/routes/nc.js]

Es la ruta mas importante del sistema. Gestiona:

- listado con filtros
- detalle por ID
- alta de nueva incidencia
- actualizacion por admin
- cambio de estado abierta/cerrada
- borrado
- preview y commit de importacion Excel

Detalles clave:

- las incidencias creadas por usuario entran con `revisada = 0`
- las incidencias importadas desde Excel entran ya con `revisada = 1`
- el ID visible de negocio sigue el patron `NC-0001`, `NC-0002`, etc.
- la asignacion de destinatarios se calcula por responsabilidades

#### Dashboard

Archivo: [backend/routes/dashboard.js]

Responsable de:

- KPIs
- agregados
- consultas resumidas para paneles y graficas

Trabaja solo con incidencias revisadas, porque son las que representan datos consolidados.

#### Usuarios

Archivo: [backend/routes/users.js]

Gestiona:

- listado de usuarios
- activacion/desactivacion
- cambio de rol
- responsabilidades

Esta ruta impacta directamente en la logica de notificaciones.

#### Catalogos

Archivo: [backend/routes/catalogos.js]

Proporciona:

- areas
- departamentos
- programas
- categorias por area

Parte de estos catalogos es fija en codigo y parte es dinamica en BD.

### 5.6 Servicios auxiliares

#### Servicio de email

Archivo: [backend/services/email.js]

Responsabilidades:

- componer HTML de emails
- enviar notificacion de nueva incidencia
- enviar notificacion tras revision o edicion
- soportar modo degradado si SMTP no esta configurado

El flujo funcional no depende estrictamente del envio real de correo; el sistema puede seguir funcionando aunque el correo falle.

#### Servicio de importacion Excel

Archivo: [backend/services/ncImport.js]

Responsabilidades:

- leer un Excel desde buffer
- detectar cabeceras
- mapear alias de columnas
- normalizar fechas, booleanos y valoraciones
- validar filas
- generar objetos listos para persistir

No exporta Excel. El proyecto implementa importacion desde Excel, no exportacion.

### 5.7 Catalogos y aliases

Archivo clave: [backend/config/catalogos.js]

Este archivo define:

- listas base de areas
- listas base de departamentos
- listas base de programas
- aliases para normalizar valores
- categorias por defecto

Es importante porque:

- la importacion Excel depende de estos aliases
- el arranque del servidor usa estos aliases para corregir datos historicos
- varios selects del frontend toman estos valores como fallback

## 6. Frontend en detalle

El frontend no usa framework. La aplicacion se organiza por modulos JavaScript autocontenidos.

### 6.1 Paginas principales

- [frontend/index.html]: escritorio
- [frontend/mobile.html]: movil

Ambas interfaces usan la misma API, pero no comparten exactamente el mismo codigo fuente. `mobile.html` contiene bastante logica embebida propia.

Esto es un punto importante de mantenimiento: escritorio y movil comparten modelo de negocio, pero no comparten completamente los mismos modulos de UI.

### 6.2 Modulos JavaScript de escritorio

#### API

Archivo: [frontend/js/api.js]

Centraliza llamadas a la API y añade el token cuando corresponde.

#### App

Archivo: [frontend/js/app.js]

Responsabilidades:

- inicializacion global
- enrutado interno por secciones
- coordinacion entre modulos

Es el punto de union de la SPA ligera que monta el escritorio.

#### Auth

Archivo: [frontend/js/auth.js]

Gestiona:

- login
- persistencia del JWT en `localStorage`
- estado del usuario actual

#### Formulario de incidencias

Archivo: [frontend/js/form.js]

Responsable de:

- limpiar y rellenar el formulario inicial
- recoger los valores
- enviar una nueva incidencia

#### Incidencias

Archivo: [frontend/js/incidencias.js]

Responsable de:

- cargar listados
- aplicar filtros
- abrir modal detalle
- abrir modal de edicion
- actualizar incidencias

#### Pendientes

Archivo: [frontend/js/pendientes.js]

Gestiona el circuito de revision de incidencias aun no revisadas.

#### Usuarios

Archivo: [frontend/js/usuarios.js]

Gestion de usuarios y responsabilidades desde el panel admin.

#### Catalogos

Archivo: [frontend/js/catalogos.js]

Se encarga de:

- cargar catalogos desde backend
- rellenar selects del formulario, filtros y modales
- mantener fallback local si la API aun no ha respondido

#### Dashboard

Archivo: [frontend/js/dashboard.js]

Consume los endpoints de dashboard y presenta indicadores.

#### Importacion

Archivo: [frontend/js/importacion.js]

Responsable de:

- subir el archivo
- pedir previsualizacion
- renderizar errores y resumen
- lanzar la importacion final

### 6.3 Version movil

Archivo principal: [frontend/mobile.html]

La version movil:

- comparte endpoints con escritorio
- implementa un flujo adaptado
- incluye codigo JS directamente en el HTML

Riesgo tecnico:

- si se cambia la logica o campos de escritorio, hay que revisar tambien movil
- no existe una capa compartida fuerte entre ambas vistas

## 7. Flujo de negocio principal

### 7.1 Alta de incidencia por usuario

1. El usuario inicia sesion.
2. Rellena el formulario.
3. El frontend envia la incidencia a `POST /api/nc`.
4. El backend valida campos obligatorios.
5. Se calcula a quien notificar segun responsabilidades.
6. Se crea el registro en `no_conformidades`.
7. Se genera un ID visible tipo `NC-0001`.
8. Se registra el email en `email_log`.
9. Se intenta enviar correo.

Estado resultante:

- `estado = 'Abierta'`
- `revisada = 0`

### 7.2 Revision por admin

1. El admin entra en pendientes.
2. Carga incidencias con `revisada = 0`.
3. Edita y completa datos, especialmente categoria.
4. El backend valida que la categoria pertenezca al area.
5. Si se guarda con categoria, se marca `revisada = 1`.
6. La incidencia pasa a los listados y al dashboard normal.

### 7.3 Cierre de incidencia

1. El admin cambia el estado a `Cerrada`.
2. Se actualiza `closed_at`.
3. Se guarda traza en `nc_historial`.

### 7.4 Importacion Excel

Flujo tecnico:

1. El admin selecciona un archivo desde la pantalla de importacion.
2. El frontend lo envia a `POST /api/nc/import/preview`.
3. El backend parsea el archivo con `xlsx`.
4. Se mapean columnas y se validan filas.
5. El frontend muestra filas validas e invalidas.
6. El usuario confirma la importacion.
7. El frontend envia solo filas validas a `POST /api/nc/import/commit`.
8. El backend vuelve a validar, abre transaccion y crea las NC.

Aspectos importantes:

- hay doble validacion, en preview y en commit
- la importacion no confia en la vista previa del cliente
- las incidencias importadas quedan como revisadas

## 8. Modelo de datos y reglas de negocio relevantes

### 8.1 Entidad `no_conformidades`

Campos especialmente relevantes:

- `id`: identificador visible
- `seq`: autoincrement interno usado para construir el ID visible
- `codigo_proyecto`
- `proceso`
- `fecha_deteccion`
- `detectado_por`
- `departamento`
- `area`
- `programa`
- `categoria`
- `afecta_ma`
- `afecta_resultado`
- `descripcion`
- `causas`
- `accion_inmediata`
- `accion_correctora`
- `observaciones`
- `valoracion_euros`
- `estado`
- `revisada`

### 8.2 Reglas importantes

- Una incidencia sin revisar no debe entrar en analitica final.
- La categoria depende del area.
- `afecta_resultado` ya no es texto libre; es booleano.
- Los responsables se calculan por coincidencia en area, departamento y programa.
- Si no hay responsables especificos, se recurre a admins.

## 9. Configuracion y arranque

### Variables de entorno principales

- `APP_PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_DEPARTMENT`

### Arranque local

Proceso habitual:

1. instalar dependencias en `backend`
2. configurar `.env`
3. arrancar `npm run dev`
4. acceder por navegador a `http://localhost:3000`

### Arranque con Docker

El `Dockerfile` empaqueta la app y `docker-compose.yml` levanta al menos:

- el contenedor de la app
- el contenedor de MySQL

## 10. Migraciones y mantenimiento de datos

La app no usa una herramienta formal de migraciones.

En su lugar:

- existe [backend/db/schema.sql]
- y ademas [backend/server.js] ejecuta cambios compatibles al arrancar

Ejemplos de mantenimiento runtime:

- convertir `afecta_resultado` a booleano
- anadir columna `observaciones`
- normalizar areas y departamentos historicos usando aliases
- inicializar `area_categorias` si esta vacia

Ventaja:

- simplifica despliegues pequenos

Riesgo:

- el codigo de arranque mezcla runtime con mantenimiento de esquema
- si el proyecto crece, convendria migrar a un sistema formal de migraciones

## 11. Puntos sensibles para otro programador

### Duplicidad entre escritorio y movil

El flujo movil no reutiliza completamente los modulos del escritorio. Antes de cambiar formularios o reglas:

- revisar `frontend/index.html`
- revisar `frontend/js/*`
- revisar `frontend/mobile.html`

### Catalogos repartidos entre codigo y base de datos

- areas, departamentos y programas tienen parte fija en codigo
- categorias se gestionan en BD
- el importador Excel usa aliases definidos en codigo

Si se renombra un valor funcional, hay que validar:

- backend/config/catalogos.js
- datos existentes en BD
- filtros frontend
- importacion Excel
- responsabilidades de usuarios

### Migraciones en arranque

Cambiar `ensureRuntimeSchema()` requiere cuidado porque impacta datos reales en cada inicio.

### Ausencia de tests automatizados

No se aprecia una suite de tests en el repositorio. Los cambios delicados deberian comprobarse manualmente sobre:

- login y registro
- alta de incidencia
- revision admin
- filtros y dashboard
- importacion Excel
- flujo movil

## 12. Recomendaciones de evolucion tecnica

Estas mejoras no son obligatorias para operar la app, pero ayudarian a largo plazo:

- separar migraciones de base de datos en una herramienta dedicada
- extraer la logica JS embebida de `mobile.html` a modulos reutilizables
- anadir tests de API para auth, NC, catalogos e importacion
- centralizar constantes de catalogos y validaciones para evitar divergencias
- documentar contratos JSON de los endpoints principales
- anadir logs mas estructurados para errores de negocio y correo

## 13. Resumen ejecutivo para mantenimiento

Si otro programador entra al proyecto por primera vez, el orden recomendado para entenderlo es:

1. leer [README.md]
2. leer [FLUJO_APP.md]
3. revisar [backend/server.js]
4. revisar [backend/routes/nc.js]
5. revisar [backend/db/schema.sql]
6. revisar [frontend/js/app.js]
7. revisar [frontend/js/form.js], [frontend/js/incidencias.js] y [frontend/mobile.html]
8. revisar [backend/services/ncImport.js] si va a tocar importaciones

Con ese recorrido se entiende la mayor parte del sistema sin necesidad de leer todos los archivos desde el principio.
