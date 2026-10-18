import type { ProductLine } from '@shared/types'
import { formatKg } from '../api'
import { useI18n } from '../i18n'

const EMPTY_LINE: ProductLine = { productCode: '', quantityKg: 0 }

/** Retire les lignes vides. Une ligne à moitié saisie est signalée par `hasIncompleteLine`. */
export function cleanLines(lines: ProductLine[]): ProductLine[] {
  return lines.filter((l) => l.productCode.trim() !== '' && l.quantityKg > 0)
}

/**
 * Une ligne avec un produit sans quantité (ou l'inverse) : la retirer en silence
 * ferait perdre à l'opérateur ce qu'il vient de taper, il faut le lui dire.
 */
export function hasIncompleteLine(lines: ProductLine[]): boolean {
  return lines.some((l) => {
    const hasProduct = l.productCode.trim() !== ''
    const hasQuantity = l.quantityKg > 0
    return hasProduct !== hasQuantity
  })
}

export function linesTotal(lines: ProductLine[]): number {
  return cleanLines(lines).reduce((sum, l) => sum + l.quantityKg, 0)
}

/**
 * Produits d'un ticket : un produit et sa quantité par ligne, la somme devenant
 * le poids supposé (« 1 t de CMV X » + « 4 t de CMV Y » = 5 t).
 */
export default function ProductLines({
  lines,
  onChange,
  disabled
}: {
  lines: ProductLine[]
  onChange: (lines: ProductLine[]) => void
  disabled?: boolean
}) {
  const { t, lang } = useI18n()

  const patch = (index: number, changes: Partial<ProductLine>): void =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...changes } : line)))

  return (
    <div className="lines-editor">
      <div className="lines-head">
        <strong>{t('lines.title')}</strong>
        <span className="muted">
          {t('lines.total')} : {formatKg(linesTotal(lines), lang)}
        </span>
      </div>

      {lines.length > 0 && (
        <div className="line-grid line-cols muted">
          <span>{t('lines.product')}</span>
          <span>{t('lines.quantity')}</span>
          <span />
        </div>
      )}

      {lines.map((line, index) => (
        <div className="line-grid" key={index}>
          <input
            value={line.productCode}
            disabled={disabled}
            onChange={(e) => patch(index, { productCode: e.target.value })}
          />
          <input
            type="number"
            step="0.001"
            min="0"
            value={line.quantityKg === 0 ? '' : String(line.quantityKg)}
            disabled={disabled}
            onChange={(e) => patch(index, { quantityKg: Number(e.target.value) })}
          />
          <button
            type="button"
            className="ghost icon-btn"
            title={t('lines.remove')}
            aria-label={t('lines.remove')}
            disabled={disabled}
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      <button
        type="button"
        className="add-line"
        disabled={disabled}
        onClick={() => onChange([...lines, { ...EMPTY_LINE }])}
      >
        + {t('lines.add')}
      </button>

      {hasIncompleteLine(lines) && <p className="error">{t('lines.incomplete')}</p>}
    </div>
  )
}
