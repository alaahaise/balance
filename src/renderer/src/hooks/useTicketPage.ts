import { useCallback, useEffect, useRef, useState } from 'react'
import type { OpPage } from '@shared/channels'
import { DEFAULT_PAGE_SIZE } from '@shared/domain/paging'
import type { OperationStatus, OperationType } from '@shared/types'
import { api, call, errorMessage } from '../api'

/** Délai de frappe avant de lancer la recherche : une requête par pause, pas par touche. */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Liste paginée de tickets : filtres, page courante et requête serveur.
 *
 * - Le serveur ne renvoie que la page demandée (`ops.page`) : l'écran ne charge
 *   jamais la table entière.
 * - Tout changement de filtre ramène à la page 1, sans requête intermédiaire : la
 *   page est rattachée à la combinaison de filtres pour laquelle elle a été choisie.
 * - Une réponse arrivée en retard (frappe rapide) est ignorée.
 * - L'ancienne page reste affichée pendant le chargement : pas de tableau qui clignote.
 */
export function useTicketPage(base: {
  type: OperationType
  status?: OperationStatus | null
  /** Liste de la 2e balance : tickets pesés une fois, en attente de la 2e pesée. */
  awaitingSecond?: boolean
}) {
  const { type, status = null, awaitingSecond = false } = base

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const filterKey = JSON.stringify([
    type,
    status,
    awaitingSecond,
    debounced,
    dateFrom,
    dateTo,
    pageSize
  ])
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = useCallback(
    (next: number) => setPageState({ key: filterKey, page: next }),
    [filterKey]
  )

  const [data, setData] = useState<OpPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const mine = ++latest.current
    setLoading(true)
    try {
      const result = await call(
        api.ops.page({
          type,
          status,
          awaitingSecond,
          search: debounced || null,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          page,
          pageSize
        })
      )
      if (mine !== latest.current) return
      setData(result)
      setError(null)
      // La liste a rétréci : le serveur a servi la dernière page, on s'y aligne.
      if (result.page !== page) setPage(result.page)
    } catch (err) {
      if (mine === latest.current) setError(errorMessage(err))
    } finally {
      if (mine === latest.current) setLoading(false)
    }
  }, [type, status, awaitingSecond, debounced, dateFrom, dateTo, page, pageSize, setPage])

  useEffect(() => {
    void load()
  }, [load])

  return {
    data,
    loading,
    error,
    reload: load,
    search,
    setSearch,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    setPage,
    pageSize,
    setPageSize,
    /** Au moins un filtre est actif (sert à dire « aucun résultat » plutôt que « rien »). */
    filtered: debounced !== '' || dateFrom !== '' || dateTo !== ''
  }
}
