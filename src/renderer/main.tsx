import React        from 'react'
import ReactDOM     from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import AppRoutes    from './routes/AppRoutes'
import './index.css'

// NOTA: o App.tsx original (PARTE 51) referenciava páginas de uma versão
// anterior do projeto (Receitas, Despesas, Clientes, Fornecedores, Empresas)
// que não fazem parte do escopo final (Dashboard, Lançamentos, Contas,
// Categorias, Relatórios, Usuários, Configurações — ver AppRoutes.tsx,
// PARTE 76). Por isso main.tsx foi religado para renderizar <AppRoutes />
// diretamente, em vez do <App /> obsoleto.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  </React.StrictMode>
)
