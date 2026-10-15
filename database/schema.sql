-- ============================================================================
--  FINAX · Esquema completo de la base de datos (MySQL 8, InnoDB, utf8mb4)
--  Para una instalación nueva:  sudo mysql < database/schema.sql
-- ============================================================================
CREATE DATABASE IF NOT EXISTS finax CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finax;

-- Personas que usan la app. La contraseña se guarda siempre como hash (bcrypt), nunca en texto plano.
CREATE TABLE usuarios (
  id_usuario    INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(50)  NOT NULL,
  apellido      VARCHAR(50)  NOT NULL,
  correo        VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  telefono      VARCHAR(20)  NULL,
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Catálogo de categorías (comida, servicios, suscripciones, ...). tipo indica para qué se usa.
CREATE TABLE categorias (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  clave        VARCHAR(30) NOT NULL UNIQUE,
  nombre       VARCHAR(40) NOT NULL,
  tipo         ENUM('gasto','ingreso','ahorro') NOT NULL
) ENGINE=InnoDB;

INSERT INTO categorias (clave,nombre,tipo) VALUES
('comida','Comida','gasto'),('servicios','Servicios','gasto'),
('suscripciones','Suscripciones','gasto'),('transporte','Transporte','gasto'),
('salud','Salud','gasto'),('ocio','Ocio','gasto'),('otros','Otros','gasto'),
('ingreso','Ingreso','ingreso'),('ahorro','Ahorro','ahorro');

-- Metas de ahorro de cada usuario (con su avance).
CREATE TABLE metas_ahorro (
  id_meta        INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario     INT NOT NULL,
  nombre         VARCHAR(40) NOT NULL,
  emoji          VARCHAR(8)  NOT NULL DEFAULT '🎯',
  plazo          ENUM('corto','largo') NOT NULL DEFAULT 'corto',
  monto_objetivo DECIMAL(10,2) NOT NULL CHECK (monto_objetivo > 0),
  monto_ahorrado DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Todo el dinero que entra y sale: ingresos, gastos y abonos de ahorro.
-- Un abono (tipo 'ahorro') queda ligado a su meta; al eliminar la meta, el dinero vuelve al saldo.
CREATE TABLE movimientos (
  id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario    INT NOT NULL,
  id_categoria  INT NOT NULL,
  id_meta       INT NULL,
  tipo          ENUM('gasto','ingreso','ahorro') NOT NULL,
  monto         DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL,
  descripcion   VARCHAR(50) NOT NULL,
  FOREIGN KEY (id_usuario)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
  FOREIGN KEY (id_meta)      REFERENCES metas_ahorro(id_meta) ON DELETE CASCADE,
  INDEX (id_usuario, fecha)
) ENGINE=InnoDB;

-- Límite mensual de gasto por categoría (una fila por usuario y categoría).
CREATE TABLE presupuestos (
  id_presupuesto INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario     INT NOT NULL,
  id_categoria   INT NOT NULL,
  monto_limite   DECIMAL(10,2) NOT NULL CHECK (monto_limite > 0),
  UNIQUE KEY uq_usuario_categoria (id_usuario, id_categoria),
  FOREIGN KEY (id_usuario)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;

-- Pagos que se repiten cada mes (suscripciones, servicios, sueldo). ultimo_mes = último mes atendido (AAAA-MM).
CREATE TABLE recurrentes (
  id_recurrente INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario    INT NOT NULL,
  id_categoria  INT NOT NULL,
  tipo          ENUM('gasto','ingreso') NOT NULL DEFAULT 'gasto',
  descripcion   VARCHAR(50) NOT NULL,
  monto         DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  dia_mes       TINYINT UNSIGNED NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_mes    CHAR(7) NULL,
  FOREIGN KEY (id_usuario)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;

-- "Mi mes en espejo": lo que la persona se propone cada mes (una fila por usuario, mes y categoría).
-- En la categoría 'ahorro' es el mínimo que quiere ahorrar; en una categoría de gasto es el máximo (0 = "nada").
CREATE TABLE intenciones (
  id_intencion INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario   INT NOT NULL,
  id_categoria INT NOT NULL,
  mes          CHAR(7) NOT NULL,
  monto        DECIMAL(10,2) NOT NULL CHECK (monto >= 0),
  UNIQUE KEY uq_intencion (id_usuario, mes, id_categoria),
  FOREIGN KEY (id_usuario)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;

-- Lector QR / código de barras: catálogo de productos
CREATE TABLE IF NOT EXISTS productos (
  id_producto  INT AUTO_INCREMENT PRIMARY KEY,
  codigo       VARCHAR(64)  NOT NULL UNIQUE,        -- lo que lee la cámara o el lector USB
  nombre       VARCHAR(50)  NOT NULL,
  precio       DECIMAL(10,2) NOT NULL CHECK (precio > 0),
  id_categoria INT NOT NULL,
  creado_por   INT NULL,
  creado_en    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
  FOREIGN KEY (creado_por)   REFERENCES usuarios(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Productos de ejemplo (para la demostración)
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-001','Pupusas (3)',2.25,id_categoria FROM categorias WHERE clave='comida';
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-002','Café con pan',1.50,id_categoria FROM categorias WHERE clave='comida';
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-003','Pasaje de bus',0.25,id_categoria FROM categorias WHERE clave='transporte';
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-004','Recarga de celular',5.00,id_categoria FROM categorias WHERE clave='servicios';
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-005','Entrada al cine',4.50,id_categoria FROM categorias WHERE clave='ocio';
INSERT IGNORE INTO productos (codigo,nombre,precio,id_categoria) SELECT 'FINAX-006','Paracetamol',1.75,id_categoria FROM categorias WHERE clave='salud';
