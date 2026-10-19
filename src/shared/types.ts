/** Vocabulaire partagé entre le processus principal, le preload et le renderer. */

export const OPERATION_TYPES = ['ENTREE', 'SORTIE', 'TRANSFERT', 'TIERS'] as const
export type OperationType = (typeof OPERATION_TYPES)[number]

/** TARE = poids à vide, BRUT = poids chargé. */
export const WEIGH_KINDS = ['TARE', 'BRUT'] as const
export type WeighKind = (typeof WEIGH_KINDS)[number]

export type OperationStatus = 'OUVERTE' | 'FERMEE' | 'ANNULEE'

export type UserRole = 'ADMIN' | 'SUPERVISEUR' | 'OPERATEUR'

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: UserRole
}

/** Une ligne de produit d'un ticket : « 1 t de CMV X », « 4 t de CMV Y ». */
export interface ProductLine {
  productId?: number | null
  productCode: string
  /** Poids supposé de ce produit. La somme des lignes = poids supposé du ticket. */
  quantityKg: number
}

/** Ce qu'un opérateur remplit avant la première pesée. */
export interface TicketDraft {
  type: OperationType
  /**
   * Retour : marchandise vendue qui revient (ENTREE) ou marchandise renvoyée au
   * fournisseur (SORTIE). Le stock bouge dans le même sens que sans le drapeau.
   */
  isRetour?: boolean
  plate?: string | null
  driverName?: string | null
  partnerId?: number | null
  partnerName?: string | null
  locationFromId?: number | null
  locationToId?: number | null
  blNo?: string | null
  blDate?: string | null
  notes?: string | null
  /** Produits déclarés. Renseignés à la 2e balance, d'où la liste optionnelle. */
  lines?: ProductLine[]
}

export interface Weighing {
  weight: number
  /** ISO 8601 */
  at: string
  isManual?: boolean
  stableMs?: number | null
  /** Réponse brute de la balance, conservée pour litige. */
  raw?: string | null
}

export interface Operation extends TicketDraft {
  id: number
  ticketNo: string
  status: OperationStatus
  isRetour: boolean
  first: Weighing | null
  second: Weighing | null
  /** Somme des lignes, figée à la 2e pesée. */
  weightSupposed: number | null
  lines: ProductLine[]
  tareWeight: number | null
  grossWeight: number | null
  netWeight: number | null
  ecart: number | null
  ecartOk: boolean | null
  operatorName: string
  createdAt: string
  cancelReason?: string | null
}

/** Un échantillon lu sur la balance, avant tout filtrage métier. */
export interface WeightSample {
  weight: number
  unit: string
  stable: boolean
  stableMs: number
  raw: string
  at: string
}
