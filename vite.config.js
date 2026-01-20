import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3003,
    open: false  // Protocol: Don't auto-open browser tabs
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
