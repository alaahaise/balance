import { describe, expect, it } from 'vitest'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageItems, pageWindow } from './paging'

describe('pageWindow', () => {
  it('première page par défaut', () => {
    expect(pageWindow(100)).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, pages: 4, offset: 0 })
  })

  it('calcule le décalage et le nombre de pages', () => {
    expect(pageWindow(101, 3, 50)).toEqual({ page: 3, pageSize: 50, pages: 3, offset: 100 })
    expect(pageWindow(100, 2, 50)).toMatchObject({ pages: 2, offset: 50 })
  })

  it('une liste vide a une page, pas zéro', () => {
    expect(pageWindow(0, 5)).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, pages: 1, offset: 0 })
  })

  it('ramène une page trop loin à la dernière', () => {
    expect(pageWindow(30, 99, 25)).toMatchObject({ page: 2, offset: 25 })
  })

  it('borne la page et la taille de page', () => {
    expect(pageWindow(500, 0, 25).page).toBe(1)
    expect(pageWindow(500, -3, 25).page).toBe(1)
    expect(pageWindow(5000, 1, 100_000).pageSize).toBe(MAX_PAGE_SIZE)
    expect(pageWindow(500, 1, 0).pageSize).toBe(1)
  })
})

describe('pageItems', () => {
  it('une seule page : un seul numéro', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(1, 0)).toEqual([1])
  })

  it('peu de pages : toutes affichées', () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4])
    expect(pageItems(1, 5)).toEqual([1, 2, null, 5])
  })

  it('beaucoup de pages : première, dernière et voisinage, avec des trous', () => {
    expect(pageItems(1, 100)).toEqual([1, 2, null, 100])
    expect(pageItems(50, 100)).toEqual([1, null, 49, 50, 51, null, 100])
    expect(pageItems(100, 100)).toEqual([1, null, 99, 100])
  })

  it("n'affiche pas « … » pour un trou d'une seule page", () => {
    expect(pageItems(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10])
  })
})
