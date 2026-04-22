-- ============================================================
-- NC MANAGER — Esquema MySQL 8.x
-- ============================================================

-- La base de datos ya la crea Docker via MYSQL_DATABASE en docker-compose.yml
-- En local ejecuta primero: CREATE DATABASE nc_manager; USE nc_manager;

-- ============================================================
-- TABLA: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
                                     id          CHAR(36)        NOT NULL DEFAULT (UUID()),
    name        VARCHAR(120)    NOT NULL,
    email       VARCHAR(200)    NOT NULL UNIQUE,
    password    VARCHAR(255)    NOT NULL,
    role        ENUM('admin','user') NOT NULL DEFAULT 'user',
    department  VARCHAR(100)    DEFAULT NULL,
    active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
    ) ENGINE=InnoDB;

CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- TABLA: pending_registrations
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_registrations (
                                     temp_id        CHAR(36)        NOT NULL,
    name           VARCHAR(120)    NOT NULL,
    email          VARCHAR(200)    NOT NULL,
    password_hash  VARCHAR(255)    NOT NULL,
    department     VARCHAR(100)    DEFAULT NULL,
    code           CHAR(6)         NOT NULL,
    expires_at     DATETIME        NOT NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (temp_id),
    UNIQUE KEY uk_pending_email (email)
    ) ENGINE=InnoDB;

CREATE INDEX idx_pending_expires ON pending_registrations(expires_at);

-- ============================================================
-- TABLA: no_conformidades
-- ============================================================
CREATE TABLE IF NOT EXISTS no_conformidades (
                                                id                  VARCHAR(20)     NOT NULL,
    seq                 INT             NOT NULL AUTO_INCREMENT UNIQUE,
    codigo_proyecto     VARCHAR(100)    NOT NULL,
    proceso             VARCHAR(100)    NOT NULL,
    fecha_deteccion     DATE            NOT NULL,
    detectado_por       VARCHAR(150)    NOT NULL,
    departamento        VARCHAR(100)    NOT NULL,
    area                VARCHAR(50)     DEFAULT NULL,
    programa            VARCHAR(150)    DEFAULT NULL,
    categoria           VARCHAR(255)    DEFAULT NULL,
    prioridad           VARCHAR(20)     DEFAULT NULL,
    importada_excel     TINYINT(1)      NOT NULL DEFAULT 0,
    repetida_automatica TINYINT(1)      NOT NULL DEFAULT 0,
    programa_desc       VARCHAR(200)    DEFAULT NULL,
    afecta_ma           TINYINT(1)      NOT NULL DEFAULT 0,
    afecta_resultado    TINYINT(1)      NOT NULL DEFAULT 0,
    descripcion         TEXT            NOT NULL,
    causas              TEXT            DEFAULT NULL,
    accion_inmediata    TEXT            DEFAULT NULL,
    accion_correctora   TEXT            DEFAULT NULL,
    observaciones       TEXT            DEFAULT NULL,
    valoracion_euros    DECIMAL(12,2)   DEFAULT 0.00,
    estado              ENUM('Abierta','Cerrada') NOT NULL DEFAULT 'Abierta',
    revisada            TINYINT(1)      NOT NULL DEFAULT 0,
    email_destino       VARCHAR(200)    DEFAULT NULL,
    email_cc            VARCHAR(200)    DEFAULT NULL,
    email_remitente     VARCHAR(200)    DEFAULT NULL,
    creado_por          CHAR(36)        DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    closed_at           DATETIME        DEFAULT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (creado_por) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;

CREATE INDEX idx_nc_fecha     ON no_conformidades(fecha_deteccion);
CREATE INDEX idx_nc_estado    ON no_conformidades(estado);
CREATE INDEX idx_nc_revisada  ON no_conformidades(revisada);
CREATE INDEX idx_nc_area      ON no_conformidades(area);
CREATE INDEX idx_nc_dept      ON no_conformidades(departamento);
CREATE INDEX idx_nc_programa  ON no_conformidades(programa);
CREATE INDEX idx_nc_categoria ON no_conformidades(categoria);
CREATE INDEX idx_nc_prioridad ON no_conformidades(prioridad);
CREATE INDEX idx_nc_importada ON no_conformidades(importada_excel);
CREATE INDEX idx_nc_rep_auto  ON no_conformidades(repetida_automatica);
CREATE INDEX idx_nc_created   ON no_conformidades(created_at);

-- ============================================================
-- TABLA: area_categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS area_categorias (
                                               id          CHAR(36)      NOT NULL DEFAULT (UUID()),
    area        VARCHAR(80)    NOT NULL,
    nombre      VARCHAR(255)   NOT NULL,
    orden       INT            NOT NULL DEFAULT 0,
    activa      TINYINT(1)     NOT NULL DEFAULT 1,
    created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_area_categoria (area, nombre)
    ) ENGINE=InnoDB;

CREATE INDEX idx_area_categorias_area   ON area_categorias(area);
CREATE INDEX idx_area_categorias_activa ON area_categorias(activa);

-- ============================================================
-- TABLA: nc_repeticion_alertas
-- ============================================================
CREATE TABLE IF NOT EXISTS nc_repeticion_alertas (
                                                     id                 CHAR(36)      NOT NULL DEFAULT (UUID()),
    nc_id              VARCHAR(20)   NOT NULL,
    area               VARCHAR(80)   NOT NULL,
    categoria          VARCHAR(255)  NOT NULL,
    incidencias_total  INT           NOT NULL,
    ventana_dias       INT           NOT NULL,
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_repeticion_alerta_nc (nc_id),
    FOREIGN KEY (nc_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

-- ============================================================
-- TABLA: nc_historial
-- ============================================================
CREATE TABLE IF NOT EXISTS nc_historial (
                                            id           CHAR(36)    NOT NULL DEFAULT (UUID()),
    nc_id        VARCHAR(20) NOT NULL,
    campo        VARCHAR(50) NOT NULL,
    valor_antes  TEXT        DEFAULT NULL,
    valor_nuevo  TEXT        DEFAULT NULL,
    cambiado_por CHAR(36)    DEFAULT NULL,
    cambiado_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (nc_id)        REFERENCES no_conformidades(id) ON DELETE CASCADE,
    FOREIGN KEY (cambiado_por) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;

CREATE INDEX idx_hist_nc ON nc_historial(nc_id);

-- ============================================================
-- TABLA: email_log
-- ============================================================
CREATE TABLE IF NOT EXISTS email_log (
                                         id           CHAR(36)      NOT NULL DEFAULT (UUID()),
    nc_id        VARCHAR(20)   DEFAULT NULL,
    destinatario VARCHAR(200)  NOT NULL,
    cc           VARCHAR(200)  DEFAULT NULL,
    asunto       VARCHAR(300)  DEFAULT NULL,
    enviado      TINYINT(1)    NOT NULL DEFAULT 0,
    error_msg    TEXT          DEFAULT NULL,
    sent_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (nc_id) REFERENCES no_conformidades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

-- ============================================================
-- TABLA: user_responsabilidades
-- ============================================================
CREATE TABLE IF NOT EXISTS user_responsabilidades (
                                                      id        CHAR(36)     NOT NULL DEFAULT (UUID()),
    user_id   CHAR(36)     NOT NULL,
    tipo      ENUM('area','departamento','programa') NOT NULL,
    valor     VARCHAR(150) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;

CREATE INDEX idx_resp_user  ON user_responsabilidades(user_id);
CREATE INDEX idx_resp_tipo  ON user_responsabilidades(tipo);
CREATE INDEX idx_resp_valor ON user_responsabilidades(valor);
