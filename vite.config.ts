import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Vendors change rarely: separate chunks stay cached between deploys and parse in parallel.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
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
