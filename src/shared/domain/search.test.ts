import { describe, expect, it } from 'vitest'
import { containsPattern, escapeLike, searchKey } from './search'

describe('recherche', () => {
  it('échappe les jokers SQL', () => {
    expect(escapeLike('50%')).toBe('50\\%')
    expect(escapeLike('a_b')).toBe('a\\_b')
    expect(escapeLike('a\\b')).toBe('a\\\\b')
    expect(containsPattern('100%')).toBe('%100\\%%')
  })

  it('laisse intact un texte ordinaire', () => {
    expect(containsPattern('CMV X')).toBe('%CMV X%')
  })

  it('la clé ignore casse, espaces et tirets', () => {
    expect(searchKey('12345-116-16')).toBe('1234511616')
    expect(searchKey('12345 116 16')).toBe('1234511616')
    expect(searchKey('e-2026-0001')).toBe('E20260001')
    expect(searchKey(' - ')).toBe('')
  })
})
