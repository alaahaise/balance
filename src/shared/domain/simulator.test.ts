import { describe, expect, it } from 'vitest'
import { INITIAL_STABILITY, nextStability } from './stability'
import { DEFAULT_SIM_OPTIONS, initialSim, setSimTarget, stepSim, type SimState } from './simulator'

/** Générateur déterministe : les tests ne doivent pas dépendre de Math.random. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return s / 4_294_967_296
  }
}

const STEP = 50

function run(state: SimState, ms: number, rand: () => number): SimState {
  let current = state
  for (let t = 0; t < ms; t += STEP) current = stepSim(current, STEP, rand)
  return current
}

describe('simulateur de balance', () => {
  it('reste à vide pendant le délai, puis tire un camion dans la plage', () => {
    const rand = seeded(1)
    const waiting = run(initialSim(), DEFAULT_SIM_OPTIONS.idleMs - 200, rand)
    expect(waiting.phase).toBe('idle')
    expect(waiting.weight).toBeLessThan(1)

    const started = run(waiting, 400, rand)
    expect(started.phase).toBe('moving')
    expect(started.target).toBeGreaterThanOrEqual(DEFAULT_SIM_OPTIONS.minKg)
    expect(started.target).toBeLessThanOrEqual(DEFAULT_SIM_OPTIONS.maxKg)
    expect(started.target % 5).toBe(0)
  })

  it('un poids posé à la main est atteint puis tenu indéfiniment', () => {
    const rand = seeded(2)
    let state = setSimTarget(initialSim(), 30_000)
    state = run(state, 30_000, rand)
    expect(state.phase).toBe('hold')
    expect(Math.abs(state.weight - 30_000)).toBeLessThan(DEFAULT_SIM_OPTIONS.epsilonKg)

    // dix minutes plus tard, toujours là
    state = run(state, 600_000, rand)
    expect(state.phase).toBe('hold')
    expect(Math.abs(state.weight - 30_000)).toBeLessThan(DEFAULT_SIM_OPTIONS.epsilonKg)
  })

  it('rejette un poids négatif en le ramenant à zéro', () => {
    expect(setSimTarget(initialSim(), -50).target).toBe(0)
  })

  it('devient « stable » pour le détecteur de stabilité une fois au palier', () => {
    const rand = seeded(3)
    let sim = setSimTarget(initialSim(), 12_345)
    let stab = INITIAL_STABILITY
    let now = 0
    let stableAt: number | null = null
    let wasMovingBefore = false

    for (let i = 0; i < 1_200; i++) {
      sim = stepSim(sim, STEP, rand)
      now += STEP
      stab = nextStability(stab, { weight: sim.weight, atMs: now }, 0.5, 600)
      if (!stab.stable && sim.phase === 'moving') wasMovingBefore = true
      if (stab.stable && stableAt == null) stableAt = now
    }

    expect(wasMovingBefore).toBe(true)
    expect(stableAt).not.toBeNull()
    expect(stab.stable).toBe(true)
  })

  it('le cycle automatique repart à vide après le palier', () => {
    const rand = seeded(4)
    let state = initialSim()
    let loaded = false
    let backToEmpty = false
    for (let t = 0; t < 120_000; t += STEP) {
      state = stepSim(state, STEP, rand)
      if (state.weight >= DEFAULT_SIM_OPTIONS.minKg) loaded = true
      if (loaded && state.weight < 1) backToEmpty = true
    }
    expect(loaded).toBe(true)
    expect(backToEmpty).toBe(true)
    expect(state.manual).toBe(false)
  })

  it('ne produit jamais de poids négatif', () => {
    const rand = seeded(5)
    let state = initialSim()
    for (let i = 0; i < 2_000; i++) {
      state = stepSim(state, STEP, rand)
      expect(state.weight).toBeGreaterThanOrEqual(0)
    }
  })
})
