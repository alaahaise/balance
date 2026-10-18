/**
 * Filtre de stabilité.
 *
 * Le poids utile n'est pas un échantillon mais un état : celui où un camion a
 * fini de bouger sur le pont. Capturer sur un échantillon isolé enregistrerait
 * l'oscillation d'un véhicule encore en mouvement.
 */

export interface StabilityState {
  /** Dernier poids lu. */
  weight: number | null
  /** Instant où l'état stable courant a commencé. */
  sinceMs: number | null
  stable: boolean
  /** Durée de stabilité atteinte, en ms. */
  stableMs: number
}

export const INITIAL_STABILITY: StabilityState = {
  weight: null,
  sinceMs: null,
  stable: false,
  stableMs: 0
}

/**
 * @param epsilonKg  écart maximal entre deux lectures pour rester « stable »
 * @param stableForMs durée pendant laquelle ce calme doit se maintenir
 */
export function nextStability(
  prev: StabilityState,
  sample: { weight: number; atMs: number },
  epsilonKg: number,
  stableForMs: number
): StabilityState {
  const moved = prev.weight == null || Math.abs(sample.weight - prev.weight) > epsilonKg

  if (moved) {
    return { weight: sample.weight, sinceMs: sample.atMs, stable: false, stableMs: 0 }
  }

  const sinceMs = prev.sinceMs ?? sample.atMs
  const stableMs = sample.atMs - sinceMs
  return { weight: sample.weight, sinceMs, stable: stableMs >= stableForMs, stableMs }
}
