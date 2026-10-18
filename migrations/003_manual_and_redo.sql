-- 003 — Pesée manuelle visible sur le ticket, et 1re pesée refaite.
--
-- 1. `weighings.is_manual` existait déjà (la trace de chaque capture), mais le
--    ticket ne le savait pas : on le recopie sur l'opération, à côté du poids,
--    pour que l'écran et le ticket imprimé puissent afficher « M ».
-- 2. Quand le camion repasse sur la balance (par exemple après un plein de
--    carburant), la 1re pesée est refaite. L'ancienne ligne de `weighings` n'est
--    JAMAIS supprimée ni modifiée : elle est seulement marquée remplacée.

ALTER TABLE operations
  ADD COLUMN first_manual  TINYINT(1) NOT NULL DEFAULT 0 AFTER first_weigh_at,
  ADD COLUMN second_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER second_weigh_at;

-- Reprise des tickets existants : leur pesée manuelle est celle de la trace qui
-- porte le même sens (BRUT/TARE). La 1re et la 2e ont toujours des sens opposés.
UPDATE operations o
   SET o.first_manual  = EXISTS (SELECT 1 FROM weighings w
                                  WHERE w.operation_id = o.id AND w.is_manual = 1
                                    AND w.stage = o.first_kind),
       o.second_manual = EXISTS (SELECT 1 FROM weighings w
                                  WHERE w.operation_id = o.id AND w.is_manual = 1
                                    AND w.stage = o.second_kind)
 WHERE o.first_weight IS NOT NULL;

ALTER TABLE weighings
  ADD COLUMN superseded_at DATETIME(3) NULL AFTER operator_id;
