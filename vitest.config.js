import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    hookTimeout: 20000,
    testTimeout: 20000,
    fileParallelism: false
  }
})
