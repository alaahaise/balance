import { useCallback, useEffect, useRef, useState } from 'react'
import type { WeightSample } from '@shared/types'
import { api, call, errorMessage } from '../api'

/**
 * Balance en direct : le poids affiché, et si la liaison est active.
 *
 * La pesée est toujours déclenchée par l'opérateur (bouton de capture) : une
 * capture automatique pouvait enregistrer un poids sans qu'il l'ait voulu.
 *
 * Partagé par la 1re et la 2e balance.
 */
export function useBalance(onError: (message: string) => void) {
  const [sample, setSample] = useState<WeightSample | null>(null)
  const [running, setRunning] = useState(false)
  const [simulated, setSimulated] = useState(false)

  // L'écran possède l'état d'erreur : le crochet ne fait que le remplir.
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let active = true

    api.settings
      .get()
      .then((settings) => {
        if (!settings.balance) return
        // Connexion automatique seulement si un port est configuré : sinon la
        // page afficherait une erreur rouge dès son ouverture.
        return api.balance.start().then((status) => {
          if (!active) return
          setRunning(status.running)
          setSimulated(status.simulated)
        })
      })
      .catch((err) => {
        if (active) onErrorRef.current(errorMessage(err))
      })

    const offSample = api.balance.onSample(setSample)

    return () => {
      active = false
      offSample()
    }
  }, [])

  const startBalance = useCallback(async () => {
    try {
      const status = await call(api.balance.start())
      setRunning(status.running)
      setSimulated(status.simulated)
    } catch (err) {
      onErrorRef.current(errorMessage(err))
    }
  }, [])

  return { sample, running, simulated, startBalance }
}
