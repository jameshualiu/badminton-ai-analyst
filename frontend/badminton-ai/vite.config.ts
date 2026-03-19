import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: './node_modules/.vite_cache', // Move cache to avoid permission issues
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
