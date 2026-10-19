/**
 * Handlers IPC : la seule porte entre le renderer et le système.
 *
 * Tout ce qui entre est validé par zod, et toute action métier exige une
 * session ouverte. Le renderer n'obtient jamais l'objet mysql ni le port série.
 */
import os from 'node:os'
import { BrowserWindow, ipcMain } from 'electron'
import type { ZodType } from 'zod'
import { CH, type AppStatus, type Result } from '@shared/channels'
import {
  balanceConfigSchema,
  cancelSchema,
  captureSchema,
  companySchema,
  dbConfigSchema,
  langSchema,
  loginSchema,
  opCloseSchema,
  opFilterSchema,
  opLinesSchema,
  opPageSchema,
  opUpdateSchema,
  simWeightSchema,
  ticketDraftSchema
} from '@shared/schemas'
import type { SessionUser } from '@shared/types'
import * as auth from './auth'
import { migrate } from './db/migrate'
import * as operations from './db/operations'
import * as pool from './db/pool'
import { printHtml } from './printer'
import { balance, listPorts } from './serial/service'
import { loadSettings, saveSettings } from './settings'
import { buildTicketHtml } from './ticket-html'

let session: SessionUser | null = null

function parse<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || 'valeur'} : ${i.message}`)
      .join(' · ')
    throw new Error(`Données invalides (${detail})`)
  }
  return result.data
}

function requireUser(): SessionUser {
  if (!session) throw new Error('Session expirée : reconnectez-vous')
  return session
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

async function tryConnect(create: boolean): Promise<Result> {
  const settings = loadSettings()
  if (!settings.db) return { ok: false, message: 'Aucune base configurée' }
  try {
    await pool.connect(settings.db, create)
    return { ok: true, message: `Connecté à ${settings.db.database}@${settings.db.host}` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function registerIpc(): void {
  // ---- Configuration du poste ----
  ipcMain.handle(CH.settingsGet, () => loadSettings())

  ipcMain.handle(CH.settingsSaveDb, async (_e, raw): Promise<Result> => {
    const cfg = parse(dbConfigSchema, raw)
    saveSettings({ ...loadSettings(), db: cfg })
    const result = await tryConnect(true)
    if (result.ok) broadcast(CH.appStatus, await appStatus())
    return result
  })

  ipcMain.handle(CH.settingsSaveBalance, async (_e, raw): Promise<Result> => {
    const cfg = parse(balanceConfigSchema, raw)
    saveSettings({ ...loadSettings(), balance: cfg })
    return { ok: true, message: 'Configuration de la balance enregistrée' }
  })

  ipcMain.handle(CH.settingsGetCompany, async (): Promise<string> => {
    requireUser()
    return (await operations.getSetting('company_name')) ?? ''
  })

  ipcMain.handle(CH.settingsSaveCompany, async (_e, raw): Promise<Result> => {
    requireUser()
    const { name } = parse(companySchema, raw)
    await operations.setSetting('company_name', name)
    return { ok: true, message: 'Nom de la société enregistré' }
  })

  ipcMain.handle(CH.dbTest, async (_e, raw): Promise<Result> => {    const cfg = parse(dbConfigSchema, raw)
    try {
      await pool.connect(cfg, true)
      return { ok: true, message: `Connecté à ${cfg.database}@${cfg.host}` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(CH.dbMigrate, async (): Promise<Result> => {
    const settings = loadSettings()
    if (!settings.db) return { ok: false, message: 'Aucune base configurée' }
    if (!pool.isConnected()) return { ok: false, message: 'Connectez-vous à la base avant de migrer' }
    try {
      const applied = await migrate(settings.db)
      const bootstrap = await auth.ensureAdmin()
      if (bootstrap) {
        console.warn(
          `[bootstrap] Compte « admin » créé avec le mot de passe « ${bootstrap} » — à changer.`
        )
      }
      return {
        ok: true,
        message:
          applied.length > 0
            ? `Tables créées : ${applied.join(', ')}`
            : 'Base déjà à jour. Compte par défaut : admin / admin'
      }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(CH.appStatus, () => appStatus())

  // ---- Session ----
  ipcMain.handle(CH.authLogin, async (_e, raw): Promise<SessionUser> => {
    const { username, password } = parse(loginSchema, raw)
    if (!pool.isConnected()) throw new Error('Base de données non connectée : voir Paramètres')
    const user = await auth.login(username, password)
    if (!user) throw new Error('Identifiant ou mot de passe incorrect')
    session = user
    return user
  })

  ipcMain.handle(CH.authLogout, () => {
    session = null
  })

  ipcMain.handle(CH.authCurrent, () => session)

  // ---- Opérations ----
  ipcMain.handle(CH.opsCreate, async (_e, raw) => {
    const user = requireUser()
    return operations.create(parse(ticketDraftSchema, raw), user)
  })

  ipcMain.handle(CH.opsCapture, async (_e, raw) => {
    const user = requireUser()
    return operations.capture(parse(captureSchema, raw), user, os.hostname())
  })

  ipcMain.handle(CH.opsRedoFirst, async (_e, raw) => {
    const user = requireUser()
    return operations.redoFirst(parse(captureSchema, raw), user, os.hostname())
  })

  ipcMain.handle(CH.opsList, async (_e, raw) => {
    requireUser()
    return operations.list(parse(opFilterSchema, raw))
  })

  ipcMain.handle(CH.opsPage, async (_e, raw) => {
    requireUser()
    return operations.page(parse(opPageSchema, raw))
  })

  ipcMain.handle(CH.opsCancel, async (_e, raw) => {
    const user = requireUser()
    const { id, reason } = parse(cancelSchema, raw)
    await operations.cancel(id, reason, user)
  })

  ipcMain.handle(CH.opsClose, async (_e, raw) => {
    const user = requireUser()
    return operations.close(parse(opCloseSchema, raw).id, user)
  })

  ipcMain.handle(CH.opsUpdate, async (_e, raw) => {
    const user = requireUser()
    const { id, patch } = parse(opUpdateSchema, raw)
    return operations.update(id, patch, user)
  })

  ipcMain.handle(CH.opsSetLines, async (_e, raw) => {
    const user = requireUser()
    const { id, lines } = parse(opLinesSchema, raw)
    return operations.setLines(id, lines, user)
  })

  ipcMain.handle(CH.opsHtml, async (_e, raw): Promise<string> => {
    requireUser()
    const { id, lang } = parse(langSchema, raw)
    return ticketHtml(id, lang)
  })

  ipcMain.handle(CH.opsPrint, async (_e, raw): Promise<Result> => {
    requireUser()
    const { id, lang } = parse(langSchema, raw)
    await printHtml(await ticketHtml(id, lang))
    return { ok: true, message: 'Ticket envoyé à l’imprimante' }
  })

  ipcMain.handle(CH.refLocations, async () => {
    requireUser()
    return operations.listLocations()
  })

  // ---- Balance ----
  ipcMain.handle(CH.balanceStart, async () => {
    const settings = loadSettings()
    if (!settings.balance) throw new Error('Balance non configurée : voir Paramètres')
    try {
      return await balance.start(settings.balance)
    } catch (err) {
      await balance.stop().catch(() => undefined)
      throw err
    }
  })

  ipcMain.handle(CH.balanceStop, () => balance.stop().then(() => balance.status()))
  ipcMain.handle(CH.balanceStatus, () => balance.status())
  ipcMain.handle(CH.balancePorts, () => listPorts())

  ipcMain.handle(CH.balanceSimSet, (_e, raw): void => {
    requireUser()
    // Sans le réglage « simulateur » du poste, ce canal ne fait rien : un
    // renderer ne peut pas fabriquer de poids sur une vraie balance.
    balance.setSimWeight(parse(simWeightSchema, raw).weight)
  })

  // Les événements de pesée sont poussés aux fenêtres : le renderer ne
  // interroge pas la balance en boucle.
  balance.on('sample', (sample: unknown) => broadcast(CH.evSample, sample))
  balance.on('stable', (sample: unknown) => broadcast(CH.evStable, sample))
}

/** Un seul gabarit sert à l'aperçu à l'écran et à l'imprimante. */
async function ticketHtml(id: number, lang: 'fr' | 'ar'): Promise<string> {
  const operation = await operations.getById(id)
  if (!operation) throw new Error('Ticket introuvable')
  const [company, locations] = await Promise.all([
    operations.getSetting('company_name'),
    operations.listLocations()
  ])
  return buildTicketHtml(operation, { company: company ?? 'Société', locations, lang })
}

async function appStatus(): Promise<AppStatus> {
  const settings = loadSettings()
  return {
    dbConfigured: settings.db !== null,
    dbConnected: pool.isConnected(),
    balance: balance.status()
  }
}
