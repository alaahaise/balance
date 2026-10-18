import { useState } from 'react'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'

/**
 * Commande du simulateur de balance : poser un poids sur le pont virtuel.
 * Affiché uniquement quand le poste est en mode simulateur (Paramètres).
 */
export default function SimulatorPanel() {
  const { t } = useI18n()
  const [value, setValue] = useState('30000')
  const [error, setError] = useState<string | null>(null)

  async function place(kg: number): Promise<void> {
    setError(null)
    try {
      await call(api.balance.simSet(kg))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const kg = Number(value.replace(',', '.'))
  const valid = value.trim() !== '' && Number.isFinite(kg) && kg >= 0

  return (
    <div className="sim-panel">
      <p className="warn-box">{t('sim.banner')}</p>
      <div className="row">
        <label className="inline">
          {t('sim.weight')}
          <input
            type="number"
            min={0}
            step={10}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button type="button" disabled={!valid} onClick={() => void place(kg)}>
          {t('sim.place')}
        </button>
        <button type="button" className="ghost" onClick={() => void place(0)}>
          {t('sim.empty')}
        </button>
      </div>
      <p className="muted">{t('sim.hint')}</p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
