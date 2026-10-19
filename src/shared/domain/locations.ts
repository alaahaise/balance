import type { OperationType } from '../types'

/** Code du lieu « Stock central » dans le référentiel de départ (migration 001). */
export const CENTRAL_LOCATION_CODE = 'STOCK'

/**
 * Quels lieux l'opérateur doit renseigner pour un ticket.
 *
 *  - ENTREE    : seulement le lieu d'arrivée (stock central, unité A, unité B…).
 *                La marchandise vient de l'extérieur, y compris un retour client.
 *  - SORTIE    : aucun lieu. La marchandise de la société part à l'extérieur.
 *                Un RETOUR (marchandise renvoyée, ex. un CMV au fournisseur) sort
 *                d'un lieu précis de la société : le lieu de départ est demandé.
 *  - TRANSFERT / TIERS : inchangés, les deux lieux restent libres.
 */
export type LocationFields = 'none' | 'from' | 'to' | 'both'

export function locationFieldsFor(type: OperationType, isRetour: boolean): LocationFields {
  switch (type) {
    case 'ENTREE':
      return 'to'
    case 'SORTIE':
      return isRetour ? 'from' : 'none'
    default:
      return 'both'
  }
}

/** Le lieu de départ est-il à saisir pour ce ticket ? */
export const asksFrom = (fields: LocationFields): boolean => fields === 'from' || fields === 'both'

/** Le lieu d'arrivée est-il à saisir pour ce ticket ? */
export const asksTo = (fields: LocationFields): boolean => fields === 'to' || fields === 'both'

/**
 * Lieux enregistrés en base. Ce qui n'est pas demandé à l'opérateur est imposé
 * ici, pour que le stock (qui se déduit de ces deux colonnes) reste juste :
 *  - un lieu demandé mais laissé vide retombe sur le stock central ;
 *  - un lieu non demandé est vidé (extérieur), ou fixé au stock central quand
 *    c'est la société qui fournit la marchandise (SORTIE).
 *
 * `centralId` = null si le référentiel n'a pas de « STOCK » : rien n'est inventé.
 */
export function resolveLocations(input: {
  type: OperationType
  isRetour: boolean
  fromId: number | null
  toId: number | null
  centralId: number | null
}): { fromId: number | null; toId: number | null } {
  const { type, isRetour, fromId, toId, centralId } = input
  const fields = locationFieldsFor(type, isRetour)
  if (fields === 'both') return { fromId, toId }

  if (type === 'ENTREE') return { fromId: null, toId: toId ?? centralId }
  // SORTIE : la marchandise quitte la société.
  return { fromId: fields === 'from' ? (fromId ?? centralId) : centralId, toId: null }
}
