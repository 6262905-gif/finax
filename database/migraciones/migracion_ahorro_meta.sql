USE finax;

-- Cada abono de ahorro queda ligado a su meta; si se elimina la meta, sus abonos se eliminan
-- en cascada y ese dinero vuelve al saldo disponible.
ALTER TABLE movimientos
  ADD COLUMN id_meta INT NULL AFTER id_categoria,
  ADD CONSTRAINT fk_mov_meta FOREIGN KEY (id_meta) REFERENCES metas_ahorro(id_meta) ON DELETE CASCADE;

-- Enlaza los abonos que ya existían con su meta (por nombre)
UPDATE movimientos m
  JOIN metas_ahorro g ON g.id_usuario = m.id_usuario AND m.descripcion = LEFT(CONCAT('Ahorro: ', g.nombre), 50)
  SET m.id_meta = g.id_meta
  WHERE m.tipo = 'ahorro' AND m.id_meta IS NULL;
