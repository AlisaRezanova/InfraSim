import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// В dev-режиме (`make dev`) запросы к /api идут на бэкенд в Docker, порт которого проброшен на хост.
const backend = `http://127.0.0.1:${process.env.BACKEND_PORT || 8001}`

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': backend } },
})
