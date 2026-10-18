import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BALANCE_CONFIG,
  hexToBytes,
  parseFrame,
  parseLastWeight,
  splitFrames,
  uiIntervalMs
} from './balance-parser'
import { INITIAL_STABILITY, nextStability } from './stability'

describe('splitFrames', () => {
  it('découpe sur CRLF, CR et LF', () => {
    expect(splitFrames('a\r\nb\rc\nd\r\n').frames).toEqual(['a', 'b', 'c', 'd'])
  })

  it('garde le fragment incomplet pour le tour suivant, sans perdre de pesée', () => {
    const first = splitFrames('ST,GS,+0012')
    expect(first.frames).toEqual([])
    expect(first.rest).toBe('ST,GS,+0012')

    const second = splitFrames(first.rest + '34.5kg\r\n')
    expect(second.frames).toEqual(['ST,GS,+001234.5kg'])
  })

  it('ignore les lignes vides', () => {
    expect(splitFrames('\r\n\r\n').frames).toEqual([])
  })
})

describe('parseFrame', () => {
  const config = DEFAULT_BALANCE_CONFIG

  it('lit un cadre continu Mettler-Toledo', () => {
    expect(parseFrame('ST,GS,+001234.5kg', config)).toBe(1234.5)
  })

  it('lit un poids à virgule décimale', () => {
    expect(parseFrame('  00123,4 kg', config)).toBe(123.4)
  })

  it('lit un poids négatif', () => {
    expect(parseFrame('US,GS,-000015.0kg', config)).toBe(-15)
  })

  it('lit un poids sans décimale', () => {
    expect(parseFrame('000500kg', config)).toBe(500)
  })

  it('renvoie null sur un cadre illisible', () => {
    expect(parseFrame('OL,GS,kg', config)).toBeNull()
    expect(parseFrame('', config)).toBeNull()
    expect(parseFrame('   ', config)).toBeNull()
  })

  it('ne casse pas sur une regex invalide dans les paramètres', () => {
    expect(parseFrame('1234', { frameRegex: '([', decimalSep: '.' })).toBeNull()
  })

  it('suit la regex personnalisée de l’appareil', () => {
    // Certains indicateurs préfixent d'un code de stabilité fixe.
    expect(parseFrame('WN0000450.0', { frameRegex: '^WN(\\d+\\.\\d)', decimalSep: '.' })).toBe(450)
  })
})

describe('parseLastWeight', () => {
  it('retient la dernière mesure d’un flux continu sans délimiteur', () => {
    expect(parseLastWeight('ST,GS,+0010.0kgST,GS,+0025.5kg', DEFAULT_BALANCE_CONFIG)).toBe(25.5)
  })

  it('renvoie null si rien n’est lisible', () => {
    expect(parseLastWeight('OL,GS,kg', DEFAULT_BALANCE_CONFIG)).toBeNull()
  })
})

describe('hexToBytes', () => {
  it('convertit la requête en octets', () => {
    expect(hexToBytes('0D')).toEqual(Uint8Array.from([0x0d]))
    expect(hexToBytes('0d 0a')).toEqual(Uint8Array.from([0x0d, 0x0a]))
  })

  it('renvoie null si aucune requête n’est configurée', () => {
    expect(hexToBytes(null)).toBeNull()
  })

  it('refuse une saisie invalide plutôt que d’envoyer n’importe quoi', () => {
    expect(hexToBytes('0')).toBeNull()
    expect(hexToBytes('')).toBeNull()
  })
})

describe('uiIntervalMs', () => {
  it('limite le rafraîchissement à la fréquence demandée', () => {
    expect(uiIntervalMs(20)).toBe(50)
    expect(uiIntervalMs(10)).toBe(100)
  })

  it('ne descend jamais sous une frame', () => {
    expect(uiIntervalMs(1000)).toBe(16)
  })

  it('retombe sur la valeur par défaut si la fréquence est absurde', () => {
    expect(uiIntervalMs(0)).toBe(50)
    expect(uiIntervalMs(-5)).toBe(50)
  })
})

describe('nextStability', () => {
  const epsilon = 0.5
  const stableFor = 600

  it('n’est pas stable tant que le camion bouge', () => {
    let state = nextStability(INITIAL_STABILITY, { weight: 1000, atMs: 0 }, epsilon, stableFor)
    expect(state.stable).toBe(false)

    state = nextStability(state, { weight: 1080, atMs: 100 }, epsilon, stableFor)
    state = nextStability(state, { weight: 1120, atMs: 200 }, epsilon, stableFor)
    expect(state.stable).toBe(false)
    expect(state.stableMs).toBe(0)
  })

  it('devient stable après la durée exigée sans mouvement', () => {
    let state = nextStability(INITIAL_STABILITY, { weight: 1000, atMs: 0 }, epsilon, stableFor)
    state = nextStability(state, { weight: 1000.2, atMs: 300 }, epsilon, stableFor)
    expect(state.stable).toBe(false)

    state = nextStability(state, { weight: 1000.1, atMs: 600 }, epsilon, stableFor)
    expect(state.stable).toBe(true)
    expect(state.stableMs).toBe(600)
  })

  it('retombe en mouvement si le poids ressort de l’epsilon', () => {
    let state = nextStability(INITIAL_STABILITY, { weight: 1000, atMs: 0 }, epsilon, stableFor)
    state = nextStability(state, { weight: 1000, atMs: 600 }, epsilon, stableFor)
    expect(state.stable).toBe(true)

    state = nextStability(state, { weight: 1005, atMs: 700 }, epsilon, stableFor)
    expect(state.stable).toBe(false)
    expect(state.sinceMs).toBe(700)
  })

  it('repart de zéro après une nouvelle pesée', () => {
    let state = nextStability(INITIAL_STABILITY, { weight: 2000, atMs: 0 }, epsilon, stableFor)
    state = nextStability(state, { weight: 2000, atMs: 5000 }, epsilon, stableFor)
    expect(state.stable).toBe(true)

    state = nextStability(state, { weight: 4000, atMs: 5100 }, epsilon, stableFor)
    expect(state.stable).toBe(false)
    expect(state.stableMs).toBe(0)
  })
})
