-- =====================================================================
-- balance-management — schéma initial
--
-- Poids : DECIMAL(12,3) en kg (jamais FLOAT/DOUBLE — un flottant détruit
-- silencieusement les écarts). Montants : entier en unité mineure.
-- Moteur InnoDB, charset utf8mb4 (noms en arabe).
--
-- Ne jamais modifier ce fichier après application : ajouter 002_, 003_, ...
-- =====================================================================

-- ---------- Référentiels ----------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(160) NOT NULL,
  role          ENUM('ADMIN','SUPERVISEUR','OPERATEUR') NOT NULL DEFAULT 'OPERATEUR',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE locations (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code   VARCHAR(32)  NOT NULL,
  name   VARCHAR(160) NOT NULL,
  name_ar VARCHAR(160) NULL,
  type   ENUM('STOCK','UNITE','ZONE','EXTERNE') NOT NULL DEFAULT 'UNITE',
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_locations_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE partners (
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code    VARCHAR(32)  NOT NULL,
  name    VARCHAR(160) NOT NULL,
  type    ENUM('FOURNISSEUR','CLIENT','TIERS_LIBRE','TRANSPORTEUR') NOT NULL,
  nif     VARCHAR(32)  NULL,
  rc      VARCHAR(32)  NULL,
  phone   VARCHAR(32)  NULL,
  address VARCHAR(255) NULL,
  active  TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_partners_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code   VARCHAR(64)  NOT NULL,
  name   VARCHAR(160) NOT NULL,
  name_ar VARCHAR(160) NULL,
  unit   ENUM('KG','T','U') NOT NULL DEFAULT 'KG',
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_products_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vehicles (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plate        VARCHAR(32) NOT NULL,
  carrier_id   INT UNSIGNED NULL,
  last_tare    DECIMAL(12,3) NULL,
  last_tare_at DATETIME NULL,
  active       TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_vehicles_plate (plate),
  CONSTRAINT fk_vehicles_carrier FOREIGN KEY (carrier_id) REFERENCES partners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Configuration de la liaison série : elle vit dans un fichier local par poste
-- (settings.json), pas en base — le port COM est propre à chaque machine.

-- ---------- Cœur métier ----------
-- Un ticket = une opération. Entrée et sortie ne diffèrent que par le sens :
-- ENTREE  : 1re pesée BRUT  (camion chargé), 2e TARE (vide après déchargement)
-- SORTIE  : 1re pesée TARE  (vide avant chargement), 2e BRUT (chargé)
-- TRANSFERT/TIERS : idem SORTIE par défaut, l'opérateur peut forcer le sens.
-- net = brut - tare ; écart = net - poids supposé.
CREATE TABLE operations (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_no        VARCHAR(32) NOT NULL,
  type             ENUM('ENTREE','SORTIE','TRANSFERT','TIERS') NOT NULL,
  status           ENUM('OUVERTE','FERMEE','ANNULEE') NOT NULL DEFAULT 'OUVERTE',

  vehicle_id       INT UNSIGNED NULL,
  plate            VARCHAR(32)  NULL,           -- instantané à la création
  driver_name      VARCHAR(128) NULL,
  product_id       INT UNSIGNED NULL,
  product_code     VARCHAR(64)  NULL,           -- instantané
  partner_id       INT UNSIGNED NULL,
  partner_name     VARCHAR(160) NULL,           -- instantané
  location_from_id INT UNSIGNED NULL,           -- NULL = extérieur à la société
  location_to_id   INT UNSIGNED NULL,
  bl_no            VARCHAR(64)  NULL,
  bl_date          DATE         NULL,
  weight_supposed  DECIMAL(12,3) NULL,

  first_weigh_at   DATETIME      NULL,
  first_kind       ENUM('TARE','BRUT') NULL,
  first_weight     DECIMAL(12,3) NULL,
  second_weigh_at  DATETIME      NULL,
  second_kind      ENUM('TARE','BRUT') NULL,
  second_weight    DECIMAL(12,3) NULL,

  tare_weight      DECIMAL(12,3) NULL,
  gross_weight     DECIMAL(12,3) NULL,
  net_weight       DECIMAL(12,3) NULL,
  ecart            DECIMAL(12,3) NULL,
  ecart_ok         TINYINT(1)    NULL,

  notes            TEXT NULL,
  operator_id      INT UNSIGNED NOT NULL,
  closed_by        INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_by     INT UNSIGNED NULL,
  cancelled_at     DATETIME NULL,
  cancel_reason    VARCHAR(255) NULL,

  UNIQUE KEY uq_ops_ticket (ticket_no),
  KEY ix_ops_type_date (type, created_at),
  KEY ix_ops_status (status),
  KEY ix_ops_vehicle (vehicle_id),
  KEY ix_ops_bl (bl_no),
  KEY ix_ops_product_date (product_id, created_at),
  KEY ix_ops_plate (plate),
  CONSTRAINT fk_ops_vehicle  FOREIGN KEY (vehicle_id)  REFERENCES vehicles(id),
  CONSTRAINT fk_ops_product  FOREIGN KEY (product_id)  REFERENCES products(id),
  CONSTRAINT fk_ops_partner  FOREIGN KEY (partner_id)  REFERENCES partners(id),
  CONSTRAINT fk_ops_from     FOREIGN KEY (location_from_id) REFERENCES locations(id),
  CONSTRAINT fk_ops_to       FOREIGN KEY (location_to_id)   REFERENCES locations(id),
  CONSTRAINT fk_ops_operator FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Traçabilité : une ligne par capture réellement effectuée, avec la réponse
-- brute de la balance. C'est la preuve en cas de litige.
CREATE TABLE weighings (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operation_id BIGINT UNSIGNED NOT NULL,
  stage        ENUM('TARE','BRUT') NOT NULL,
  weight       DECIMAL(12,3) NOT NULL,
  captured_at  DATETIME(3) NOT NULL,
  is_manual    TINYINT(1) NOT NULL DEFAULT 0,
  stable_ms    INT NULL,
  raw_response VARCHAR(255) NULL,
  station      VARCHAR(64) NULL,                -- poste de pesée (nom de la machine)
  operator_id  INT UNSIGNED NOT NULL,
  KEY ix_weigh_op (operation_id),
  CONSTRAINT fk_weigh_op  FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_weigh_user FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Numérotation des tickets : allocation atomique côté serveur, sinon deux
-- postes de pesée produisent le même numéro.
CREATE TABLE counters (
  scope VARCHAR(32) NOT NULL,
  value INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  k VARCHAR(64) PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(64) NOT NULL,
  entity      VARCHAR(64) NOT NULL,
  entity_id   VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json  JSON NULL,
  at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_entity (entity, entity_id),
  KEY ix_audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- Stock ----------
-- Le stock n'est pas stocké : il se déduit des mouvements. Une colonne de
-- stock serait une seconde source de vérité qui dérive silencieusement.
CREATE OR REPLACE VIEW v_stock_moves AS
  SELECT o.id AS operation_id, o.ticket_no, o.type, o.product_id, o.product_code,
         o.location_to_id AS location_id, o.net_weight AS qty_in, 0 AS qty_out, o.created_at
    FROM operations o
   WHERE o.status = 'FERMEE' AND o.location_to_id IS NOT NULL
  UNION ALL
  SELECT o.id, o.ticket_no, o.type, o.product_id, o.product_code,
         o.location_from_id, 0, o.net_weight, o.created_at
    FROM operations o
   WHERE o.status = 'FERMEE' AND o.location_from_id IS NOT NULL;

-- ---------- Données de départ ----------
INSERT INTO locations (code, name, name_ar, type) VALUES
  ('STOCK',    'Stock central', 'المخزن المركزي', 'STOCK'),
  ('UNITE_A',  'Unité A',       'الوحدة أ',       'UNITE'),
  ('UNITE_B',  'Unité B',       'الوحدة ب',       'UNITE'),
  ('EXTERNE',  'Extérieur',     'خارج',           'EXTERNE');

INSERT INTO settings (k, v) VALUES
  ('company_name',          'Société'),
  ('ecart_tolerance_kg',    '20'),
  ('ticket_digits',         '6');
