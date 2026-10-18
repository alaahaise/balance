# Modèle métier — balance-management

Software for a company weighbridge driven by an EPELSA BL9000-class balance
(serial, COM port). This document defines the vocabulary, the data model, and the
real-time pipeline. It is the reference for the MySQL schema and the UI.

## 1. Vocabulary

Terms used by the operations staff, mapped to model names.

| Staff term | Model name | Meaning |
|---|---|---|
| matricule | `plate` / `vehicle_id` | Vehicle registration plate |
| matricule BL / N° BL | `bl_no` | Delivery note number from supplier or to customer |
| produit / code produit | `operation_lines.product_code` | Product (several lines per ticket) |
| data / date | `bl_date`, `created_at` | Document date vs. record date |
| heure 1ère tare | `first_weigh_at` + `first_kind = TARE` | Time of the first weighing |
| heure 2ème tare | `second_weigh_at` + `second_kind = TARE` | Time of the second weighing |
| poids supposé | `weight_supposed` | Sum of the declared product lines |
| poids balance | `gross_weight` / `net_weight` | Weight actually read from the balance |
| brut | `gross_weight` | Loaded weight |
| tare | `tare_weight` | Empty weight |
| écart | `ecart` | `net_weight - weight_supposed` (signed) |
| emplacement de dépose | `location_to_id` | stock central, unité A, unité B, ... |

## 2. The core concept: one ticket, two weighings

Entrées and sorties are the same operation with a different direction. Both use
the **double pesée** (two weighings), which is why both have a first and a second
time:

| Type | 1st weighing | 2nd weighing | net |
|---|---|---|---|
| **ENTREE** (réception) | BRUT (loaded truck) | TARE (empty, after unload) | brut − tare |
| **SORTIE** (expédition) | TARE (empty, before load) | BRUT (loaded) | brut − tare |
| **TRANSFERT** | as above, internal | move stock between locations | brut − tare |
| **TIERS** | TARE then BRUT, or single | external person weighing | brut − tare |

So there is **one** `operations` table with a `type` discriminator, not separate
entrée and sortie tables. Everything else follows from this: the ticket is created
at the **first** weighing — that is the *primary* ticket, printable on its own as
"bon de pesée n° 1". The second weighing computes net and écart, but the ticket
stays `OUVERTE` until the operator explicitly confirms (`status = FERMEE`). Only
then does it count in stock (`v_stock_moves` filters on `FERMEE`) and become the
*final* ticket. The confirmation is deliberate: a ticket whose second weighing
exists is finished but not yet committed.

The two weighings are two screens, and the workflow is deliberately split:

1. **1re balance** — the truck arrives: plate + driver, one capture. That creates
   the primary ticket and it can be printed immediately.
2. **2e balance** — the operator **picks** a ticket still waiting for its 2nd
   weighing from the list, completes the rest (products, partner, BL, locations),
   then captures the 2nd weight. The écart is computed against the product total,
   the operator confirms, and the final ticket prints.

Rules that matter for a company balance:

- `net_weight = gross_weight - tare_weight`, never negative — reject a capture
  that would make it negative.
- **Products are lines**, not one column: a truck may carry several products
  ("1 t of CMV X" + "4 t of CMV Y"). Each line has a product and a quantity, and
  `weight_supposed` is their sum. The écart compares net against that sum.
- `ecart = net_weight - weight_supposed`. If `|ecart| > tolerance` the ticket is
  flagged `ecart_ok = false` and needs supervisor validation before closing.
- The 2nd weighing **requires at least one product line**: without it there is no
  weight to compare against and no product to move in stock.
- Product lines are frozen once the 2nd weighing exists (the écart was computed
  against them); before that they can be replaced freely.
- A ticket is never deleted. Cancellation sets `status = ANNULEE` with a reason,
  an author, and a timestamp. Company weighing records are evidence.
- Descriptive fields (plate, partner, BL, notes, locations) can be corrected after
  the fact, and the correction is logged in `audit_log`. **Weights are not
  editable**: the `weighings` rows are the proof of what was actually weighed.
- Every capture is logged individually (`weighings` table) including the raw
  balance response, whether it was manual or automatic, and who did it.

## 3. Data model (MySQL)

Weights are `DECIMAL(12,3)` (kg with gram precision). **Never `FLOAT`** — floats
lose precision and silently corrupt écarts. Character set `utf8mb4` for Arabic
names. Engine InnoDB.

```sql
-- ---------- Référentiels ----------
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,           -- argon2id, hashed in main process
  full_name     VARCHAR(160) NOT NULL,
  role          ENUM('ADMIN','SUPERVISEUR','OPERATEUR') NOT NULL DEFAULT 'OPERATEUR',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE locations (                          -- stock central, unité A, unité B...
  id     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code   VARCHAR(32)  NOT NULL UNIQUE,
  name   VARCHAR(160) NOT NULL,
  type   ENUM('STOCK','UNITE','ZONE','EXTERNE') NOT NULL DEFAULT 'UNITE',
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE partners (                           -- fournisseurs, clients, tiers libres
  id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code    VARCHAR(32)  NOT NULL UNIQUE,
  name    VARCHAR(160) NOT NULL,
  type    ENUM('FOURNISSEUR','CLIENT','TIERS_LIBRE','TRANSPORTEUR') NOT NULL,
  nif     VARCHAR(32)  NULL,                      -- identifiants fiscaux locaux
  rc      VARCHAR(32)  NULL,
  phone   VARCHAR(32)  NULL,
  address VARCHAR(255) NULL,
  active  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE products (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code     VARCHAR(64)  NOT NULL UNIQUE,
  name     VARCHAR(160) NOT NULL,
  unit     ENUM('KG','T','U') NOT NULL DEFAULT 'KG',
  active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE vehicles (                           -- preference: remember last tare
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plate         VARCHAR(32) NOT NULL UNIQUE,
  carrier_id    INT UNSIGNED NULL,
  last_tare     DECIMAL(12,3) NULL,
  last_tare_at  DATETIME NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_vehicles_carrier FOREIGN KEY (carrier_id) REFERENCES partners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- La liaison série n'est pas en base : le port COM est propre à chaque poste,
-- et l'application doit pouvoir configurer sa balance avant d'avoir une base.
-- Configuration dans settings.json du dossier utilisateur (cf. src/main/settings.ts).

-- ---------- Cœur métier ----------
CREATE TABLE operations (                         -- entrée | sortie | transfert | tiers
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_no      VARCHAR(32) NOT NULL UNIQUE,     -- E-2026-000123
  type           ENUM('ENTREE','SORTIE','TRANSFERT','TIERS') NOT NULL,
  status         ENUM('OUVERTE','FERMEE','ANNULEE') NOT NULL DEFAULT 'OUVERTE',

  vehicle_id     INT UNSIGNED NULL,
  plate          VARCHAR(32)  NULL,               -- snapshot at creation
  driver_name    VARCHAR(128) NULL,
  partner_id     INT UNSIGNED NULL,               -- supplier | client | walk-in
  partner_name   VARCHAR(160) NULL,               -- snapshot
  location_from_id INT UNSIGNED NULL,             -- NULL = outside the company
  location_to_id   INT UNSIGNED NULL,
  bl_no          VARCHAR(64)  NULL,
  bl_date        DATE         NULL,
  weight_supposed DECIMAL(12,3) NULL,             -- sum of the product lines

  first_weigh_at  DATETIME      NULL,
  first_kind      ENUM('TARE','BRUT') NULL,
  first_weight    DECIMAL(12,3) NULL,
  second_weigh_at DATETIME      NULL,
  second_kind     ENUM('TARE','BRUT') NULL,
  second_weight   DECIMAL(12,3) NULL,

  tare_weight    DECIMAL(12,3) NULL,
  gross_weight   DECIMAL(12,3) NULL,
  net_weight     DECIMAL(12,3) NULL,
  ecart          DECIMAL(12,3) NULL,
  ecart_ok       TINYINT(1)    NULL,

  notes          TEXT NULL,
  operator_id    INT UNSIGNED NOT NULL,
  closed_by      INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_by   INT UNSIGNED NULL,
  cancelled_at   DATETIME NULL,
  cancel_reason  VARCHAR(255) NULL,

  KEY ix_ops_type_date (type, created_at),
  KEY ix_ops_status (status),
  KEY ix_ops_vehicle (vehicle_id),
  KEY ix_ops_bl (bl_no),
  CONSTRAINT fk_ops_vehicle  FOREIGN KEY (vehicle_id)  REFERENCES vehicles(id),
  CONSTRAINT fk_ops_partner  FOREIGN KEY (partner_id)  REFERENCES partners(id),
  CONSTRAINT fk_ops_from     FOREIGN KEY (location_from_id) REFERENCES locations(id),
  CONSTRAINT fk_ops_to       FOREIGN KEY (location_to_id)   REFERENCES locations(id),
  CONSTRAINT fk_ops_operator FOREIGN KEY (operator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE operation_lines (                    -- one product line per row
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operation_id BIGINT UNSIGNED NOT NULL,
  position     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  product_id   INT UNSIGNED NULL,
  product_code VARCHAR(64) NOT NULL,              -- snapshot, works without a référentiel
  quantity_kg  DECIMAL(12,3) NOT NULL,            -- déclared weight of this product
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_lines_op (operation_id),
  CONSTRAINT fk_lines_op      FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_lines_product FOREIGN KEY (product_id)   REFERENCES products(id),
  CONSTRAINT ck_lines_qty     CHECK (quantity_kg > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE weighings (                          -- audit trail, one row per capture
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  operation_id BIGINT UNSIGNED NOT NULL,
  stage        ENUM('TARE','BRUT') NOT NULL,
  weight       DECIMAL(12,3) NOT NULL,
  captured_at  DATETIME(3) NOT NULL,
  is_manual    TINYINT(1) NOT NULL DEFAULT 0,     -- operator override vs. auto-capture
  stable_ms    INT NULL,                          -- how long the weight was stable
  raw_response VARCHAR(255) NULL,                 -- exact bytes from the balance
  station      VARCHAR(64) NULL,                  -- which workstation captured it
  operator_id  INT UNSIGNED NOT NULL,
  KEY ix_weigh_op (operation_id),
  CONSTRAINT fk_weigh_op   FOREIGN KEY (operation_id) REFERENCES operations(id),
  CONSTRAINT fk_weigh_user FOREIGN KEY (operator_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE counters (                           -- ticket numbering, per type and year
  scope   VARCHAR(32) NOT NULL,                   -- E-2026
  value   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE settings (
  k VARCHAR(64) PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;          -- ecart_tolerance_kg, company name, ...

CREATE TABLE audit_log (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NULL,
  action     VARCHAR(64) NOT NULL,                -- CREATE / UPDATE / CANCEL / LOGIN
  entity     VARCHAR(64) NOT NULL,
  entity_id  VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json  JSON NULL,
  at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Stock

Stock is not stored, it is derived: an ENTREE adds to `location_to`, a SORTIE
removes from `location_from`, a TRANSFERT moves from `location_from` to
`location_to`. Stock per product per location is a query over `operations` where
`status = 'FERMEE'`, joining `operation_lines` for the product.

One net weight is shared by several products, so `v_stock_moves` splits it across
the lines **pro rata of the declared quantities**: a 1 t + 4 t declaration with a
4.8 t real net moves 0.96 t and 3.84 t. Using the declared quantities verbatim
would make stock wrong on every écart. A ticket without product lines moves no
stock — which is why the 2nd weighing refuses to happen without at least one.

This keeps the ledger single-source and auditable — a stored stock column is a
second source of truth that drifts.

## 4. Real-time balance pipeline

```
Balance ──serial(COM)──▶ SerialService (main process)
                            │  poll "$" or read stream
                            ▼
                        FrameParser ──▶ { weight, unit, stable? }
                            ▼
                        StabilityDetector (stable if |Δ| < ε for T ms)
                            ▼
                  coalescer: latest sample, flushed at 20 Hz
                            ▼
                        IPC broadcast ──▶ renderer live display
                            ▼
                  operator captures (auto on stable / button / footswitch)
                            ▼
                  INSERT weighing + UPDATE operation  (one transaction)
```

### The 1 ms problem

Polling "every ms" is not physically possible over a typical serial link, and it
would be harmful if it were:

- 9600 baud 8N1 carries **960 bytes/s** ≈ 10 bits per byte. An 18-byte frame
  (`ST,GS,+001234.5kg`) therefore takes ~19 ms. Max ≈ 53 frames/s.
- 1 ms per frame needs roughly **150 kbaud**. At 115200 baud you get ~1.5 ms per
  frame, which is where a "1 ms loop" reading comes from.
- A `setTimeout(..., 1)` loop in Node actually yields every 1–4 ms and is
  scheduled behind I/O, so the real rate is lower than it looks.

What actually matters is not sample rate but **when the weight stops changing**.
So:

- Read as fast as the port allows; never block the main process on it.
- **Coalesce for the UI**: send at most the latest sample every 50 ms (20 Hz).
  The eye cannot use more, and 1000 IPC messages/s will freeze a renderer.
- **Auto-capture on stability**: weight unchanged within ε (e.g. 0.5 kg or 2
  graduations) for T (e.g. 600 ms) → capture. That is the real "instant" the
  operator cares about, and it rejects the oscillation of a truck still rocking
  on the platform.

## 5. Screens

Shipped: a sidebar with one collapsible menu per weighing type; each expands to
**1re balance**, **2e balance** and **Tickets**.

1. **1re balance (per type)** — live weight (large), plate + driver + notes, one
   capture. Saving creates the *primary* ticket and offers **Imprimer le bon
   n° 1** / **Aperçu** immediately.
2. **2e balance (per type)** — lists tickets awaiting their 2nd weighing; picking
   one opens the completion form (products with quantities, partner, BL,
   locations, notes — **Enregistrer les informations**). The 2nd capture computes
   net + écart against the product total, then **Enregistrer → Confirmer** commits
   it and **Imprimer** prints the final ticket.
3. **Tickets (per type)** — list with a *Primaire / Final* badge, filters, search,
   correct descriptive fields, finalise a ticket left open, print, preview, cancel
   with a reason.
4. **Paramètres** — database, balance (COM/baud/protocole), tolerance, ticket
   digits, company name.

Planned, not built:

5. **Référentiels** — produits, tiers, véhicules, utilisateurs (currently free
   text on the ticket).
6. **Stock** — by product × location, movement history.
7. **Rapports** — journal de pesée, par produit, par emplacement, écarts hors
   tolérance, période.
8. **Impression** — silent printing to a named thermal printer, transfer slips,
   tiers receipts.

## 6. Architecture

- **MySQL is reached only from the main process** (`mysql2` pool). The renderer
  never sees a connection, a credential, or raw SQL — it calls typed IPC channels.
- Each weighing station runs one Electron app instance; all stations share one
  MySQL server on the LAN. The DB host/credentials are configured per workstation
  and stored with Electron `safeStorage`.
- Domain logic (net/écart computation, tolerance, ticket numbering) lives in
  `src/shared` as pure functions so it is unit-testable without Electron or MySQL.
- Serial port access is exclusive: only the main process opens the COM port.

## 7. Open questions

1. Does `poids CASM/balance` mean the weight captured on the balance (as I
   assumed), or a second, separate figure?
2. Is there an existing MySQL database/schema to fit into, or is this greenfield?
3. Are the walk-in "metal seller" weighings billed, and do they need a printed
   receipt?
4. Should the primary ticket be printable in Arabic too, or French only at the
   gate? (Currently both, per the language selector.)
5. Products are free text for now: do they want a produits référentiel with
   autocomplete, or is typing the name on each line enough?
