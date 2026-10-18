-- 002 — Produits multiples par ticket (et ticket « primaire »).
--
-- Un ticket peut porter plusieurs produits (« 1 t de CMV X + 4 t de CMV Y ») :
-- le poids supposé est leur somme. La colonne unique `operations.product_code`
-- ne suffit plus, la liste passe donc dans `operation_lines`.
--
-- La quantité d'une ligne est le poids supposé de ce produit ; à la 2e pesée,
-- le poids net réel est réparti au prorata entre les lignes (voir la vue).

CREATE TABLE IF NOT EXISTS operation_lines (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operation_id BIGINT UNSIGNED NOT NULL,
  position     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  product_id   INT UNSIGNED NULL,
  product_code VARCHAR(64) NOT NULL,
  quantity_kg  DECIMAL(12,3) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_lines_op (operation_id),
  CONSTRAINT fk_lines_op      FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_lines_product FOREIGN KEY (product_id)   REFERENCES products(id),
  CONSTRAINT ck_lines_qty     CHECK (quantity_kg > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reprise du produit unique des tickets déjà saisis. Une ligne sans quantité
-- n'a pas de sens : on ne garde que celles qui en ont une.
INSERT INTO operation_lines (operation_id, position, product_id, product_code, quantity_kg)
SELECT id, 1, product_id, product_code, weight_supposed
  FROM operations
 WHERE product_code IS NOT NULL AND product_code <> ''
   AND weight_supposed IS NOT NULL AND weight_supposed > 0;

DROP VIEW IF EXISTS v_stock_moves;

ALTER TABLE operations
  DROP FOREIGN KEY fk_ops_product,
  DROP KEY ix_ops_product_date,
  DROP COLUMN product_id,
  DROP COLUMN product_code;

-- Stock par produit. `operations.net_weight` est le total réel : il est réparti
-- sur les lignes au prorata des quantités supposées, sinon un écart rendrait le
-- stock de chaque produit faux. Un ticket sans ligne ne bouge pas de stock.
CREATE OR REPLACE VIEW v_stock_moves AS
  SELECT o.id AS operation_id, o.ticket_no, o.type, l.product_code,
         o.location_to_id AS location_id,
         ROUND(o.net_weight * l.quantity_kg / t.total_kg, 3) AS qty_in,
         CAST(0 AS DECIMAL(12,3)) AS qty_out,
         o.created_at
    FROM operations o
    JOIN operation_lines l ON l.operation_id = o.id
    JOIN (SELECT operation_id, SUM(quantity_kg) AS total_kg
            FROM operation_lines GROUP BY operation_id) t ON t.operation_id = o.id
   WHERE o.status = 'FERMEE' AND o.location_to_id IS NOT NULL
  UNION ALL
  SELECT o.id, o.ticket_no, o.type, l.product_code,
         o.location_from_id,
         CAST(0 AS DECIMAL(12,3)),
         ROUND(o.net_weight * l.quantity_kg / t.total_kg, 3),
         o.created_at
    FROM operations o
    JOIN operation_lines l ON l.operation_id = o.id
    JOIN (SELECT operation_id, SUM(quantity_kg) AS total_kg
            FROM operation_lines GROUP BY operation_id) t ON t.operation_id = o.id
   WHERE o.status = 'FERMEE' AND o.location_from_id IS NOT NULL;
