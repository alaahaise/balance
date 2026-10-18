import { useI18n } from '../i18n'

/** « M » à côté d'un poids saisi à la main : même repère que sur le ticket imprimé. */
export default function ManualMark() {
  const { t } = useI18n()
  return (
    <span className="manual-mark" title={t('station.manualMark')}>
      M
    </span>
  )
}
