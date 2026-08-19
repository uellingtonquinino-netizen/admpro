import React        from 'react'
import ReactDOM     from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { webApi }    from './webApi'
import NovaSenhaWeb  from './NovaSenhaWeb'
import '../renderer/index.css'

// NOVO: ponto de entrada do build "web-desktop" — mesma aparência do
// programa instalado (Sidebar, todas as telas), rodando 100% no
// navegador. A diferença chave em relação ao main.tsx do desktop:
// aqui `window.api` é montado ANTES de renderizar qualquer coisa,
// falando direto com o Supabase (webApi.ts) em vez de esperar o
// processo do Electron responder.
//
// IMPORTANTE: esse arquivo cresce conforme o resto do sistema for
// migrado — por enquanto só tem o necessário pro login. Cada módulo
// migrado (Financeiro, RH, Almoxarifado...) adiciona a peça
// correspondente aqui.
;(window as any).api = webApi

// Rota especial de "nova senha" (clique no link de recuperação) —
// tratada ANTES de montar o app inteiro, pra não precisar mexer no
// AppRoutes.tsx compartilhado com o desktop.
const ehTelaDeNovaSenha = window.location.hash.startsWith('#/nova-senha')

async function iniciar() {
  const raiz = ReactDOM.createRoot(document.getElementById('root')!)

  if (ehTelaDeNovaSenha) {
    raiz.render(
      <React.StrictMode>
        <NovaSenhaWeb />
      </React.StrictMode>
    )
    return
  }

  try {
    // Carregamento tardio — só depois de window.api já estar pronto,
    // pra garantir que nenhuma tela tente chamar window.api.algumaCoisa
    // antes dele existir.
    const { default: AppRoutes } = await import('../renderer/routes/AppRoutes')

    raiz.render(
      <React.StrictMode>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </React.StrictMode>
    )
  } catch (erro) {
    // NOVO: antes, um erro aqui deixava a tela em branco/escura sem
    // nenhuma pista do que aconteceu — agora aparece na cara, com o
    // texto do erro, pra dar pra diagnosticar sem precisar abrir o
    // console.
    console.error('Erro ao iniciar o app web:', erro)
    raiz.render(
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1117', color: '#fff', padding: 24, fontFamily: 'monospace' }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Erro ao carregar o sistema</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#f87171' }}>
            {erro instanceof Error ? (erro.stack ?? erro.message) : String(erro)}
          </pre>
        </div>
      </div>
    )
  }
}

iniciar()
