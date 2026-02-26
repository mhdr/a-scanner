import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Generate bundle visualization when ANALYZE=true
    ...(process.env.ANALYZE === 'true'
      ? [visualizer({ open: true, gzipSize: true, brotliSize: true })]
      : []),
  ],
  build: {
    // Emit modern JS — no unnecessary polyfills
    target: 'es2020',
    // No sourcemaps in production (they bloat the embedded binary)
    sourcemap: false,
    // Explicit CSS minification
    cssMinify: true,
    rollupOptions: {
      output: {
        // Split heavy vendor deps into separate chunks for better caching
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-mui': [
            '@mui/material',
            '@mui/icons-material',
            '@mui/x-data-grid',
          ],
          'vendor-emotion': ['@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
