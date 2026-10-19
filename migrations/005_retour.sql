-- 005 — Cas « retour ».
--
-- Un retour est une entrée ou une sortie ordinaire (la marchandise bouge dans le
-- même sens, donc `v_stock_moves` n'a pas à changer) mais l'opérateur doit le
-- distinguer :
--   ENTREE + retour : marchandise vendue qui revient d'un client ;
--   SORTIE + retour : marchandise achetée renvoyée au fournisseur (ex. un CMV).
-- Le drapeau est affiché sur l'écran, la liste et le ticket imprimé.

ALTER TABLE operations
  ADD COLUMN is_retour TINYINT(1) NOT NULL DEFAULT 0 AFTER type;
