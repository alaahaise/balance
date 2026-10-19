import { describe, expect, it } from 'vitest'
import { asksFrom, asksTo, locationFieldsFor, resolveLocations } from './locations'

const CENTRAL = 1
const UNIT_A = 2

describe('locationFieldsFor', () => {
  it("ENTREE ne demande que l'arrivée, retour ou non", () => {
    expect(locationFieldsFor('ENTREE', false)).toBe('to')
    expect(locationFieldsFor('ENTREE', true)).toBe('to')
  })

  it('SORTIE ne demande rien, sauf un retour qui demande le départ', () => {
    expect(locationFieldsFor('SORTIE', false)).toBe('none')
    expect(locationFieldsFor('SORTIE', true)).toBe('from')
  })

  it('TRANSFERT et TIERS gardent les deux lieux', () => {
    expect(locationFieldsFor('TRANSFERT', false)).toBe('both')
    expect(locationFieldsFor('TIERS', false)).toBe('both')
  })

  it('asksFrom / asksTo suivent le champ', () => {
    expect([asksFrom('none'), asksTo('none')]).toEqual([false, false])
    expect([asksFrom('from'), asksTo('from')]).toEqual([true, false])
    expect([asksFrom('to'), asksTo('to')]).toEqual([false, true])
    expect([asksFrom('both'), asksTo('both')]).toEqual([true, true])
  })
})

describe('resolveLocations', () => {
  const base = { isRetour: false, fromId: null, toId: null, centralId: CENTRAL }

  it("ENTREE : arrivée choisie conservée, départ toujours vide (l'extérieur)", () => {
    expect(resolveLocations({ ...base, type: 'ENTREE', fromId: 9, toId: UNIT_A })).toEqual({
      fromId: null,
      toId: UNIT_A
    })
  })

  it('ENTREE sans arrivée : stock central', () => {
    expect(resolveLocations({ ...base, type: 'ENTREE' })).toEqual({ fromId: null, toId: CENTRAL })
  })

  it('ENTREE retour (vente reprise) : même règle que l’entrée', () => {
    expect(resolveLocations({ ...base, type: 'ENTREE', isRetour: true, toId: UNIT_A })).toEqual({
      fromId: null,
      toId: UNIT_A
    })
  })

  it('SORTIE : sort du stock central vers l’extérieur, quoi que le client envoie', () => {
    expect(resolveLocations({ ...base, type: 'SORTIE', fromId: UNIT_A, toId: 7 })).toEqual({
      fromId: CENTRAL,
      toId: null
    })
  })

  it('SORTIE retour : sort du lieu choisi, central par défaut', () => {
    expect(resolveLocations({ ...base, type: 'SORTIE', isRetour: true, fromId: UNIT_A })).toEqual({
      fromId: UNIT_A,
      toId: null
    })
    expect(resolveLocations({ ...base, type: 'SORTIE', isRetour: true })).toEqual({
      fromId: CENTRAL,
      toId: null
    })
  })

  it('TRANSFERT et TIERS : rien n’est modifié', () => {
    expect(resolveLocations({ ...base, type: 'TRANSFERT', fromId: 2, toId: 3 })).toEqual({
      fromId: 2,
      toId: 3
    })
    expect(resolveLocations({ ...base, type: 'TIERS' })).toEqual({ fromId: null, toId: null })
  })

  it("sans stock central dans le référentiel, n'invente aucun lieu", () => {
    const noCentral = { ...base, centralId: null }
    expect(resolveLocations({ ...noCentral, type: 'ENTREE' })).toEqual({ fromId: null, toId: null })
    expect(resolveLocations({ ...noCentral, type: 'SORTIE' })).toEqual({ fromId: null, toId: null })
  })
})
