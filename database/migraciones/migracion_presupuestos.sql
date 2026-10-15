USE finax;

-- Presupuesto mensual por categoría de gasto (límite en USD)
CREATE TABLE IF NOT EXISTS presupuestos (
  id_presupuesto INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_categoria INT NOT NULL,
  monto_limite DECIMAL(10,2) NOT NULL CHECK (monto_limite > 0),
  UNIQUE KEY uq_usuario_categoria (id_usuario, id_categoria),
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;
