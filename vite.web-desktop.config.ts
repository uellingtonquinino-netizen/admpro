import { defineConfig, loadEnv } from 'vite'
import react                      from '@vitejs/plugin-react'
import path                       from 'path'

// NOVO: build web "completo" — reaproveita as MESMAS telas do
// desktop (src/renderer: Sidebar, todas as páginas, componentes),
// com a mesma aparência, rodando 100% no navegador. Diferente do
// vite.web.config.ts (só o app mobile, enxuto) — esse é o "site" de
// verdade, substituto do programa instalado.
//
// A raiz é uma pasta NOVA e pequena (src/web-desktop/), só com
// index.html + main.tsx — o ponto de entrada monta um window.api que
// fala direto com o Supabase, e SÓ DEPOIS renderiza o mesmo <App />
// de sempre. Todo o resto (páginas, componentes) é lido de dentro de
// src/renderer via alias, sem cópia nenhuma — uma tela corrigida lá
// já vale pros dois lados automaticamente.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY

  return {
    plugins: [react()],
    root:    'src/web-desktop',
    base:    './',
    envDir:  __dirname,

    define: {
      'import.meta.env.VITE_SUPABASE_URL':      JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY':  JSON.stringify(anonKey),
    },

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
      outDir:        path.resolve(__dirname, 'dist-web-desktop'),
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
      port:        5175,
      strictPort:  true,
      host:        true,
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom', 'recharts'],
    },
  }
})
