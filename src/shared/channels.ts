/**
 * Contrat IPC partagé par le processus principal, le preload et le renderer.
 *
 * Ce fichier ne doit importer AUCUNE bibliothèque : le preload tourne en
 * sandbox et ne peut pas charger zod ni `node:*`. Les schémas de validation
 * vivent dans `schemas.ts`, utilisé uniquement par le processus principal.
 */
import type { BalanceConfig } from './domain/balance-parser'
import type {
  Operation,
  OperationStatus,
  OperationType,
  ProductLine,
  SessionUser,
  TicketDraft,
  WeightSample
} from './types'

export const CH = {
  settingsGet: 'settings:get',
  settingsSaveDb: 'settings:saveDb',
  settingsSaveBalance: 'settings:saveBalance',
  settingsGetCompany: 'settings:getCompany',
  settingsSaveCompany: 'settings:saveCompany',
  dbTest: 'db:test',
  dbMigrate: 'db:migrate',
  appStatus: 'app:status',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authCurrent: 'auth:current',
  opsCreate: 'ops:create',
  opsCapture: 'ops:capture',
  opsRedoFirst: 'ops:redoFirst',
  opsList: 'ops:list',
  opsPage: 'ops:page',
  opsCancel: 'ops:cancel',
  opsClose: 'ops:close',
  opsUpdate: 'ops:update',
  opsSetLines: 'ops:setLines',
  opsHtml: 'ops:html',
  opsPrint: 'ops:print',
  refLocations: 'ref:locations',
  balanceStart: 'balance:start',
  balanceStop: 'balance:stop',
  balanceStatus: 'balance:status',
  balancePorts: 'balance:ports',
  balanceSimSet: 'balance:simSet',
  /** Événements main → renderer. */
  evSample: 'balance:sample',
  evStable: 'balance:stable'
} as const

export interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface AppSettings {
  db: DbConfig | null
  balance: BalanceConfig | null
}

export interface Result {
  ok: boolean
  message: string
}

export interface BalanceStatus {
  running: boolean
  port: string | null
  lastError: string | null
  /** true = poids fictifs du simulateur, pas une vraie balance. */
  simulated: boolean
}

export interface AppStatus {
  dbConfigured: boolean
  dbConnected: boolean
  balance: BalanceStatus
}

export interface Location {
  id: number
  code: string
  name: string
  nameAr: string | null
  type: string
}

export interface OpFilter {
  type?: OperationType | null
  status?: OperationStatus | null
  limit?: number
  search?: string | null
  /** Jours inclus, au format `YYYY-MM-DD`, sur la date de création du ticket. */
  dateFrom?: string | null
  dateTo?: string | null
  /** Tickets pesés une fois, en attente de la 2e pesée (liste de la 2e balance). */
  awaitingSecond?: boolean
}

/** Une page de la liste : le tri est fixe (plus récent d'abord). */
export interface OpPageFilter extends Omit<OpFilter, 'limit'> {
  /** 1-based. Au-delà de la dernière page, la dernière est servie. */
  page?: number
  pageSize?: number
}

export interface OpPage {
  rows: Operation[]
  /** Nombre de tickets correspondant au filtre, toutes pages confondues. */
  total: number
  page: number
  pageSize: number
  pages: number
}

export interface CaptureInput {
  operationId: number
  weight: number
  /** Pesée saisie à la main (balance muette) : tracée comme telle. */
  isManual: boolean
  stableMs?: number | null
  raw?: string | null
  /** Lignes saisies à l'écran, enregistrées avec la pesée (pas de total périmé). */
  lines?: ProductLine[]
}

export interface LoginInput {
  username: string
  password: string
}

export interface CancelInput {
  id: number
  reason: string
}

/**
 * Champs descriptifs corrigeables après coup.
 * Les poids n'y sont pas : la table `weighings` est la trace de ce qui a été
 * pesé, et la réécrire détruirait la valeur de preuve du ticket. Les produits
 * passent par `setLines`, qui remplace la liste entière.
 */
export interface OpUpdate {
  isRetour?: boolean
  plate?: string | null
  driverName?: string | null
  partnerName?: string | null
  blNo?: string | null
  blDate?: string | null
  locationFromId?: number | null
  locationToId?: number | null
  notes?: string | null
}

export type Lang = 'fr' | 'ar'

/** Surface exposée au renderer via `window.api`. */
export interface AppApi {
  settings: {
    get(): Promise<AppSettings>
    saveDb(cfg: DbConfig): Promise<Result>
    saveBalance(cfg: BalanceConfig): Promise<Result>
    /** Nom de la société, en base : il est imprimé en tête du ticket. */
    getCompany(): Promise<string>
    saveCompany(name: string): Promise<Result>
  }
  db: {
    test(cfg: DbConfig): Promise<Result>
    migrate(): Promise<Result>
  }
  app: {
    status(): Promise<AppStatus>
  }
  auth: {
    login(username: string, password: string): Promise<SessionUser>
    logout(): Promise<void>
    current(): Promise<SessionUser | null>
  }
  ops: {
    create(draft: TicketDraft): Promise<Operation>
    capture(input: CaptureInput): Promise<Operation>
    /** Refait la 1re pesée (camion repassé sur la balance). L'ancienne reste tracée. */
    redoFirst(input: CaptureInput): Promise<Operation>
    list(filter: OpFilter): Promise<Operation[]>
    /** Liste paginée côté serveur : seule la page demandée est lue et renvoyée. */
    page(filter: OpPageFilter): Promise<OpPage>
    cancel(id: number, reason: string): Promise<void>
    /** Enregistre le ticket après confirmation de l'opérateur. */
    close(id: number): Promise<Operation>
    update(id: number, patch: OpUpdate): Promise<Operation>
    /** Remplace la liste des produits. Refusé après la 2e pesée. */
    setLines(id: number, lines: ProductLine[]): Promise<Operation>
    /** Ticket imprimable, aussi utilisé pour l'aperçu à l'écran. */
    html(id: number, lang: Lang): Promise<string>
    print(id: number, lang: Lang): Promise<Result>
  }
  ref: {
    locations(): Promise<Location[]>
  }
  balance: {
    start(): Promise<BalanceStatus>
    stop(): Promise<BalanceStatus>
    status(): Promise<BalanceStatus>
    ports(): Promise<string[]>
    /** Simulateur uniquement : pose ce poids (kg) sur le pont virtuel. */
    simSet(weight: number): Promise<void>
    onSample(cb: (sample: WeightSample) => void): () => void
    onStable(cb: (sample: WeightSample) => void): () => void
  }
}
