import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The UML model and its Mermaid/PlantUML/JSON conversion live in `packages/uml`, shared with the
// API. Registry components still import them as `@/lib/uml*`: those imports resolve there (keep in
// sync with `paths` in tsconfig.json).
const UML_SHARED =
  /^@\/lib\/(uml|uml-elements|uml-text|uml-mermaid(?:-[a-z0-9]+)?|uml-plantuml(?:-[a-z]+)?)$/

export default defineConfig({
  // tanstackRouter must run before react() to generate routeTree.gen.ts first.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: UML_SHARED,
        replacement: `${path.resolve(import.meta.dirname, '../../packages/uml/src')}/$1.ts`,
      },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') },
    ],
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
