/**
 * Configuration locale du poste : accès MySQL et liaison série.
 *
 * Elle vit dans un fichier du dossier utilisateur, pas en base : le port COM
 * est propre à chaque machine, et l'application doit pouvoir se connecter
 * avant d'avoir une base.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { AppSettings, DbConfig } from '@shared/channels'

const EMPTY: AppSettings = { db: null, balance: null }

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown>
  } catch {
    return { ...EMPTY } // premier lancement, ou fichier illisible : repartir à vide
  }

  return {
    db: raw.db ? { ...(raw.db as DbConfig), password: decrypt((raw.db as DbConfig).password) } : null,
    balance: (raw.balance as AppSettings['balance']) ?? null
  }
}

export function saveSettings(settings: AppSettings): void {
  const onDisk: Record<string, unknown> = {
    balance: settings.balance,
    db: settings.db ? { ...settings.db, password: encrypt(settings.db.password) } : null
  }
  mkdirSync(dirname(settingsFile()), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(onDisk, null, 2), { encoding: 'utf8', mode: 0o600 })
}

/**
 * Le mot de passe MySQL ne doit pas traîner en clair dans un fichier lisible
 * par tout utilisateur de la machine. safeStorage s'appuie sur DPAPI (Windows).
 */
function encrypt(value: string): string {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) return `plain:${value}`
  return `enc:${safeStorage.encryptString(value).toString('base64')}`
}

function decrypt(value: unknown): string {
  const text = typeof value === 'string' ? value : ''
  if (text.startsWith('plain:')) return text.slice('plain:'.length)
  if (text.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(text.slice('enc:'.length), 'base64'))
    } catch {
      return '' // clé du système changée : le mot de passe doit être ressaisi
    }
  }
  return text
}
