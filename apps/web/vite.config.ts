import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // tanstackRouter must run before react() to generate routeTree.gen.ts first.
  plugins: [tanstackRouter({ target: 'react' }), react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
