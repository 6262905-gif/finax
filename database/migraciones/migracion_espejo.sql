-- Finax · "Mi mes en espejo": guarda lo que la persona se propone cada mes.
-- En la categoría 'ahorro' el monto es lo mínimo que quiere ahorrar; en una categoría de gasto es el máximo (0 = "nada").
USE finax;
CREATE TABLE IF NOT EXISTS intenciones (
  id_intencion INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario   INT NOT NULL,
  id_categoria INT NOT NULL,
  mes          CHAR(7) NOT NULL,                 -- AAAA-MM
  monto        DECIMAL(10,2) NOT NULL CHECK (monto >= 0),
  UNIQUE KEY uq_intencion (id_usuario, mes, id_categoria),
  FOREIGN KEY (id_usuario)   REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;
