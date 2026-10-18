/**
 * Pool MySQL unique du processus principal.
 *
 * Le renderer ne parle jamais à MySQL : il n'a ni les identifiants ni le
 * module. Tout passe par les handlers IPC.
 */
import mysql from 'mysql2/promise'
import type { DbConfig } from '@shared/channels'

let pool: mysql.Pool | null = null

export function isConnected(): boolean {
  return pool !== null
}

export function getPool(): mysql.Pool {
  if (!pool) throw new Error('Base de données non connectée : voir Paramètres')
  return pool
}

function options(cfg: DbConfig): mysql.PoolOptions {
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    // Un DECIMAL renvoyé en chaîne casse tous les calculs de poids en silence.
    decimalNumbers: true,
    // DATETIME renvoyé en Date serait réinterprété dans le fuseau du renderer :
    // les heures de pesée doivent rester celles inscrites en base.
    dateStrings: true
  }
}

/**
 * @param createDatabase créer la base si elle n'existe pas (premier lancement).
 */
export async function connect(cfg: DbConfig, createDatabase = false): Promise<void> {
  await disconnect()

  if (createDatabase) {
    // Connexion sans base : MySQL refuse `CREATE DATABASE` sur une base absente.
    const boot = await mysql.createConnection({ ...options(cfg), database: undefined })
    try {
      const name = cfg.database.replace(/`/g, '')
      await boot.query(
        `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      )
    } finally {
      await boot.end()
    }
  }

  const candidate = mysql.createPool(options(cfg))
  try {
    const conn = await candidate.getConnection()
    conn.release()
  } catch (err) {
    await candidate.end().catch(() => undefined)
    throw err
  }
  pool = candidate
}

export async function disconnect(): Promise<void> {
  if (!pool) return
  const current = pool
  pool = null
  await current.end().catch(() => undefined)
}
