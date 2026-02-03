import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,jsx}', 'main.js', 'preload.js', '*.js'],
      exclude: [
        'node_modules/**',
        'tests/**',
        'dist/**',
        'dist-electron/**',
        '*.config.js',
        'postcss.config.js',
        'tailwind.config.js'
      ]
    },
    testTimeout: 10000
  }
});
