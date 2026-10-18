/**
 * Simulateur de balance, pour développer sans pont-bascule.
 *
 * Fonction pure : le temps (`dtMs`) et le hasard (`rand`) sont injectés, donc
 * testable sans horloge. Le poids simulé imite un camion : le pont est vide,
 * le poids monte en oscillant, se stabilise (bruit sous la tolérance de
 * stabilité), puis redescend.
 *
 * Deux régimes :
 *  - automatique : le cycle vide → camion → palier → vide tourne en boucle ;
 *  - manuel (`setSimTarget`) : le poids demandé est tenu jusqu'à la prochaine
 *    consigne, pour avoir le temps de remplir le formulaire et de capturer.
 */

export type SimPhase = 'idle' | 'moving' | 'hold'

export interface SimState {
  phase: SimPhase
  /** Poids « vrai » du pont, sans bruit. */
  base: number
  target: number
  /** Temps écoulé dans la phase courante, en ms. */
  phaseMs: number
  /** Consigne posée à la main : le palier dure jusqu'à la consigne suivante. */
  manual: boolean
  /** Poids affiché (base + oscillation + bruit). */
  weight: number
}

export interface SimOptions {
  /** Plage des poids tirés au hasard par le cycle automatique, en kg. */
  minKg: number
  maxKg: number
  /** Tolérance de stabilité de la balance : le bruit au palier reste en dessous. */
  epsilonKg: number
  /** Pont vide avant le camion suivant, en ms. */
  idleMs: number
  /** Durée du palier stable en cycle automatique, en ms. */
  holdMs: number
}

export const DEFAULT_SIM_OPTIONS: SimOptions = {
  minKg: 8_000,
  maxKg: 40_000,
  epsilonKg: 0.5,
  idleMs: 3_000,
  holdMs: 25_000
}

/** Constante de temps de la montée : ~6 s pour passer de 0 à 40 t. */
const TAU_MS = 500
/** Écart sous lequel le camion est considéré arrivé, en kg. */
const ARRIVED_KG = 0.5

export function initialSim(): SimState {
  return { phase: 'idle', base: 0, target: 0, phaseMs: 0, manual: false, weight: 0 }
}

/** Pose un poids à la main : le simulateur y va, puis le tient indéfiniment. */
export function setSimTarget(state: SimState, kg: number): SimState {
  return { ...state, phase: 'moving', target: Math.max(0, kg), phaseMs: 0, manual: true }
}

const round2 = (value: number): number => Math.round(value * 100) / 100

export function stepSim(
  state: SimState,
  dtMs: number,
  rand: () => number,
  opts: SimOptions = DEFAULT_SIM_OPTIONS
): SimState {
  let { phase, base, target, phaseMs, manual } = state
  phaseMs += dtMs

  if (phase === 'idle' && phaseMs >= opts.idleMs) {
    // Tirage arrondi à 5 kg : une balance réelle n'affiche pas des grammes au hasard.
    target = Math.round((opts.minKg + rand() * (opts.maxKg - opts.minKg)) / 5) * 5
    phase = 'moving'
    phaseMs = 0
    manual = false
  } else if (phase === 'hold' && !manual && phaseMs >= opts.holdMs) {
    target = 0
    phase = 'moving'
    phaseMs = 0
  }

  let oscillation = 0
  if (phase === 'moving') {
    const remaining = target - base
    base += remaining * (1 - Math.exp(-dtMs / TAU_MS))
    // Le camion se balance d'autant plus qu'il est loin de sa position finale.
    oscillation = (target - base) * 0.04 * Math.sin(phaseMs / 120)
    if (Math.abs(target - base) < ARRIVED_KG) {
      base = target
      oscillation = 0
      phaseMs = 0
      phase = target === 0 && !manual ? 'idle' : 'hold'
    }
  }

  // Au repos, le bruit reste largement sous la tolérance de stabilité : sinon la
  // balance simulée ne serait jamais « stable » et la capture ne se déclencherait pas.
  const noise = (rand() - 0.5) * 2 * opts.epsilonKg * 0.3
  const weight = Math.max(0, round2(base + oscillation + noise))

  return { phase, base, target, phaseMs, manual, weight }
}
