import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** Versão de navegador, mantida separada da interface Electron. */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  // A chave anon é pública por definição e pode ir para o navegador.
  // A service_role nunca é lida nem incluída no bundle web.
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY

  return {
    plugins: [react()],
    root: 'src/web',
    envDir: __dirname,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
    },
    build: {
      outDir: path.resolve(__dirname, 'dist-web'),
      emptyOutDir: true,
    },
    server: {
      port: 5174,
      strictPort: true,
      host: true,
    },
  }
})
