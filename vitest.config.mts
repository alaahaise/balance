import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests unitaires : aucune base, aucun matériel.
 * Les tests d'intégration (…integration.test.ts) ont leur propre config.
 */
export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts']
  }
})
