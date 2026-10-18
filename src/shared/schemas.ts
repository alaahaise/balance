/**
 * Validation des entrées IPC. Tout ce qui vient du renderer est traité comme
 * non fiable : une valeur non validée finirait dans une requête SQL ou sur un
 * port série.
 *
 * Utilisé uniquement par le processus principal (dépend de zod).
 */
import { z } from 'zod'
import { OPERATION_TYPES } from './types'

export const dbConfigSchema = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(64),
  password: z.string().max(255),
  database: z.string().trim().min(1).max(64)
})

export const balanceConfigSchema = z.object({
  port: z.string().trim().min(1).max(32),
  baud: z.number().int().min(50).max(1_000_000),
  dataBits: z.union([z.literal(7), z.literal(8)]),
  parity: z.enum(['none', 'even', 'odd']),
  stopBits: z.union([z.literal(1), z.literal(2)]),
  requestHex: z.string().trim().max(64).nullable(),
  pollMs: z.number().int().min(0).max(5000),
  frameRegex: z.string().min(1).max(255),
  decimalSep: z.enum(['.', ',']),
  unit: z.string().trim().min(1).max(8),
  stableMs: z.number().int().min(0).max(10_000),
  stableEpsilon: z.number().min(0).max(1000),
  uiHz: z.number().int().min(1).max(60),
  simulate: z.boolean().optional()
})

/** Poids demandé au simulateur de balance (kg). */
export const simWeightSchema = z.object({
  weight: z.number().min(0).max(200_000)
})

/** Un ticket réel porte au plus quelques produits. */
export const MAX_LINES = 50

export const productLineSchema = z.object({
  productId: z.number().int().positive().nullish(),
  productCode: z.string().trim().min(1).max(64),
  quantityKg: z.number().positive().max(1_000_000)
})

export const ticketDraftSchema = z.object({
  type: z.enum(OPERATION_TYPES),
  plate: z.string().trim().max(32).nullish(),
  driverName: z.string().trim().max(128).nullish(),
  partnerId: z.number().int().positive().nullish(),
  partnerName: z.string().trim().max(160).nullish(),
  locationFromId: z.number().int().positive().nullish(),
  locationToId: z.number().int().positive().nullish(),
  blNo: z.string().trim().max(64).nullish(),
  blDate: z.string().trim().max(10).nullish(),
  notes: z.string().max(2000).nullish(),
  lines: z.array(productLineSchema).max(MAX_LINES).optional()
})

export const captureSchema = z.object({
  operationId: z.number().int().positive(),
  weight: z.number().min(-1000).max(1_000_000),
  isManual: z.boolean(),
  stableMs: z.number().int().min(0).nullish(),
  raw: z.string().max(255).nullish(),
  /** Lignes saisies à l'écran : enregistrées dans le même geste que la pesée. */
  lines: z.array(productLineSchema).max(MAX_LINES).optional()
})

export const opLinesSchema = z.object({
  id: z.number().int().positive(),
  lines: z.array(productLineSchema).max(MAX_LINES)
})

export const opFilterSchema = z.object({
  type: z.enum(OPERATION_TYPES).nullish(),
  status: z.enum(['OUVERTE', 'FERMEE', 'ANNULEE']).nullish(),
  limit: z.number().int().min(1).max(500).optional(),
  search: z.string().trim().max(64).nullish()
})

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200)
})

export const cancelSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().min(3).max(255)
})

export const opCloseSchema = z.object({
  id: z.number().int().positive()
})

/** Liste blanche : les clés inconnues sont écartées, pas transmises à SQL. */
export const opUpdateSchema = z.object({
  id: z.number().int().positive(),
  patch: z.object({
    plate: z.string().trim().max(32).nullish(),
    driverName: z.string().trim().max(128).nullish(),
    partnerName: z.string().trim().max(160).nullish(),
    blNo: z.string().trim().max(64).nullish(),
    blDate: z.string().trim().max(10).nullish(),
    locationFromId: z.number().int().positive().nullish(),
    locationToId: z.number().int().positive().nullish(),
    notes: z.string().max(2000).nullish()
  })
})

export const langSchema = z.object({
  id: z.number().int().positive(),
  lang: z.enum(['fr', 'ar'])
})

export const companySchema = z.object({
  name: z.string().trim().min(1).max(120)
})
