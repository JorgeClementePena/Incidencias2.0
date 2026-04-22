# NC Manager

Aplicacion web para gestion de no conformidades, con frontend estatico y backend Node.js + Express sobre MySQL.

## Estructura

```text
incidencias2.1/
|-- backend/
|   |-- config/
|   |-- db/
|   |-- middleware/
|   |-- routes/
|   |-- services/
|   |-- package.json
|   `-- server.js
|-- frontend/
|-- Dockerfile
|-- docker-compose.yml
`-- .env.example
```

## Funcionalidad actual

- Alta de incidencias desde escritorio y movil.
- Revision admin de incidencias pendientes.
- Dashboard con metricas y filtros.
- Catalogos de categorias por area editables por admin.
- Importacion de incidencias desde Excel para admin.
- Notificaciones por email.
- Seed de datos de prueba.

## Requisitos

### Local sin Docker

- Node.js 18 o superior
- MySQL 8 disponible
- Una base de datos ya creada

### Docker

- Docker Desktop en Windows/Mac o Docker Engine en Linux

## Variables de entorno

La referencia base esta en [.env.example](/C:/Users/liopr/OneDrive/Escritorio/AppIncidencias/incidencias2.1/.env.example).

Variables principales:

- `APP_PORT`: puerto HTTP de la aplicacion.
- `DB_NAME`: nombre de la base de datos.
- `DB_USER`: usuario MySQL de la app.
- `DB_PASSWORD`: password del usuario MySQL.
- `DB_ROOT_PASSWORD`: password root de MySQL. Solo aplica si levantas MySQL con Docker.
- `JWT_SECRET`: secreto para JWT.
- `BOOTSTRAP_ADMIN_EMAIL`: email del admin inicial.
- `BOOTSTRAP_ADMIN_PASSWORD`: password del admin inicial.
- `BOOTSTRAP_ADMIN_NAME`: nombre del admin inicial.
- `BOOTSTRAP_ADMIN_DEPARTMENT`: departamento del admin inicial.
- `CORS_ORIGIN`: lista de origenes permitidos separada por comas.
- `SMTP_HOST`: servidor SMTP.
- `SMTP_PORT`: puerto SMTP.
- `SMTP_USER`: usuario SMTP. Puede quedar vacio si usas relay sin autenticacion.
- `SMTP_PASS`: password SMTP. Puede quedar vacio si usas relay sin autenticacion.
- `EMAIL_FROM`: remitente usado por la app.
- `RATE_LIMIT_MAX`: maximo de peticiones por ventana para `/api`.
- `RATE_LIMIT_WINDOW_MS`: duracion de la ventana del rate limit en milisegundos.

Notas:

- Si `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` estan vacios, no se crea admin inicial.
- Si `SMTP_HOST` no esta configurado o no conecta, los emails se simulan en consola.
- El backend soporta SMTP con autenticacion y relay sin autenticacion.

## Desarrollo local sin Docker

### 1. Crear la base de datos

El backend crea las tablas automaticamente al arrancar, pero la base debe existir antes.

Ejemplo:

```sql
CREATE DATABASE nc_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Configurar `backend/.env`

Crea o ajusta `backend/.env` con tus credenciales locales de MySQL y JWT.

Ejemplo minimo:

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nc_manager
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_password_mysql
JWT_SECRET=pon_un_valor_largo_y_aleatorio
```

Si quieres admin inicial:

```env
BOOTSTRAP_ADMIN_EMAIL=admin@tuempresa.com
BOOTSTRAP_ADMIN_PASSWORD=una_password_segura
BOOTSTRAP_ADMIN_NAME=Administrador
BOOTSTRAP_ADMIN_DEPARTMENT=Calidad
```

### 3. Instalar dependencias y arrancar

```bash
cd backend
npm install
npm run dev
```

La app queda accesible en `http://localhost:3000`.

## Docker

### Opcion A: app + MySQL dentro de Docker

Usa esta opcion si quieres levantar todo con el `docker-compose.yml` del proyecto.

### 1. Crear `.env` en la raiz

Parte de `.env.example`:

```bash
cp .env.example .env
```

Completa al menos:

```env
APP_PORT=3000
DB_NAME=nc_manager
DB_USER=nc_user
DB_PASSWORD=cambia_esta_password
DB_ROOT_PASSWORD=cambia_root_password
JWT_SECRET=pon_un_valor_largo_y_aleatorio
BOOTSTRAP_ADMIN_EMAIL=admin@tuempresa.com
BOOTSTRAP_ADMIN_PASSWORD=una_password_segura
BOOTSTRAP_ADMIN_NAME=Administrador
BOOTSTRAP_ADMIN_DEPARTMENT=Calidad
CORS_ORIGIN=https://tu-dominio.com
```

Importante:

- Con MySQL Docker, `DB_USER` debe ser un usuario normal como `nc_user`.
- No uses `DB_USER=root` si vas a inicializar el contenedor MySQL desde cero.

### 2. Arrancar

```bash
docker compose up --build -d
```

### 3. Comprobar estado

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
```

### 4. Acceso

- App: `http://localhost:3000` o tu dominio
- Admin: el definido en `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD`

### Opcion B: solo app en Docker contra MySQL externa

Si ya existe un MySQL corporativo o gestionado por otro equipo, lo normal es no levantar el servicio `db` del compose.

En ese caso:

- apunta `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` a la base externa
- usa el usuario que te hayan dado, incluso si es `root`
- no intentes recrear esa base con el contenedor MySQL del proyecto

## Inicializacion de esquema

El backend crea automaticamente las tablas y ajustes de runtime dentro de una base existente:

- `users`
- `pending_registrations`
- `no_conformidades`
- `area_categorias`
- `nc_historial`
- `email_log`
- `user_responsabilidades`

Ademas:

- crea el admin bootstrap si esta configurado
- inserta las categorias por area por defecto si faltan
- aplica ajustes de compatibilidad sobre datos antiguos

`backend/db/schema.sql` se mantiene como referencia y como apoyo para el contenedor MySQL, pero para local sin Docker no necesitas ejecutarlo manualmente si la base ya existe.

## Datos de prueba

Para cargar datos de prueba:

### Local sin Docker

```bash
cd backend
node db/seed.js
```

### Docker

```bash
docker compose exec app node backend/db/seed.js
```

## Importacion Excel

La importacion de Excel esta disponible para admin.

Resumen funcional:

- subida de archivo `.xlsx`
- previsualizacion antes de guardar
- validacion por fila
- categorias validadas contra el area
- `observaciones` guardadas en campo propio
- `afecta_ma` y `afecta_resultado` tratados como flags si/no
- si falta descripcion, se rellena automaticamente con un texto por defecto de importacion

## Email

El backend usa Nodemailer.

Soporta:

- SMTP con autenticacion
- relay sin autenticacion

Si `SMTP_HOST` no esta disponible, la app no se cae: deja el envio simulado en consola.

## Rate limit

El backend protege `/api` con `express-rate-limit`.

Comportamiento actual:

- en `production`: `300` peticiones por `15` minutos por defecto
- fuera de `production`: `5000` peticiones por `15` minutos por defecto

Se puede ajustar con:

```env
RATE_LIMIT_MAX=2000
RATE_LIMIT_WINDOW_MS=900000
```

## Comandos utiles de Docker

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f db
docker compose down
docker compose down -v
docker compose restart app
docker compose up --build -d
```

Notas:

- `docker compose down -v` borra el volumen MySQL del proyecto.
- No borra una base de datos externa fuera de Docker.

## Despliegue

Actualizacion tipica:

```bash
git pull
docker compose up --build -d
```

Si cambias dependencias del backend, como `multer` o `xlsx`, necesitas reconstruir la imagen.

## Observaciones

- El `healthcheck` actual de la app en `docker-compose.yml` apunta a `/api/auth/me`, que es una ruta protegida. Si quieres un despliegue mas robusto, conviene cambiarlo por una ruta publica de salud.
- El atributo `version` de `docker-compose.yml` es obsoleto y Docker ya lo ignora.
