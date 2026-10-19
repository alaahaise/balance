/** Pagination des listes de tickets : bornes communes à l'écran et au serveur. */
export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface PageWindow {
  /** Page effectivement servie (1-based), ramenée dans [1, pages]. */
  page: number
  pageSize: number
  pages: number
  offset: number
}

/**
 * Fenêtre d'une page. Une page demandée au-delà de la dernière (la liste a
 * rétréci entre deux clics : tickets annulés, filtre plus strict) est ramenée à la
 * dernière page plutôt que de renvoyer une page vide.
 */
export function pageWindow(
  total: number,
  page?: number | null,
  pageSize?: number | null
): PageWindow {
  const size = Math.min(Math.max(Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(Math.max(total, 0) / size))
  const current = Math.min(Math.max(Math.trunc(page ?? 1), 1), pages)
  return { page: current, pageSize: size, pages, offset: (current - 1) * size }
}

/**
 * Numéros de pages à afficher : toujours la première, la dernière et le voisinage
 * de la page courante, avec « … » (null) pour les trous. 100 pages ne donnent pas
 * 100 boutons.
 */
export function pageItems(page: number, pages: number, around = 1): Array<number | null> {
  if (pages <= 1) return [1]
  const wanted = new Set<number>([1, pages])
  for (let p = page - around; p <= page + around; p++) {
    if (p >= 1 && p <= pages) wanted.add(p)
  }
  const sorted = [...wanted].sort((a, b) => a - b)
  const items: Array<number | null> = []
  sorted.forEach((p, index) => {
    const previous = sorted[index - 1]
    if (previous !== undefined) {
      if (p - previous === 2)
        items.push(previous + 1) // un seul trou : autant afficher la page
      else if (p - previous > 2) items.push(null)
    }
    items.push(p)
  })
  return items
}
