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
}

iniciar()
