import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'https://dashboard.ebright.my',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
