-- FINAX · Lector QR / código de barras: catálogo de productos
-- Ejecutar una vez:  sudo mysql finax < migracion_productos.sql
USE finax;
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
