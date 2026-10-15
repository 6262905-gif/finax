USE finax;

-- Pagos recurrentes mensuales (suscripciones, servicios, sueldo). ultimo_mes = último mes atendido (AAAA-MM)
CREATE TABLE IF NOT EXISTS recurrentes (
  id_recurrente INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL,
  id_categoria INT NOT NULL,
  tipo ENUM('gasto','ingreso') NOT NULL DEFAULT 'gasto',
  descripcion VARCHAR(50) NOT NULL,
  monto DECIMAL(10,2) NOT NULL CHECK (monto > 0),
  dia_mes TINYINT UNSIGNED NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_mes CHAR(7) NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;
