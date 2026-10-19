import { PAGE_SIZES, pageItems } from '@shared/domain/paging'
import { useI18n } from '../i18n'

/**
 * Barre de pagination : « 26–50 sur 130 », précédent / numéros / suivant, taille de
 * page. Rien n'est affiché pour une liste vide ; une seule page garde le total.
 */
export default function Pagination({
  page,
  pages,
  total,
  pageSize,
  loading = false,
  onPage,
  onPageSize
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  loading?: boolean
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const { t } = useI18n()
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <nav className={`pagination${loading ? ' loading' : ''}`} aria-label={t('page.label')}>
      <span className="muted">{t('page.range', { from, to, total })}</span>

      {pages > 1 && (
        <div className="pages">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {t('page.prev')}
          </button>
          {pageItems(page, pages).map((item, index) =>
            item == null ? (
              <span key={`gap-${index}`} className="gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={item === page ? 'primary' : undefined}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            )
          )}
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            {t('page.next')}
          </button>
        </div>
      )}

      <label className="inline">
        {t('page.size')}
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  )
}
