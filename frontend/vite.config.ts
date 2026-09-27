import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server proxies /api to the ASP.NET Core host. This is deliberate: it makes the
// API same-origin from the browser's point of view, so no CORS policy is needed in
// development *and* the topology matches production, where nginx proxies /api to the
// backend container (02 §4). One less thing that behaves differently between the two.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5086'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
