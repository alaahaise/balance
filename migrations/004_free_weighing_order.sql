-- 004 — Plus de sens imposé aux pesées (BRUT/TARE).
--
-- Le camion peut arriver chargé ou à vide, et revenir peser s'il avait oublié de
-- le faire avant le chargement. Le sens n'est donc plus connu au moment de la
-- pesée : le brut est la plus haute des deux pesées, la tare la plus basse, le
-- net leur différence (calcul fait à la fermeture, voir `computeTicket`).
--
-- Les nouvelles lignes de `weighings` n'ont donc pas de `stage`. Les anciennes
-- gardent le leur : la trace existante n'est pas touchée.
ALTER TABLE weighings
  MODIFY stage ENUM('TARE','BRUT') NULL;
