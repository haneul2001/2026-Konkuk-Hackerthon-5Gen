import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 프론트(5173)에서 /api 요청을 백엔드(3001)로 넘긴다.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
