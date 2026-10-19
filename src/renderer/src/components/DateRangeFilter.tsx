import { useI18n } from '../i18n'

/**
 * Filtre par date de création du ticket : « du … au … » (jours inclus).
 * Les valeurs sont des dates locales `YYYY-MM-DD` ; une valeur vide = pas de borne.
 */
export default function DateRangeFilter({
  from,
  to,
  onFrom,
  onTo
}: {
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="date-range">
      <label className="inline">
        {t('filter.from')}
        <input
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => onFrom(e.target.value)}
        />
      </label>
      <label className="inline">
        {t('filter.to')}
        <input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onTo(e.target.value)}
        />
      </label>
      {(from !== '' || to !== '') && (
        <button
          type="button"
          className="ghost"
          onClick={() => {
            onFrom('')
            onTo('')
          }}
        >
          {t('filter.clearDates')}
        </button>
      )}
    </div>
  )
}
