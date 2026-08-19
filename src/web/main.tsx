// ALTERADO: a versão web volta a ser um app separado e enxuto — dessa
// vez com foco total em celular, pra Gestor e Supervisor consultarem
// dados da obra, estoque, colaboradores e aprovarem documentos. Não
// carrega mais as telas do desktop (Sidebar, tabelas densas) — eram
// pensadas pra tela grande, não fazia sentido espremer isso num
// celular. As telas mobile ficam em ./mobile, com visual próprio
// (baseado nos protótipos painel-supervisor-mobile.html /
// painel-adm-mobile.html já validados).
import React     from 'react'
import ReactDOM  from 'react-dom/client'
import MobileShell from './mobile/MobileShell'
import '../renderer/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MobileShell />
  </React.StrictMode>
)
