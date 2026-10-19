import { normalizePlate } from './plate'

/** Échappe `\`, `%` et `_` : le texte tapé est cherché tel quel, jamais comme joker SQL. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&')
}

/** Motif « contient » pour un LIKE, joker échappé. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`
}

/**
 * Clé de recherche tolérante : « 12345-116-16 », « 12345 116 16 » et
 * « 1234511616 » donnent la même clé (voir `normalizePlate`). Vide = rien à chercher.
 */
export function searchKey(term: string): string {
  return normalizePlate(term)
}
