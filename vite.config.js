/**
 * GrapeStrap — Vite configuration
 *
 * Three build targets:
 *   1. Renderer (src/renderer/index.html → dist/renderer/) — bundled by Vite directly
 *   2. Main process (src/main/main.js → dist/main/) — bundled by vite-plugin-electron
 *   3. Preload (src/preload/preload.js → dist/preload/) — bundled by vite-plugin-electron
 *
 * Monaco workers and GrapesJS canvas assets are copied verbatim to dist/ for file:// loading.
 */

import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: resolve(__dirname, 'assets'),

  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome120',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html')
      },
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          grapesjs: ['grapesjs'],
          goldenLayout: ['golden-layout']
        }
      }
    }
  },

  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@plugins': resolve(__dirname, 'plugins')
    }
  },

  server: {
    port: 5174,
    strictPort: true
  },

  plugins: [
    electron({
      main: {
        entry: resolve(__dirname, 'src/main/main.js'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            emptyOutDir: true,
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                'electron-log',
                'chokidar',
                'simple-git',
                'semver'
              ]
            }
          }
        }
      },
      preload: {
        input: resolve(__dirname, 'src/preload/preload.js'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            emptyOutDir: true,
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      },
      renderer: {}
    })
  ],

  optimizeDeps: {
    include: ['monaco-editor/esm/vs/editor/editor.api']
  },

  worker: {
    format: 'es'
  }
})
