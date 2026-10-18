/**
 * Authentification locale.
 *
 * scrypt de `node:crypto` : pas de dépendance native à recompiler, et un mot de
 * passe n'est jamais stocké en clair. Le sel est par utilisateur.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import type { SessionUser, UserRole } from '@shared/types'
import { getPool } from './db/pool'

const KEY_LEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(password, salt, KEY_LEN).toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const candidate = scryptSync(password, salt, KEY_LEN)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function login(username: string, password: string): Promise<SessionUser | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    'SELECT id, username, password_hash, full_name, role FROM users WHERE username = ? AND active = 1',
    [username]
  )
  const row = rows[0]
  if (!row) return null
  if (!verifyPassword(password, String(row.password_hash))) return null

  return {
    id: Number(row.id),
    username: String(row.username),
    fullName: String(row.full_name),
    role: row.role as UserRole
  }
}

/**
 * Crée le compte administrateur si la table users est vide.
 * Mot de passe : ADMIN_PASSWORD, sinon 'admin' — à changer dès la première
 * connexion (l'appelant doit afficher l'avertissement).
 */
export async function ensureAdmin(): Promise<string | null> {
  const pool = getPool()
  const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM users')
  if (Number(rows[0]?.n ?? 0) > 0) return null

  const password = process.env.ADMIN_PASSWORD || 'admin'
  await pool.query(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?,?,?,?)',
    ['admin', hashPassword(password), 'Administrateur', 'ADMIN']
  )
  return password
}
