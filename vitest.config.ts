import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/tests/**/*.{test,spec}.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
})
