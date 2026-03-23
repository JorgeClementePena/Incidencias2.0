# NC Manager — Gestión de No Conformidades

## Estructura del proyecto

```
nc-app/
├── backend/              # API Node.js + Express
│   ├── server.js
│   ├── db/
│   │   ├── schema.sql    # Esquema MySQL
│   │   └── db.js
│   ├── routes/           # auth, nc, dashboard, users
│   ├── middleware/        # JWT auth
│   ├── services/          # email
│   └── package.json
├── frontend/             # HTML/CSS/JS estático
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Opción A — Desarrollo local (sin Docker)

### Requisitos
- Node.js 18+
- MySQL 8 en local (MySQL Workbench)

### Pasos
1. Abre MySQL Workbench y ejecuta `backend/db/schema.sql`
2. Edita `backend/.env` con tu contraseña de MySQL
3. Arranca:
```bash
cd backend
npm install
npm run dev
```
4. Abre http://localhost:3000

---

## Opción B — Docker (local o servidor VPS)

### Requisitos
- Docker Desktop (Windows/Mac) o Docker Engine (Linux)

### Pasos

```bash
# 1. Clonar o descomprimir el proyecto
cd nc-app

# 2. Crear el .env
cp .env.example .env
# Editar .env con tus contraseñas y JWT_SECRET

# 3. Arrancar todo (app + MySQL)
docker compose up --build -d

# 4. Ver logs
docker compose logs -f

# 5. Abrir en el navegador
# http://localhost:3000
```

### Comandos útiles

```bash
docker compose ps           # ver estado de los contenedores
docker compose logs -f app  # logs solo de la app
docker compose logs -f db   # logs solo de MySQL
docker compose down         # parar todo
docker compose down -v      # parar + borrar base de datos
docker compose restart app  # reiniciar solo la app
```

### Actualizar la app en el servidor

```bash
git pull                        # o subir los archivos nuevos
docker compose up --build -d    # reconstruye solo lo que cambió
```

---

## Credenciales por defecto

- **Admin:** admin@empresa.com / admin123
- *(Se crea automáticamente al arrancar)*

---

## Variables de entorno (.env)

| Variable | Descripción | Ejemplo |
|---|---|---|
| APP_PORT | Puerto de la app | 3000 |
| DB_NAME | Nombre de la BD | nc_manager |
| DB_USER | Usuario MySQL | nc_user |
| DB_PASSWORD | Password MySQL | tu_password |
| DB_ROOT_PASSWORD | Password root MySQL | root_password |
| JWT_SECRET | Secreto para tokens | cadena larga aleatoria |
| SMTP_HOST | Servidor email (opcional) | smtp.gmail.com |
| SMTP_USER | Email remitente | tu@gmail.com |
| SMTP_PASS | Password SMTP | xxxx_xxxx |
