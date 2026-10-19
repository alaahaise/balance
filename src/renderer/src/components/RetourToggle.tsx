import type { OperationType } from '@shared/types'
import { useI18n } from '../i18n'

/** Seuls l'entrée et la sortie ont un cas « retour ». */
export const canBeRetour = (type: OperationType): boolean => type === 'ENTREE' || type === 'SORTIE'

/**
 * Case « Retour » : marchandise vendue qui revient (entrée) ou marchandise
 * renvoyée, par exemple un CMV au fournisseur (sortie). Le texte change avec le
 * type pour que l'opérateur sache de quel retour il s'agit.
 */
export default function RetourToggle({
  type,
  checked,
  onChange,
  disabled = false
}: {
  type: OperationType
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  if (!canBeRetour(type)) return null

  return (
    <div className="checks">
      <label className="inline">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <strong>{t('station.retour')}</strong>
        <span className="muted">
          — {t(`station.retour.${type === 'ENTREE' ? 'ENTREE' : 'SORTIE'}`)}
        </span>
      </label>
    </div>
  )
}
