import type { WeightSample } from '@shared/types'
import { formatKg } from '../api'
import { useI18n } from '../i18n'

/** Poids en direct de la balance, en bandeau compact au-dessus du formulaire. */
export default function WeightReadout({
  sample,
  running,
  busy,
  onStart
}: {
  sample: WeightSample | null
  running: boolean
  busy: boolean
  onStart: () => void
}) {
  const { t, lang } = useI18n()
  return (
    <div className="readout">
      <span className="muted">{t('station.weight')}</span>
      <strong className="weight">{formatKg(sample?.weight ?? null, lang)}</strong>
      <div className="readout-side">
        <span className={sample?.stable ? 'badge ok' : 'badge'}>
          {sample?.stable ? t('station.stable') : t('station.unstable')}
        </span>
        {!running && (
          <button type="button" onClick={onStart} disabled={busy}>
            {t('bal.start')}
          </button>
        )}
      </div>
    </div>
  )
}
