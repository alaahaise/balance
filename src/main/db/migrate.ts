/**
 * Application des migrations SQL.
 *
 * Chaque fichier n'est joué qu'une fois et son application est enregistrée dans
 * `schema_migrations` : rejouer un ALTER au démarrage casserait la base.
 */
import mysql, { type RowDataPacket } from 'mysql2/promise'
import type { DbConfig } from '@shared/channels'
import init001 from '../../../migrations/001_init.sql?raw'
import lines002 from '../../../migrations/002_operation_lines.sql?raw'
import manual003 from '../../../migrations/003_manual_and_redo.sql?raw'
import freeOrder004 from '../../../migrations/004_free_weighing_order.sql?raw'

const MIGRATIONS: ReadonlyArray<{ version: string; sql: string }> = [
  { version: '001_init', sql: init001 },
  { version: '002_operation_lines', sql: lines002 },
  { version: '003_manual_and_redo', sql: manual003 },
  { version: '004_free_weighing_order', sql: freeOrder004 }
]

export async function migrate(cfg: DbConfig): Promise<string[]> {
  // Connexion dédiée : multipleStatements n'est ouvert que pour les migrations,
  // jamais pour le trafic applicatif.
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
    multipleStatements: true
  })

  const applied: string[] = []
  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version VARCHAR(64) PRIMARY KEY,
         applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    )
    const [rows] = await conn.query<RowDataPacket[]>('SELECT version FROM schema_migrations')
    const done = new Set(rows.map((r) => String(r.version)))

    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue
      await conn.query(migration.sql)
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [migration.version])
      applied.push(migration.version)
    }
  } finally {
    await conn.end().catch(() => undefined)
  }

  return applied
}
