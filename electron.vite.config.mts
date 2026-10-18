import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const shared = { '@shared': resolve('src/shared') }

/**
 * Politique de sécurité de contenu, injectée au build uniquement.
 *
 * En développement, le serveur Vite a besoin de son websocket et de son
 * préambule inline ; l'appliquer aussi casserait `npm run dev`.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const injectCsp = {
  name: 'inject-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string): string {
    return html.replace(
      '<!--CSP-->',
      `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    )
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: shared }
  },
  renderer: {
    plugins: [react(), injectCsp],
    resolve: { alias: { ...shared, '@renderer': resolve('src/renderer/src') } }
  }
})
