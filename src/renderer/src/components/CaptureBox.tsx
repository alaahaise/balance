import { useState } from 'react'
import type { WeightSample } from '@shared/types'
import { useI18n } from '../i18n'

export interface CaptureRequest {
  weight: number
  /** Poids tapé au clavier : marqué « M » sur le ticket, sans lecture de balance à tracer. */
  manual: boolean
}

/**
 * Le gros bouton de capture et ses options, communs aux deux balances.
 *
 * Deux façons de peser : lire la balance (poids stable uniquement), ou taper le
 * poids quand la balance ne répond pas. Un poids tapé est marqué « M » sur le ticket.
 */
export default function CaptureBox({
  label,
  sample,
  busy,
  blocked = false,
  onCapture,
  onCancel
}: {
  label: string
  sample: WeightSample | null
  busy: boolean
  /** Saisie incomplète ailleurs dans la page : on ne laisse pas capturer. */
  blocked?: boolean
  onCapture: (request: CaptureRequest) => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const [manual, setManual] = useState(false)
  const [typed, setTyped] = useState('')

  const typedKg = Number(typed.replace(',', '.'))
  const typedOk = typed.trim() !== '' && Number.isFinite(typedKg) && typedKg >= 0
  const canCapture = !busy && !blocked && (manual ? typedOk : sample?.stable === true)

  function capture(): void {
    if (manual) onCapture({ weight: typedKg, manual: true })
    else if (sample) onCapture({ weight: sample.weight, manual: false })
  }

  return (
    <div className="capture-box">
      {manual && (
        <label className="manual-input">
          {t('cap.manualWeight')}
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      )}

      <button type="button" className="primary big" disabled={!canCapture} onClick={capture}>
        {label}
      </button>
      {!canCapture && !manual && !blocked && (
        <span className="muted">{t('station.waitStable')}</span>
      )}

      <div className="checks">
        <label className="inline">
          <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
          {t('cap.manual')}
        </label>
      </div>

      {onCancel && (
        <button type="button" className="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      )}
    </div>
  )
}
