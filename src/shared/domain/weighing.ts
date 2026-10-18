import type { OperationType, WeighKind, Weighing } from '../types'

/** Précision du gramme : mêmes 3 décimales que le DECIMAL(12,3) en base. */
export function roundKg(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Aucun sens n'est imposé aux deux pesées : le camion peut arriver chargé ou à
 * vide, et revenir peser s'il avait oublié de le faire avant le chargement.
 * Le brut est donc toujours la plus HAUTE des deux pesées et la tare la plus
 * BASSE ; le net est leur différence.
 */
function heaviest(first: Weighing, second: Weighing): { gross: Weighing; tare: Weighing } {
  return first.weight >= second.weight
    ? { gross: first, tare: second }
    : { gross: second, tare: first }
}

/**
 * Le brut (ou la tare) vient-il d'un poids saisi à la main ? Sert à afficher « M »
 * à côté du brut ou de la tare, quelle que soit la pesée (1re ou 2e) qui les porte.
 */
export function isManualKind(
  op: { first: Weighing | null; second: Weighing | null },
  kind: WeighKind
): boolean {
  if (!op.first || !op.second) return false
  const { gross, tare } = heaviest(op.first, op.second)
  return (kind === 'BRUT' ? gross : tare).isManual === true
}

/**
 * Le produit est-il connu quand le camion arrive sur la 1re balance ?
 * ENTREE : oui, la marchandise vient avec son bon de livraison, l'opérateur peut
 * saisir produit et quantité tout de suite. Pour les autres types la
 * marchandise n'est connue qu'au chargement : le produit se saisit à la 2e balance.
 */
export function productKnownAtFirstWeighing(type: OperationType): boolean {
  return type === 'ENTREE'
}

export type TicketComputation =
  | {
      ok: true
      grossWeight: number
      tareWeight: number
      netWeight: number
      ecart: number | null
      /** null = pas de poids supposé ou pas de tolérance : rien à juger. */
      ecartOk: boolean | null
    }
  | { ok: false; reason: 'INCOMPLET' }

/**
 * Calcule les poids dérivés du ticket, quel que soit l'ordre des deux pesées. Fonction pure : pas d'Electron, pas de
 * MySQL, donc testable et réutilisable côté client.
 */
export function computeTicket(input: {
  first: Weighing | null
  second: Weighing | null
  weightSupposed?: number | null
  toleranceKg?: number | null
}): TicketComputation {
  const { first, second, weightSupposed = null, toleranceKg = null } = input

  if (!first || !second) return { ok: false, reason: 'INCOMPLET' }

  // Le net ne peut pas être négatif : le plus haut moins le plus bas.
  const { gross, tare } = heaviest(first, second)
  const grossWeight = gross.weight
  const tareWeight = tare.weight
  const netWeight = roundKg(grossWeight - tareWeight)

  const ecart = weightSupposed == null ? null : roundKg(netWeight - weightSupposed)
  const ecartOk = ecart == null || toleranceKg == null ? null : Math.abs(ecart) <= toleranceKg

  return {
    ok: true,
    grossWeight: roundKg(grossWeight),
    tareWeight: roundKg(tareWeight),
    netWeight,
    ecart,
    ecartOk
  }
}

const PREFIX: Record<OperationType, string> = {
  ENTREE: 'E',
  SORTIE: 'S',
  TRANSFERT: 'T',
  TIERS: 'P'
}

/** Portée du compteur en base : une suite par type et par année. */
export function counterScope(type: OperationType, year: number): string {
  return `${PREFIX[type]}-${year}`
}

export function formatTicketNo(
  type: OperationType,
  year: number,
  sequence: number,
  digits = 6
): string {
  return `${counterScope(type, year)}-${String(sequence).padStart(digits, '0')}`
}
