import type { ReactNode } from 'react'
import DateRangeFilter from './DateRangeFilter'

/**
 * Barre de filtres des listes de tickets : la recherche à gauche, la période à
 * droite, sur une même ligne. Les filtres propres à un écran (statut…) passent
 * en `children` et se placent après la période.
 */
export default function TicketFilters({
  search,
  onSearch,
  placeholder,
  dateFrom,
  dateTo,
  onDateFrom,
  onDateTo,
  autoFocus = false,
  children
}: {
  search: string
  onSearch: (value: string) => void
  placeholder: string
  dateFrom: string
  dateTo: string
  onDateFrom: (value: string) => void
  onDateTo: (value: string) => void
  autoFocus?: boolean
  children?: ReactNode
}) {
  return (
    <div className="filter-bar">
      <input
        className="search-input"
        type="search"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <DateRangeFilter from={dateFrom} to={dateTo} onFrom={onDateFrom} onTo={onDateTo} />
      {children}
    </div>
  )
}
