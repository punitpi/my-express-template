import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

config({ path: '.env.test', override: true })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false
  }
})
