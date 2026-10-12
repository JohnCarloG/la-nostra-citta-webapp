import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    fileParallelism: false, // Esecuzione sequenziale delle suite per isolare il DB condiviso di test
    maxConcurrency: 1,
    setupFiles: ['./src/lib/test-env.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/_v9_baseline/**',
      '**/_backup_corrente/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
