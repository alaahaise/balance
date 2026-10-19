-- 006 — Index de la liste des tickets (pagination).
--
-- Les listes (Tickets, 2e balance) filtrent par type et statut, bornent la date de
-- création et trient du plus récent au plus ancien :
--   WHERE type = ? AND status = ? AND created_at >= ? AND created_at < ?
--   ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
-- Cet index couvre le filtre ET le tri (InnoDB y ajoute `id`) : la base lit la
-- page demandée sans trier toute la table, et compte les lignes sans les lire.
-- Il remplace `ix_ops_type_date` (type, created_at) pour ces requêtes, mais on ne
-- l'enlève pas : une migration appliquée ne se défait pas.

CREATE INDEX ix_ops_type_status_date ON operations (type, status, created_at);
