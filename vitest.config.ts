import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    setupFiles: ['./test/setupImageSnapshot.ts'],
  },
})
