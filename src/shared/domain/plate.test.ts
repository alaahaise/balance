import { describe, expect, it } from 'vitest'
import { normalizePlate, staleTicketsForPlate, ticketMatchesQuery } from './plate'
import type { Operation } from '../types'

const op = (over: Partial<Operation>): Operation =>
  ({
    id: 1,
    status: 'OUVERTE',
    plate: '12345-116-16',
    first: { weight: 5000, at: '2026-10-18 09:00:00' },
    second: null,
    ...over
  }) as Operation

describe('normalizePlate', () => {
  it('ignore la casse, les espaces et les tirets', () => {
    expect(normalizePlate('12345-116-16')).toBe('1234511616')
    expect(normalizePlate(' 12345 116 16 ')).toBe('1234511616')
    expect(normalizePlate('ab-123 cd')).toBe('AB123CD')
  })

  it('rend une chaîne vide sans matricule', () => {
    expect(normalizePlate(null)).toBe('')
    expect(normalizePlate(undefined)).toBe('')
    expect(normalizePlate('  - ')).toBe('')
  })
})

describe('staleTicketsForPlate', () => {
  it('trouve le ticket ouvert du même camion, quelle que soit la saisie', () => {
    const found = staleTicketsForPlate([op({ id: 7 })], '12345 116 16')
    expect(found.map((o) => o.id)).toEqual([7])
  })

  it('ignore les tickets fermés, annulés ou déjà pesés deux fois', () => {
    const ops = [
      op({ id: 1, status: 'FERMEE' }),
      op({ id: 2, status: 'ANNULEE' }),
      op({ id: 3, second: { weight: 1000, at: 'x' } })
    ]
    expect(staleTicketsForPlate(ops, '12345-116-16')).toEqual([])
  })

  it('ignore un autre camion', () => {
    expect(staleTicketsForPlate([op({ plate: '99999-000-01' })], '12345-116-16')).toEqual([])
  })

  it('ne trouve rien tant que le matricule est vide', () => {
    expect(staleTicketsForPlate([op({ plate: null })], '')).toEqual([])
    expect(staleTicketsForPlate([op({ plate: null })], ' - ')).toEqual([])
  })
})

describe('ticketMatchesQuery', () => {
  const ticket = op({
    ticketNo: 'E-2026-000013',
    plate: '12345-116-16',
    driverName: 'Karim Benali'
  })

  it('cherche dans le numéro, le matricule et le chauffeur', () => {
    expect(ticketMatchesQuery(ticket, '000013')).toBe(true)
    expect(ticketMatchesQuery(ticket, '12345 116')).toBe(true)
    expect(ticketMatchesQuery(ticket, 'karim b')).toBe(true)
  })

  it('refuse ce qui ne correspond à rien', () => {
    expect(ticketMatchesQuery(ticket, '99999')).toBe(false)
  })

  it('laisse tout passer quand la recherche est vide', () => {
    expect(ticketMatchesQuery(ticket, '')).toBe(true)
    expect(ticketMatchesQuery(ticket, '  ')).toBe(true)
  })
})
