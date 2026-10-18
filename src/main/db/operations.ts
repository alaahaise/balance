/**
 * Dépôt des opérations de pesée.
 *
 * Règles portées ici, et pas ailleurs :
 *  - le numéro de ticket est alloué côté serveur (deux postes ne peuvent pas
 *    produire le même numéro) ;
 *  - la capture d'une pesée se fait sous verrou, sinon deux clics rapides
 *    écrivent deux fois la même pesée ;
 *  - une tare supérieure au brut est refusée (cf. computeTicket).
 */
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { CaptureInput, Location, OpFilter, OpUpdate } from '@shared/channels'
import { computeTicket, counterScope, formatTicketNo } from '@shared/domain/weighing'
import type {
  Operation,
  OperationType,
  ProductLine,
  SessionUser,
  TicketDraft,
  Weighing
} from '@shared/types'
import { getPool } from './pool'

const TOLERANCE_KEY = 'ecart_tolerance_kg'
const DIGITS_KEY = 'ticket_digits'

async function getSettingNumber(
  conn: PoolConnection,
  key: string,
  fallback: number
): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT v FROM settings WHERE k = ?', [key])
  const parsed = rows.length > 0 ? Number(rows[0].v) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Alloue le prochain numéro de la portée (type + année).
 * `LAST_INSERT_ID(expr)` fait que l'UPDATE renvoie la nouvelle valeur ; sur la
 * toute première ligne, l'INSERT n'a pas d'AUTO_INCREMENT et renvoie 0.
 */
async function allocateTicket(conn: PoolConnection, type: OperationType): Promise<string> {
  const year = new Date().getFullYear()
  const scope = counterScope(type, year)
  await conn.query(
    `INSERT INTO counters (scope, value) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)`,
    [scope]
  )
  const [rows] = await conn.query<RowDataPacket[]>('SELECT LAST_INSERT_ID() AS seq')
  const sequence = Number(rows[0]?.seq ?? 0) || 1
  return formatTicketNo(type, year, sequence, await getSettingNumber(conn, DIGITS_KEY, 6))
}

/** Crée le véhicule s'il est inconnu : c'est lui qui mémorise la dernière tare. */
async function ensureVehicle(conn: PoolConnection, plate?: string | null): Promise<number | null> {
  const clean = plate?.trim().toUpperCase()
  if (!clean) return null
  await conn.query(
    'INSERT INTO vehicles (plate) VALUES (?) ON DUPLICATE KEY UPDATE plate = plate',
    [clean]
  )
  const [rows] = await conn.query<RowDataPacket[]>('SELECT id FROM vehicles WHERE plate = ?', [
    clean
  ])
  return rows[0] ? Number(rows[0].id) : null
}

/**
 * Remplace la liste des produits d'un ticket (remplacement complet, pas de
 * fusion : l'écran envoie toujours la liste entière).
 * `undefined` = « ne touche pas aux lignes » ; `[]` = « efface les lignes ».
 */
async function replaceLines(
  conn: PoolConnection,
  operationId: number,
  lines: ProductLine[] | undefined
): Promise<void> {
  if (lines === undefined) return
  await conn.query('DELETE FROM operation_lines WHERE operation_id = ?', [operationId])
  let position = 1
  for (const line of lines) {
    await conn.query(
      `INSERT INTO operation_lines (operation_id, position, product_id, product_code, quantity_kg)
       VALUES (?,?,?,?,?)`,
      [operationId, position++, line.productId ?? null, line.productCode.trim(), line.quantityKg]
    )
  }
}

export async function create(draft: TicketDraft, user: SessionUser): Promise<Operation> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const ticketNo = await allocateTicket(conn, draft.type)
    const vehicleId = await ensureVehicle(conn, draft.plate)

    const [result] = await conn.query<ResultSetHeader>(
      `INSERT INTO operations
         (ticket_no, type, status, vehicle_id, plate, driver_name,
          partner_id, partner_name, location_from_id, location_to_id, bl_no, bl_date,
          notes, operator_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        ticketNo,
        draft.type,
        'OUVERTE',
        vehicleId,
        draft.plate?.trim().toUpperCase() || null,
        draft.driverName?.trim() || null,
        draft.partnerId ?? null,
        draft.partnerName?.trim() || null,
        draft.locationFromId ?? null,
        draft.locationToId ?? null,
        draft.blNo?.trim() || null,
        draft.blDate?.trim() || null,
        draft.notes?.trim() || null,
        user.id
      ]
    )

    await replaceLines(conn, result.insertId, draft.lines)

    await conn.commit()
    const created = await getById(result.insertId)
    if (!created) throw new Error('Ticket créé mais introuvable')
    return created
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Une ligne de la trace `weighings` : ce qui a réellement été pesé (ou saisi).
 * Pas de `stage` : le sens BRUT/TARE n'existe pas à la pesée, il se déduit des
 * deux poids (le plus haut est le brut).
 */
async function insertWeighing(
  conn: PoolConnection,
  input: CaptureInput,
  station: string,
  userId: number
): Promise<void> {
  await conn.query(
    `INSERT INTO weighings
       (operation_id, weight, captured_at, is_manual, stable_ms, raw_response, station, operator_id)
     VALUES (?,?,NOW(3),?,?,?,?,?)`,
    [
      input.operationId,
      input.weight,
      input.isManual ? 1 : 0,
      input.stableMs ?? null,
      input.raw ?? null,
      station,
      userId
    ]
  )
}

export async function capture(
  input: CaptureInput,
  user: SessionUser,
  station: string
): Promise<Operation> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()

    // FOR UPDATE : deux postes (ou deux clics) ne doivent pas écrire la même pesée.
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM operations WHERE id = ? FOR UPDATE',
      [input.operationId]
    )
    const row = rows[0]
    if (!row) throw new Error('Ticket introuvable')
    if (row.status !== 'OUVERTE') throw new Error('Ticket déjà fermé ou annulé')

    const hasFirst = row.first_weight != null
    if (hasFirst && row.second_weight != null) throw new Error('Les deux pesées sont déjà faites')

    // Enregistrées dans le même geste que la pesée : le total ci-dessous ne peut
    // pas être calculé sur une liste périmée restée à l'écran.
    await replaceLines(conn, input.operationId, input.lines)

    await insertWeighing(conn, input, station, user.id)

    // `stage` ne vient pas de l'appelant : uniquement 'first' ou 'second'.
    const stage = hasFirst ? 'second' : 'first'
    await conn.query(
      `UPDATE operations
          SET ${stage}_weight = ?, ${stage}_weigh_at = NOW(), ${stage}_manual = ?
        WHERE id = ?`,
      [input.weight, input.isManual ? 1 : 0, input.operationId]
    )

    if (hasFirst) {
      const first: Weighing = {
        weight: Number(row.first_weight),
        at: String(row.first_weigh_at)
      }
      const second: Weighing = {
        weight: input.weight,
        at: new Date().toISOString()
      }

      // Le poids supposé est la somme des lignes : sans produit déclaré, l'écart
      // ne veut rien dire et le stock ne saurait pas quel produit bouger.
      const [lineRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(quantity_kg), 0) AS total
           FROM operation_lines WHERE operation_id = ?`,
        [input.operationId]
      )
      if (Number(lineRows[0]?.n ?? 0) === 0) {
        throw new Error('Ajoutez au moins un produit avant la 2e pesée')
      }
      const weightSupposed = Number(lineRows[0]?.total ?? 0)

      const computed = computeTicket({
        first,
        second,
        weightSupposed,
        toleranceKg: await getSettingNumber(conn, TOLERANCE_KEY, 20)
      })

      if (!computed.ok) throw new Error(`Calcul du ticket impossible (${computed.reason})`)

      // Le ticket reste OUVERTE : l'opérateur doit confirmer l'enregistrement.
      // `v_stock_moves` ne compte que les tickets FERMEE, donc rien n'entre en
      // stock tant que ce n'est pas confirmé.
      await conn.query(
        `UPDATE operations
            SET tare_weight = ?, gross_weight = ?, net_weight = ?, ecart = ?, ecart_ok = ?,
                weight_supposed = ?
          WHERE id = ?`,
        [
          computed.tareWeight,
          computed.grossWeight,
          computed.netWeight,
          computed.ecart,
          computed.ecartOk == null ? null : computed.ecartOk ? 1 : 0,
          weightSupposed,
          input.operationId
        ]
      )

      if (row.vehicle_id != null) {
        await conn.query('UPDATE vehicles SET last_tare = ?, last_tare_at = NOW() WHERE id = ?', [
          computed.tareWeight,
          row.vehicle_id
        ])
      }
    }

    await conn.commit()
    const updated = await getById(input.operationId)
    if (!updated) throw new Error('Ticket introuvable après mise à jour')
    return updated
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

export async function cancel(id: number, reason: string, user: SessionUser): Promise<void> {
  const pool = getPool()
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE operations
        SET status = 'ANNULEE', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW()
      WHERE id = ? AND status <> 'ANNULEE'`,
    [reason, user.id, id]
  )
  if (result.affectedRows === 0) throw new Error('Ticket introuvable ou déjà annulé')

  await pool.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, after_json)
     VALUES (?,?,?,?,?)`,
    [user.id, 'CANCEL', 'operations', String(id), JSON.stringify({ reason })]
  )
}

/**
 * Enregistre le ticket (l'opérateur a confirmé). C'est ce passage à FERMEE qui
 * fait entrer/sortir la marchandise du stock.
 */
export async function close(id: number, user: SessionUser): Promise<Operation> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT status, second_weight FROM operations WHERE id = ? FOR UPDATE',
      [id]
    )
    const row = rows[0]
    if (!row) throw new Error('Ticket introuvable')
    if (row.status === 'ANNULEE') throw new Error('Ticket annulé : enregistrement impossible')
    if (row.status !== 'FERMEE' && row.second_weight == null) {
      throw new Error('Les deux pesées doivent être faites avant d’enregistrer')
    }
    if (row.status !== 'FERMEE') {
      await conn.query(`UPDATE operations SET status = 'FERMEE', closed_by = ? WHERE id = ?`, [
        user.id,
        id
      ])
    }
    await conn.commit()
    const updated = await getById(id)
    if (!updated) throw new Error('Ticket introuvable après enregistrement')
    return updated
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Correction des champs descriptifs. Les poids ne sont pas modifiables : la
 * table `weighings` est la trace de ce qui a été pesé.
 */
const UPDATABLE_COLUMNS: Record<keyof OpUpdate, string> = {
  plate: 'plate',
  driverName: 'driver_name',
  partnerName: 'partner_name',
  blNo: 'bl_no',
  blDate: 'bl_date',
  locationFromId: 'location_from_id',
  locationToId: 'location_to_id',
  notes: 'notes'
}

export async function update(id: number, patch: OpUpdate, user: SessionUser): Promise<Operation> {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [key, column] of Object.entries(UPDATABLE_COLUMNS)) {
    if (!(key in patch)) continue
    const value = patch[key as keyof OpUpdate] ?? null
    sets.push(`${column} = ?`) // nom de colonne issu d'une table blanche, jamais du renderer
    params.push(key === 'plate' && typeof value === 'string' ? value.toUpperCase() : value)
  }
  if (sets.length === 0) throw new Error('Aucune modification à enregistrer')

  params.push(id)
  const pool = getPool()
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE operations SET ${sets.join(', ')} WHERE id = ?`,
    params
  )
  if (result.affectedRows === 0) throw new Error('Ticket introuvable')

  await pool.query(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, after_json) VALUES (?,?,?,?,?)`,
    [user.id, 'UPDATE', 'operations', String(id), JSON.stringify(patch)]
  )

  const updated = await getById(id)
  if (!updated) throw new Error('Ticket introuvable après modification')
  return updated
}

/**
 * Refait la 1re pesée : le camion est repassé sur la balance (plein de
 * carburant, chargement ajouté…) et le premier poids ne vaut plus rien.
 *
 * L'ancienne pesée n'est ni supprimée ni modifiée : sa ligne de `weighings` est
 * marquée remplacée et l'opération tracée dans `audit_log` (avant/après). Seul
 * le poids « courant » du ticket change. Impossible une fois la 2e pesée faite :
 * le net serait déjà calculé sur l'ancien poids, il faut alors annuler le ticket.
 */
export async function redoFirst(
  input: CaptureInput,
  user: SessionUser,
  station: string
): Promise<Operation> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM operations WHERE id = ? FOR UPDATE',
      [input.operationId]
    )
    const row = rows[0]
    if (!row) throw new Error('Ticket introuvable')
    if (row.status !== 'OUVERTE') throw new Error('Ticket déjà fermé ou annulé')
    if (row.first_weight == null) throw new Error('Aucune 1re pesée à refaire')
    if (row.second_weight != null) {
      throw new Error('La 2e pesée est déjà faite : annulez le ticket pour recommencer')
    }

    const previous = {
      weight: Number(row.first_weight),
      at: String(row.first_weigh_at),
      isManual: Boolean(Number(row.first_manual ?? 0))
    }

    await conn.query(
      // Sans 2e pesée, la seule ligne encore active du ticket est la 1re.
      `UPDATE weighings SET superseded_at = NOW(3)
        WHERE operation_id = ? AND superseded_at IS NULL`,
      [input.operationId]
    )
    await insertWeighing(conn, input, station, user.id)
    await conn.query(
      'UPDATE operations SET first_weight = ?, first_weigh_at = NOW(), first_manual = ? WHERE id = ?',
      [input.weight, input.isManual ? 1 : 0, input.operationId]
    )
    await conn.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, before_json, after_json)
       VALUES (?,?,?,?,?,?)`,
      [
        user.id,
        'REDO_FIRST',
        'operations',
        String(input.operationId),
        JSON.stringify(previous),
        JSON.stringify({ weight: input.weight, isManual: input.isManual })
      ]
    )

    await conn.commit()
    const updated = await getById(input.operationId)
    if (!updated) throw new Error('Ticket introuvable après mise à jour')
    return updated
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Remplace les produits du ticket. Refusé une fois la 2e pesée faite : l'écart
 * a été calculé contre cette liste, la changer après coup le périmerait.
 */
export async function setLines(
  id: number,
  lines: ProductLine[],
  user: SessionUser
): Promise<Operation> {
  const conn = await getPool().getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT status, second_weight FROM operations WHERE id = ? FOR UPDATE',
      [id]
    )
    const row = rows[0]
    if (!row) throw new Error('Ticket introuvable')
    if (row.status === 'ANNULEE') throw new Error('Ticket annulé : produits figés')
    if (row.second_weight != null) throw new Error('Produits figés : la 2e pesée est déjà faite')

    await replaceLines(conn, id, lines)
    await conn.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, after_json) VALUES (?,?,?,?,?)`,
      [user.id, 'LINES', 'operations', String(id), JSON.stringify(lines)]
    )
    await conn.commit()

    const updated = await getById(id)
    if (!updated) throw new Error('Ticket introuvable après modification')
    return updated
  } catch (err) {
    await conn.rollback().catch(() => undefined)
    throw err
  } finally {
    conn.release()
  }
}

export async function getSetting(key: string): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT v FROM settings WHERE k = ?', [key])
  return rows[0] ? String(rows[0].v) : null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getPool().query(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [key, value]
  )
}

export async function list(filter: OpFilter): Promise<Operation[]> {
  const where: string[] = []
  const params: unknown[] = []

  if (filter.type) {
    where.push('o.type = ?')
    params.push(filter.type)
  }
  if (filter.status) {
    where.push('o.status = ?')
    params.push(filter.status)
  }
  if (filter.search) {
    where.push(
      `(o.ticket_no LIKE ? OR o.plate LIKE ? OR o.bl_no LIKE ? OR o.partner_name LIKE ?
        OR o.driver_name LIKE ?
        OR EXISTS (SELECT 1 FROM operation_lines l
                    WHERE l.operation_id = o.id AND l.product_code LIKE ?))`
    )
    const like = `%${filter.search}%`
    params.push(like, like, like, like, like, like)
  }

  // `limit` est un entier borné par opFilterSchema : interpolé, jamais concaténé brut.
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT o.*, u.full_name AS operator_name
       FROM operations o
       JOIN users u ON u.id = o.operator_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY o.id DESC
      LIMIT ${limit}`,
    params
  )
  return attachLines(rows.map(toOperation))
}

export async function getById(id: number): Promise<Operation | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT o.*, u.full_name AS operator_name
       FROM operations o
       JOIN users u ON u.id = o.operator_id
      WHERE o.id = ?`,
    [id]
  )
  if (!rows[0]) return null
  const [op] = await attachLines([toOperation(rows[0])])
  return op
}

/** Une requête pour toutes les lignes des tickets affichés (pas de N+1). */
async function attachLines(ops: Operation[]): Promise<Operation[]> {
  if (ops.length === 0) return ops
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT operation_id, product_id, product_code, quantity_kg
       FROM operation_lines
      WHERE operation_id IN (?)
      ORDER BY operation_id, position, id`,
    [ops.map((o) => o.id)]
  )
  const byOp = new Map<number, ProductLine[]>()
  for (const r of rows) {
    const key = Number(r.operation_id)
    const list = byOp.get(key) ?? []
    list.push({
      productId: r.product_id == null ? null : Number(r.product_id),
      productCode: String(r.product_code),
      quantityKg: Number(r.quantity_kg)
    })
    byOp.set(key, list)
  }
  for (const op of ops) op.lines = byOp.get(op.id) ?? []
  return ops
}

export async function listLocations(): Promise<Location[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    'SELECT id, code, name, name_ar, type FROM locations WHERE active = 1 ORDER BY code'
  )
  return rows.map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    nameAr: r.name_ar == null ? null : String(r.name_ar),
    type: String(r.type)
  }))
}

function toOperation(row: RowDataPacket): Operation {
  const type = row.type as OperationType
  const num = (value: unknown): number | null => (value == null ? null : Number(value))
  const weighing = (weight: unknown, at: unknown, manual: unknown): Weighing | null =>
    weight == null
      ? null
      : {
          weight: Number(weight),
          at: String(at),
          isManual: Boolean(Number(manual ?? 0))
        }

  return {
    id: Number(row.id),
    ticketNo: String(row.ticket_no),
    type,
    status: row.status,
    plate: row.plate ?? null,
    driverName: row.driver_name ?? null,
    partnerId: num(row.partner_id),
    partnerName: row.partner_name ?? null,
    locationFromId: num(row.location_from_id),
    locationToId: num(row.location_to_id),
    blNo: row.bl_no ?? null,
    blDate: row.bl_date ?? null,
    weightSupposed: num(row.weight_supposed),
    notes: row.notes ?? null,
    lines: [],
    first: weighing(row.first_weight, row.first_weigh_at, row.first_manual),
    second: weighing(row.second_weight, row.second_weigh_at, row.second_manual),
    tareWeight: num(row.tare_weight),
    grossWeight: num(row.gross_weight),
    netWeight: num(row.net_weight),
    ecart: num(row.ecart),
    ecartOk: row.ecart_ok == null ? null : Boolean(Number(row.ecart_ok)),
    operatorName: String(row.operator_name ?? ''),
    createdAt: String(row.created_at),
    cancelReason: row.cancel_reason ?? null
  }
}
