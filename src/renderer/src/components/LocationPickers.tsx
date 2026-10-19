import type { Location } from '@shared/channels'
import {
  asksFrom,
  asksTo,
  CENTRAL_LOCATION_CODE,
  locationFieldsFor
} from '@shared/domain/locations'
import type { OperationType } from '@shared/types'
import { useI18n } from '../i18n'

/**
 * Les lieux à renseigner pour un ticket, selon son type (voir `locationFieldsFor`).
 *
 * Une sortie n'en demande aucun ; une entrée seulement l'emplacement de dépose.
 * Quand le lieu est obligatoire, il n'y a pas d'option « extérieur » et le stock
 * central est présélectionné : l'opérateur n'a rien à faire dans le cas courant.
 * Une valeur vide ('') est envoyée telle quelle : le serveur la ramène au stock
 * central, c'est ce que la présélection affiche.
 */
export default function LocationPickers({
  type,
  isRetour,
  locations,
  from,
  to,
  onFrom,
  onTo,
  disabled = false
}: {
  type: OperationType
  isRetour: boolean
  locations: Location[]
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
  disabled?: boolean
}) {
  const { t, lang } = useI18n()
  const fields = locationFieldsFor(type, isRetour)
  if (fields === 'none') return null

  // Entrée ou retour de sortie : le lieu est imposé (jamais « extérieur »).
  const required = fields !== 'both'
  const central = locations.find((l) => l.code === CENTRAL_LOCATION_CODE)
  const centralId = central ? String(central.id) : ''

  const options = (
    <>
      {!required && <option value="">{t('station.outside')}</option>}
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {lang === 'ar' && l.nameAr ? l.nameAr : l.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="pair">
      {asksFrom(fields) && (
        <label>
          {t('station.locationFrom')}
          <select
            disabled={disabled}
            value={from || (required ? centralId : '')}
            onChange={(e) => onFrom(e.target.value)}
          >
            {options}
          </select>
        </label>
      )}
      {asksTo(fields) && (
        <label>
          {t(fields === 'to' ? 'station.locationDrop' : 'station.locationTo')}
          <select
            disabled={disabled}
            value={to || (required ? centralId : '')}
            onChange={(e) => onTo(e.target.value)}
          >
            {options}
          </select>
        </label>
      )}
    </div>
  )
}
