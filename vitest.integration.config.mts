import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests d'intégration, sur une base réelle.
 * `npm run test:db` démarre un serveur jetable puis lance cette config.
 */
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 30_000,
    env: { INTEGRATION_DB: '1' }
  }
})
