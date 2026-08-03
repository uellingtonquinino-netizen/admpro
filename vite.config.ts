import { defineConfig } from 'vite'
import react            from '@vitejs/plugin-react'
import path             from 'path'

export default defineConfig({
  plugins: [react()],

  root:    'src/renderer',
  base:    './',

  resolve: {
    alias: {
      '@':            path.resolve(__dirname, 'src/renderer'),
      '@components':  path.resolve(__dirname, 'src/renderer/components'),
      '@pages':       path.resolve(__dirname, 'src/renderer/pages'),
      '@hooks':       path.resolve(__dirname, 'src/renderer/hooks'),
      '@store':       path.resolve(__dirname, 'src/renderer/store'),
      '@utils':       path.resolve(__dirname, 'src/renderer/utils'),
      '@types':       path.resolve(__dirname, 'src/renderer/types'),
      '@guards':      path.resolve(__dirname, 'src/renderer/guards'),
    },
  },

  build: {
    outDir:        path.resolve(__dirname, 'dist'),
    emptyOutDir:   true,
    sourcemap:     false,
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ['react', 'react-dom'],
          router:   ['react-router-dom'],
          recharts: ['recharts'],
          lucide:   ['lucide-react'],
        },
      },
    },
  },

  server: {
    port:        5173,
    strictPort:  true,
    host:        true,
  },

  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'recharts'],
  },
})
