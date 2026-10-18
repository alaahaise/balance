import { describe, expect, it } from 'vitest'
import {
  computeTicket,
  counterScope,
  formatTicketNo,
  isManualKind,
  productKnownAtFirstWeighing,
  roundKg
} from './weighing'
import type { Weighing } from '../types'

const w = (weight: number, isManual = false): Weighing => ({
  weight,
  at: '2026-10-16T08:00:00.000Z',
  isManual
})

describe('roundKg', () => {
  it('arrondit au gramme', () => {
    expect(roundKg(3000.0004)).toBe(3000)
    expect(roundKg(0.0005)).toBe(0.001)
    expect(roundKg(1234.5678)).toBe(1234.568)
  })
})

describe('computeTicket', () => {
  it('prend le plus haut moins le plus bas, camion pesé chargé d’abord', () => {
    const result = computeTicket({
      first: w(5000),
      second: w(2000),
      weightSupposed: 2950,
      toleranceKg: 60
    })
    expect(result).toEqual({
      ok: true,
      grossWeight: 5000,
      tareWeight: 2000,
      netWeight: 3000,
      ecart: 50,
      ecartOk: true
    })
  })

  it('donne le même résultat quand le camion est pesé à vide d’abord', () => {
    const result = computeTicket({ first: w(2000), second: w(5000), weightSupposed: 2950 })
    expect(result.ok && result.netWeight).toBe(3000)
    expect(result.ok && result.grossWeight).toBe(5000)
    expect(result.ok && result.tareWeight).toBe(2000)
  })

  it('ne donne jamais un net négatif, quel que soit l’ordre des pesées', () => {
    const result = computeTicket({ first: w(2000), second: w(5000) })
    expect(result.ok && result.netWeight).toBeGreaterThanOrEqual(0)
  })

  it('accepte deux pesées égales : net nul', () => {
    const result = computeTicket({ first: w(4000), second: w(4000) })
    expect(result.ok && result.netWeight).toBe(0)
  })

  it('signale un écart hors tolérance', () => {
    const result = computeTicket({
      first: w(2000),
      second: w(5000),
      weightSupposed: 2950,
      toleranceKg: 20
    })
    expect(result.ok && result.ecart).toBe(50)
    expect(result.ok && result.ecartOk).toBe(false)
  })

  it('donne un écart négatif quand le net est inférieur au supposé', () => {
    const result = computeTicket({ first: w(2000), second: w(2900), weightSupposed: 1000 })
    expect(result.ok && result.ecart).toBe(-100)
  })

  it('ne juge pas l’écart sans poids supposé', () => {
    const result = computeTicket({ first: w(2000), second: w(5000) })
    expect(result.ok && result.ecart).toBeNull()
    expect(result.ok && result.ecartOk).toBeNull()
  })

  it('ne juge pas l’écart sans tolérance configurée', () => {
    const result = computeTicket({ first: w(2000), second: w(5000), weightSupposed: 1000 })
    expect(result.ok && result.ecart).toBe(2000)
    expect(result.ok && result.ecartOk).toBeNull()
  })

  it('refuse un ticket incomplet', () => {
    expect(computeTicket({ first: w(2000), second: null })).toEqual({
      ok: false,
      reason: 'INCOMPLET'
    })
  })
})

describe('numérotation', () => {
  it('formate un numéro de ticket', () => {
    expect(formatTicketNo('ENTREE', 2026, 123)).toBe('E-2026-000123')
    expect(formatTicketNo('TIERS', 2026, 7)).toBe('P-2026-000007')
  })

  it('utilise la même portée que le compteur', () => {
    expect(counterScope('SORTIE', 2026)).toBe('S-2026')
    expect(formatTicketNo('SORTIE', 2026, 1).startsWith(counterScope('SORTIE', 2026))).toBe(true)
  })
})

describe('productKnownAtFirstWeighing', () => {
  it('est vrai pour une entrée : la marchandise arrive avec son bon', () => {
    expect(productKnownAtFirstWeighing('ENTREE')).toBe(true)
  })

  it('est faux quand le camion arrive à vide : le produit se saisit à la 2e balance', () => {
    expect(productKnownAtFirstWeighing('SORTIE')).toBe(false)
    expect(productKnownAtFirstWeighing('TRANSFERT')).toBe(false)
    expect(productKnownAtFirstWeighing('TIERS')).toBe(false)
  })
})

describe('isManualKind', () => {
  it('rattache « M » au brut ou à la tare selon le poids, pas selon l’ordre', () => {
    const heavyManual = w(12000, true)
    const lightAuto = w(7000, false)
    // camion pesé chargé d'abord, puis à vide
    expect(isManualKind({ first: heavyManual, second: lightAuto }, 'BRUT')).toBe(true)
    expect(isManualKind({ first: heavyManual, second: lightAuto }, 'TARE')).toBe(false)
    // pesé à vide d'abord, puis chargé : mêmes poids, mêmes résultats
    expect(isManualKind({ first: lightAuto, second: heavyManual }, 'BRUT')).toBe(true)
    expect(isManualKind({ first: lightAuto, second: heavyManual }, 'TARE')).toBe(false)
  })

  it('est faux tant que les deux pesées ne sont pas faites', () => {
    expect(isManualKind({ first: w(1, true), second: null }, 'BRUT')).toBe(false)
    expect(isManualKind({ first: null, second: null }, 'TARE')).toBe(false)
  })
})
