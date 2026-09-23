import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/quote': {
        target: 'https://quotes-api-three.vercel.app',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/quote/, '/api/randomquote'),
      },
    },
  },
})
