import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
    // Em dev o frontend chama /api/... na mesma origem e o Vite repassa ao backend.
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
    },
  },
  preview: {
    host: 'localhost',
    port: 5173,
  },
})
