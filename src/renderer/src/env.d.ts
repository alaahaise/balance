/** Type de `window.api`, pour le renderer. */
import type { AppApi } from '@shared/channels'

declare global {
  interface Window {
    api: AppApi
  }
}

export {}
