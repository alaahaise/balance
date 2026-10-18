/**
 * Génère le HTML du ticket, imprimable sur rouleau 80 mm.
 *
 * Le renderer affiche exactement ce HTML dans un cadre (`ops.html`) et
 * l'imprimante reçoit le même (`ops.print`) : un seul gabarit, donc aucun écart
 * possible entre l'aperçu et le papier.
 *
 * Tout ce qui vient de la base est échappé : un code produit ou un nom de tiers
 * saisi à la main finirait sinon exécuté dans la fenêtre d'impression.
 */
import type { Lang, Location } from '@shared/channels'
import { isManualKind } from '@shared/domain/weighing'
import type { Operation, OperationType } from '@shared/types'

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

interface Labels {
  title: string
  ticket: string
  date: string
  plate: string
  driver: string
  product: string
  quantity: string
  partner: string
  bl: string
  from: string
  to: string
  gross: string
  tare: string
  net: string
  supposed: string
  gap: string
  ok: string
  out: string
  operator: string
  station: string
  outside: string
  cancelled: string
  primaryTitle: string
  waitingSecond: string
  manualLegend: string
  types: Record<OperationType, string>
  firstWeigh: string
  secondWeigh: string
}

const LABELS: Record<Lang, Labels> = {
  fr: {
    title: 'GESTION DES PESÉES',
    ticket: 'Ticket',
    date: 'Date',
    plate: 'Matricule',
    driver: 'Chauffeur',
    product: 'Produit',
    quantity: 'Qté supposée',
    partner: 'Tiers',
    bl: 'N° BL',
    from: 'Origine',
    to: 'Destination',
    gross: 'Brut',
    tare: 'Tare',
    net: 'NET PRODUIT',
    supposed: 'Poids supposé',
    gap: 'Écart',
    ok: 'Conforme',
    out: 'Hors tolérance',
    operator: 'Opérateur',
    station: 'Poste',
    outside: 'Extérieur',
    cancelled: 'TICKET ANNULÉ',
    primaryTitle: 'BON DE PESÉE N° 1 — À COMPLÉTER',
    waitingSecond: 'En attente de la 2e pesée',
    manualLegend: 'M = pesée manuelle',
    types: {
      ENTREE: "TICKET D'ENTRÉE",
      SORTIE: 'TICKET DE SORTIE',
      TRANSFERT: 'TICKET DE TRANSFERT',
      TIERS: 'PESÉE TIERS'
    },
    firstWeigh: '1re pesée',
    secondWeigh: '2e pesée'
  },
  ar: {
    title: 'إدارة الوزن',
    ticket: 'التذكرة',
    date: 'التاريخ',
    plate: 'الترقيم',
    driver: 'السائق',
    product: 'المنتج',
    quantity: 'الكمية المقدّرة',
    partner: 'الطرف',
    bl: 'رقم البيان',
    from: 'المصدر',
    to: 'الوجهة',
    gross: 'الوزن الإجمالي',
    tare: 'الوزن الفارغ',
    net: 'صافي المنتج',
    supposed: 'الوزن المقدّر',
    gap: 'الفرق',
    ok: 'مطابق',
    out: 'خارج التسامح',
    operator: 'المشغّل',
    station: 'المحطة',
    outside: 'خارجي',
    cancelled: 'تذكرة ملغاة',
    primaryTitle: 'تذكرة الوزن رقم 1 — غير مكتملة',
    waitingSecond: 'في انتظار الوزن الثاني',
    manualLegend: 'M = وزن يدوي',
    types: {
      ENTREE: 'تذكرة دخول',
      SORTIE: 'تذكرة خروج',
      TRANSFERT: 'تذكرة تحويل',
      TIERS: 'وزن الغير'
    },
    firstWeigh: 'الوزن الأول',
    secondWeigh: 'الوزن الثاني'
  }
}

/** Les dates arrivent en `YYYY-MM-DD HH:MM:SS` (mysql2 en dateStrings). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : value
}

function kg(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(3)
}

/** Repère imprimé à côté d'un poids saisi à la main : « M ». */
const MANUAL_MARK = ' <b class="m">M</b>'

function row(
  label: string,
  value: string | null | undefined,
  strong = false,
  manual = false
): string {
  if (value == null || value === '') return ''
  return `<div class="row${strong ? ' strong' : ''}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}${manual ? MANUAL_MARK : ''}</span></div>`
}

export function buildTicketHtml(
  op: Operation,
  opts: { company: string; locations: Location[]; lang: Lang }
): string {
  const t = LABELS[opts.lang]
  const place = (id: number | null | undefined): string => {
    if (id == null) return t.outside
    const found = opts.locations.find((l) => l.id === id)
    return found ? found.name : t.outside
  }

  const weighing = (w: Operation['first'], index: number): string => {
    if (!w) return ''
    return `<div class="weigh">
      <div class="row"><span>${escapeHtml(index === 1 ? t.firstWeigh : t.secondWeigh)}</span><span>${escapeHtml(formatDateTime(w.at))}</span></div>
      <div class="weight">${escapeHtml(kg(w.weight))} kg${w.isManual ? MANUAL_MARK : ''}</div>
    </div>`
  }

  const gapLine =
    op.ecart == null
      ? ''
      : row(
          t.gap,
          `${kg(op.ecart)} kg${op.ecartOk == null ? '' : op.ecartOk ? ` — ${t.ok}` : ` — ${t.out}`}`
        )

  const cancelled =
    op.status === 'ANNULEE' ? `<h2 class="cancelled">${escapeHtml(t.cancelled)}</h2>` : ''

  // Un ticket primaire n'a qu'une pesée : pas de net ni d'écart à montrer, et
  // c'est écrit noir sur blanc pour que personne ne lise le bon n° 1 comme un
  // ticket final.
  const isPrimary = op.second == null

  const linesBlock =
    op.lines.length === 0
      ? ''
      : `<div class="lines">
    <div class="row strong"><span>${escapeHtml(t.product)}</span><span>${escapeHtml(t.quantity)}</span></div>
    ${op.lines
      .map(
        (l) =>
          `<div class="row"><span>${escapeHtml(l.productCode)}</span><span>${escapeHtml(kg(l.quantityKg))} kg</span></div>`
      )
      .join('')}
  </div>`

  const totals = isPrimary
    ? `<div class="waiting">${escapeHtml(t.waitingSecond)}</div>`
    : `<hr>
  ${row(t.gross, `${kg(op.grossWeight)} kg`, false, isManualKind(op, 'BRUT'))}
  ${row(t.tare, `${kg(op.tareWeight)} kg`, false, isManualKind(op, 'TARE'))}
  <div class="row strong net"><span>${escapeHtml(t.net)}</span><span>${escapeHtml(kg(op.netWeight))} kg</span></div>
  ${row(t.supposed, op.weightSupposed == null ? null : `${kg(op.weightSupposed)} kg`)}
  ${gapLine}`

  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(op.ticketNo)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 12px; width: 72mm; margin: 0; color: #000; }
  h1 { font-size: 14px; margin: 0; text-align: center; letter-spacing: .5px; }
  h2 { font-size: 13px; margin: 6px 0 2px; text-align: center; }
  h2.cancelled { border: 1px dashed #000; padding: 3px; margin: 6px 0; }
  h2.primary { border: 1px dashed #000; padding: 3px; margin: 6px 0; }
  .no { text-align: center; font-size: 15px; font-weight: 700; margin: 2px 0 6px; }
  .row { display: flex; justify-content: space-between; gap: 6px; padding: 1px 0; }
  .row span:last-child { text-align: ${opts.lang === 'ar' ? 'left' : 'right'}; font-weight: 600; }
  .row.strong { font-weight: 700; }
  .weight { text-align: center; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .weigh { border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
  .lines { border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px; }
  .waiting { text-align: center; font-weight: 700; border: 1px dashed #000; padding: 4px; margin-top: 6px; }
  hr { border: 0; border-top: 1px solid #000; margin: 6px 0; }
  .net { font-size: 18px; }
  .m { border: 1px solid #000; border-radius: 2px; padding: 0 3px; font-size: 11px; }
  .legend { text-align: center; font-size: 10px; margin-top: 4px; }
</style>
</head>
<body>
  <h1>${escapeHtml(opts.company)}</h1>
  <h2>${escapeHtml(t.types[op.type])}</h2>
  <div class="no">${escapeHtml(op.ticketNo)}</div>
  ${isPrimary ? `<h2 class="primary">${escapeHtml(t.primaryTitle)}</h2>` : ''}
  ${cancelled}
  ${row(t.date, formatDateTime(op.createdAt))}
  ${row(t.plate, op.plate)}
  ${row(t.driver, op.driverName)}
  ${linesBlock}
  ${row(t.partner, op.partnerName)}
  ${row(t.bl, op.blNo)}
  ${row(t.from, place(op.locationFromId))}
  ${row(t.to, place(op.locationToId))}
  ${weighing(op.first, 1)}
  ${weighing(op.second, 2)}
  ${totals}
  ${op.first?.isManual || op.second?.isManual ? `<div class="legend">${escapeHtml(t.manualLegend)}</div>` : ''}
  <hr>
  ${row(t.operator, op.operatorName)}
  ${op.status === 'ANNULEE' && op.cancelReason ? row(t.cancelled, op.cancelReason) : ''}
</body>
</html>`
}
