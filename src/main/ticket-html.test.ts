import { describe, expect, it } from 'vitest'
import type { Operation } from '@shared/types'
import { buildTicketHtml, escapeHtml, formatDateTime } from './ticket-html'

function ticket(over: Partial<Operation> = {}): Operation {
  return {
    id: 1,
    ticketNo: 'E-2026-000001',
    type: 'ENTREE',
    status: 'FERMEE',
    isRetour: false,
    plate: '12345-A-100',
    driverName: null,
    partnerId: null,
    partnerName: null,
    locationFromId: null,
    locationToId: 2,
    blNo: null,
    blDate: null,
    weightSupposed: 5000,
    lines: [{ productId: null, productCode: 'CIMENT', quantityKg: 5000 }],
    notes: null,
    first: { weight: 12000, at: '2026-10-16 09:05:00' },
    second: { weight: 7000, at: '2026-10-16 09:30:00' },
    tareWeight: 7000,
    grossWeight: 12000,
    netWeight: 5000,
    ecart: 0,
    ecartOk: true,
    operatorName: 'Administrateur',
    createdAt: '2026-10-16 09:05:00',
    cancelReason: null,
    ...over
  }
}

const opts = {
  company: 'Société Test',
  locations: [{ id: 2, code: 'STOCK', name: 'Stock central', nameAr: 'المخزن', type: 'STOCK' }],
  lang: 'fr' as const
}

describe('ticket HTML', () => {
  it('affiche le numéro, le net et le lieu résolu', () => {
    const html = buildTicketHtml(ticket(), opts)
    expect(html).toContain('E-2026-000001')
    expect(html).toContain('5000.000')
    expect(html).toContain('Stock central')
    expect(html).toContain('16/10/2026 09:05')
  })

  it('échappe ce qui vient de la saisie', () => {
    const html = buildTicketHtml(
      ticket({
        plate: '"quoted"',
        lines: [{ productId: null, productCode: '<script>alert(1)</script>', quantityKg: 1 }]
      }),
      opts
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;quoted&quot;')
  })

  it('liste les produits avec leur quantité', () => {
    const html = buildTicketHtml(
      ticket({
        lines: [
          { productId: null, productCode: 'CMV X', quantityKg: 1000 },
          { productId: null, productCode: 'CMV Y', quantityKg: 4000 }
        ],
        weightSupposed: 5000
      }),
      opts
    )
    expect(html).toContain('CMV X')
    expect(html).toContain('CMV Y')
    expect(html).toContain('1000.000')
    expect(html).toContain('4000.000')
  })

  it('présente un ticket primaire sans net ni écart', () => {
    const html = buildTicketHtml(
      ticket({ status: 'OUVERTE', second: null, netWeight: null, ecart: null, ecartOk: null }),
      opts
    )
    expect(html).toContain('BON DE PESÉE N° 1')
    expect(html).toContain('En attente de la 2e pesée')
    // Pas de section de totaux : le net n'existe pas encore.
    expect(html).not.toContain('NET PRODUIT')
  })

  it("affiche « Extérieur » quand un transfert n'a pas de lieu renseigné", () => {
    const html = buildTicketHtml(ticket({ type: 'TRANSFERT', locationFromId: null }), opts)
    expect(html).toContain('Origine')
    expect(html).toContain('Extérieur')
  })

  it("n'imprime que l'arrivée sur une entrée", () => {
    const html = buildTicketHtml(ticket(), opts)
    expect(html).toContain('Destination')
    expect(html).not.toContain('Origine')
  })

  it("n'imprime ni origine ni destination sur une sortie", () => {
    const html = buildTicketHtml(
      ticket({ type: 'SORTIE', locationFromId: 2, locationToId: null }),
      opts
    )
    expect(html).not.toContain('Origine')
    expect(html).not.toContain('Destination')
    expect(html).not.toContain('Extérieur')
  })

  it("imprime l'origine d'une sortie en retour, et le marque RETOUR", () => {
    const html = buildTicketHtml(
      ticket({ type: 'SORTIE', isRetour: true, locationFromId: 2, locationToId: null }),
      opts
    )
    expect(html).toContain('TICKET DE SORTIE — RETOUR')
    expect(html).toContain('Origine')
    expect(html).toContain('Stock central')
    expect(html).not.toContain('Destination')
  })

  it("n'ajoute pas RETOUR à un ticket ordinaire", () => {
    expect(buildTicketHtml(ticket(), opts)).not.toContain('RETOUR')
  })

  it('bascule en RTL et en arabe', () => {
    const html = buildTicketHtml(ticket(), { ...opts, lang: 'ar' })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('تذكرة دخول')
  })

  it('marque un ticket annulé', () => {
    const html = buildTicketHtml(
      ticket({ status: 'ANNULEE', cancelReason: 'Erreur de saisie' }),
      opts
    )
    expect(html).toContain('TICKET ANNULÉ')
    expect(html).toContain('Erreur de saisie')
  })
})

describe('helpers', () => {
  it('escapeHtml couvre les cinq caractères', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('formatDateTime tolère les valeurs absentes', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('2026-10-16T09:05:00')).toBe('16/10/2026 09:05')
  })

  it('marque « M » les poids saisis à la main, avec une légende', () => {
    const manualFirst = ticket({
      first: { weight: 12000, at: '2026-10-16 09:05:00', isManual: true }
    })
    const html = buildTicketHtml(manualFirst, opts)
    // une fois sur la pesée n° 1, une fois sur la ligne Brut du total
    expect(html.match(/<b class="m">M<\/b>/g)).toHaveLength(2)
    expect(html).toContain('M = pesée manuelle')
  })

  it('ne marque pas la tare quand seule la pesée de brut est manuelle', () => {
    const html = buildTicketHtml(
      ticket({
        first: { weight: 12000, at: '2026-10-16 09:05:00', isManual: true },
        second: { weight: 7000, at: '2026-10-16 09:30:00', isManual: false }
      }),
      opts
    )
    const tareRow = html.split('\n').find((line) => line.includes('>Tare<')) ?? ''
    expect(tareRow).not.toContain('class="m"')
  })

  it("n'affiche ni « M » ni légende quand tout vient de la balance", () => {
    const html = buildTicketHtml(ticket(), opts)
    expect(html).not.toContain('class="m">M')
    expect(html).not.toContain('pesée manuelle')
  })
})
