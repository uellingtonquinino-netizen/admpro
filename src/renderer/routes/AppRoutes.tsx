import { Routes, Route } from 'react-router-dom'
import PrivateRoute                 from './PrivateRoute'
import PermissaoGuard               from '@guards/PermissaoGuard'
import HomeRedirect                 from '@guards/HomeRedirect'
import AppLayout                    from '@components/layout/AppLayout'

// Pages
import Dashboard     from '@pages/Dashboard'
import Colaboradores from '@pages/Colaboradores'
import RelatoriosRH  from '@pages/RelatoriosRH'
import FolhaPagamento from '@pages/FolhaPagamento'
import FolhaPagamentoEditor from '@pages/FolhaPagamentoEditor'
import Fornecedores  from '@pages/Fornecedores'
import Lancamentos   from '@pages/Lancamentos'
import NotasFiscais  from '@pages/NotasFiscais'
import ContasAPagar  from '@pages/ContasAPagar'
import ContasAReceber from '@pages/ContasAReceber'
import AutorizacaoPagamento from '@pages/AutorizacaoPagamento'
import Almoxarifado from '@pages/Almoxarifado'
import EstruturaObra from '@pages/EstruturaObra'
import DiarioObra from '@pages/DiarioObra'
import PainelObra from '@pages/PainelObra'
import FaturasADM from '@pages/FaturasADM'
import PainelSupervisor from '@pages/PainelSupervisor'
import PainelSupervisorInicio from '@pages/PainelSupervisorInicio'
import SupervisorEstado from '@pages/SupervisorEstado'
import SupervisorRelatorios from '@pages/SupervisorRelatorios'
import SupervisorConfiguracoes from '@pages/SupervisorConfiguracoes'
import PainelCentral from '@pages/PainelCentral'
import PainelMaster from '@pages/PainelMaster'
import MasterConfiguracoesEmail from '@pages/MasterConfiguracoesEmail'
import MasterLogExclusoes from '@pages/MasterLogExclusoes'
import Usuarios      from '@pages/Usuarios'
import PainelSetorPessoal from '@pages/PainelSetorPessoal'
import SolicitacoesPessoal from '@pages/SolicitacoesPessoal'
import MeusLotes from '@pages/MeusLotes'
import AlmoxarifadoEntradas from '@pages/AlmoxarifadoEntradas'
import Estoque from '@pages/Estoque'
import Saidas from '@pages/Saidas'
import Contas        from '@pages/Contas'
import Categorias    from '@pages/Categorias'
import Relatorios    from '@pages/Relatorios'
import Login         from '@pages/Login'
import Setup         from '@pages/Setup'
import NotFound      from '@pages/NotFound'

// ALTERADO: acesso agora segue os três perfis (ADM, GESTOR,
// ALMOXARIFADO) — cada grupo de rota é protegido por
// PermissaoGuard, e o redirect de "sem permissão" usa HomeRedirect
// (a home certa de cada perfil), pra não cair num loop quando a
// própria home padrão também é bloqueada pro perfil (caso do
// almoxarife, que não acessa /inicio).
export default function AppRoutes() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />

      {/* Privadas */}
      <Route element={<PrivateRoute />}>
        <Route element={<AppLayout />}>

          <Route index element={<HomeRedirect />} />

          {/* Início — ADM e GESTOR (não Almoxarife) */}
          <Route path="/inicio" element={
            <PermissaoGuard perfis={['admin', 'gestor']} chave="inicio">
              <Dashboard />
            </PermissaoGuard>
          } />

          {/* Configurações da conta — ADM e Gestor também têm agora,
              mesma página que o Supervisor já usava (Segurança +
              Carimbo de Assinatura) */}
          <Route path="/configuracoes" element={
            <PermissaoGuard perfis={['admin', 'gestor', 'master']}><SupervisorConfiguracoes /></PermissaoGuard>
          } />

          {/* Recursos Humanos — só ADM */}
          <Route path="/colaboradores" element={
            <PermissaoGuard perfis={['admin']} chave="colaboradores"><Colaboradores /></PermissaoGuard>
          } />
          <Route path="/relatorios-rh" element={
            <PermissaoGuard perfis={['admin']} chave="relatorios-rh"><RelatoriosRH /></PermissaoGuard>
          } />
          <Route path="/folha-pagamento" element={
            <PermissaoGuard perfis={['admin']} chave="folha-pagamento"><FolhaPagamento /></PermissaoGuard>
          } />
          <Route path="/folha-pagamento/nova" element={
            <PermissaoGuard perfis={['admin']} chave="folha-pagamento"><FolhaPagamentoEditor /></PermissaoGuard>
          } />
          <Route path="/folha-pagamento/:id" element={
            <PermissaoGuard perfis={['admin']} chave="folha-pagamento"><FolhaPagamentoEditor /></PermissaoGuard>
          } />

          {/* Financeiro — a maior parte só ADM; AP e Notas Fiscais
              também abrem pro GESTOR (mas só leitura/impressão,
              controlado dentro da própria página) */}
          <Route path="/fornecedores" element={
            <PermissaoGuard perfis={['admin']} chave="fornecedores"><Fornecedores /></PermissaoGuard>
          } />
          <Route path="/lancamentos" element={
            <PermissaoGuard perfis={['admin']} chave="lancamentos"><Lancamentos /></PermissaoGuard>
          } />
          <Route path="/notas-fiscais" element={
            <PermissaoGuard perfis={['admin', 'gestor']} chave="notas-fiscais"><NotasFiscais /></PermissaoGuard>
          } />
          <Route path="/contas-a-pagar" element={
            <PermissaoGuard perfis={['admin']} chave="contas-a-pagar"><ContasAPagar /></PermissaoGuard>
          } />
          <Route path="/contas-a-receber" element={
            <PermissaoGuard perfis={['admin']} chave="contas-a-receber"><ContasAReceber /></PermissaoGuard>
          } />

          {/* Faturas — mensalidade de uso do sistema, só ADM
              ("Visível apenas no painel do ADM", pedido explícito) */}
          <Route path="/faturas" element={
            <PermissaoGuard perfis={['admin']} chave="faturas"><FaturasADM /></PermissaoGuard>
          } />
          <Route path="/autorizacao-pagamento" element={
            <PermissaoGuard perfis={['admin', 'gestor']} chave="autorizacao-pagamento"><AutorizacaoPagamento /></PermissaoGuard>
          } />
          <Route path="/contas" element={
            <PermissaoGuard perfis={['admin']} chave="contas"><Contas /></PermissaoGuard>
          } />
          <Route path="/categorias" element={
            <PermissaoGuard perfis={['admin']} chave="categorias"><Categorias /></PermissaoGuard>
          } />
          <Route path="/relatorios" element={
            <PermissaoGuard perfis={['admin']} chave="relatorios-financeiros"><Relatorios /></PermissaoGuard>
          } />

          {/* Almoxarifado — ADM e ALMOXARIFADO têm acesso total; GESTOR
              também vê Painel Inicial e Estoque (visualizar, gerar
              relatório e imprimir), mas sem editar — Entradas e Saídas
              continuam fora, por serem só lançamento/edição. */}
          {/* Supervisor — acompanha várias obras ao mesmo tempo. NOVO:
              /supervisor agora é o painel de resumo (repaginação); a
              tela de obras/lotes/aprovação, que era o /supervisor de
              antes, mudou pra /supervisor/obras. */}
          <Route path="/supervisor" element={
            <PermissaoGuard perfis={['supervisor']}><PainelSupervisorInicio /></PermissaoGuard>
          } />
          <Route path="/supervisor/estado/:uf" element={
            <PermissaoGuard perfis={['supervisor']}><SupervisorEstado /></PermissaoGuard>
          } />
          <Route path="/supervisor/obras" element={
            <PermissaoGuard perfis={['supervisor']}><PainelSupervisor /></PermissaoGuard>
          } />
          <Route path="/supervisor/relatorios" element={
            <PermissaoGuard perfis={['supervisor']}><SupervisorRelatorios /></PermissaoGuard>
          } />
          <Route path="/supervisor/configuracoes" element={
            <PermissaoGuard perfis={['supervisor']}><SupervisorConfiguracoes /></PermissaoGuard>
          } />

          {/* Escritório Central — acompanha todos os Supervisores */}
          <Route path="/central" element={
            <PermissaoGuard perfis={['central']}><PainelCentral /></PermissaoGuard>
          } />

          {/* Administrador Master — autoridade total sobre o sistema */}
          <Route path="/master" element={
            <PermissaoGuard perfis={['master']}><PainelMaster /></PermissaoGuard>
          } />
          <Route path="/master/email" element={
            <PermissaoGuard perfis={['master']}><MasterConfiguracoesEmail /></PermissaoGuard>
          } />
          <Route path="/master/exclusoes" element={
            <PermissaoGuard perfis={['master']}><MasterLogExclusoes /></PermissaoGuard>
          } />
          <Route path="/master/usuarios" element={
            <PermissaoGuard perfis={['master']}><Usuarios /></PermissaoGuard>
          } />

          {/* Setor Pessoal — recebe admissões/desligamentos/alterações
              salariais e outras movimentações de todas as obras */}
          <Route path="/setor-pessoal" element={
            <PermissaoGuard perfis={['setor_pessoal']}><PainelSetorPessoal /></PermissaoGuard>
          } />

          {/* ADM — acompanha o que enviou pro Setor Pessoal e baixa as respostas */}
          <Route path="/solicitacoes-pessoal" element={
            <PermissaoGuard perfis={['admin']} chave="solicitacoes-pessoal"><SolicitacoesPessoal /></PermissaoGuard>
          } />

          {/* ADM — lotes já enviados pro Supervisor, só visualização */}
          <Route path="/lotes-enviados" element={
            <PermissaoGuard perfis={['admin']} chave="lotes-enviados"><MeusLotes /></PermissaoGuard>
          } />

          <Route path="/almoxarifado/painel-inicial" element={
            <PermissaoGuard perfis={['admin', 'almoxarife', 'gestor']} chave="almoxarifado-painel"><Almoxarifado /></PermissaoGuard>
          } />
          <Route path="/almoxarifado/entradas" element={
            <PermissaoGuard perfis={['admin', 'almoxarife']} chave="almoxarifado-entradas"><AlmoxarifadoEntradas /></PermissaoGuard>
          } />
          <Route path="/almoxarifado/saidas" element={
            <PermissaoGuard perfis={['admin', 'almoxarife']} chave="almoxarifado-saidas"><Saidas /></PermissaoGuard>
          } />
          <Route path="/almoxarifado/estoque" element={
            <PermissaoGuard perfis={['admin', 'almoxarife', 'gestor']} chave="almoxarifado-estoque"><Estoque /></PermissaoGuard>
          } />

          {/* Obra — Estrutura Analítica (EAP), só ADM por enquanto
              (é quem monta a estrutura da obra) */}
          {/* Obra — Estrutura Analítica (EAP), agora com o Gestor
              (era do ADM) — junto com o Diário de Obra, fica tudo na
              mão de quem acompanha a obra de perto no dia a dia. */}
          <Route path="/obra/estrutura" element={
            <PermissaoGuard perfis={['gestor']} chave="obra-estrutura"><EstruturaObra /></PermissaoGuard>
          } />

          {/* Diário de Obra — só Gestor por enquanto (decisão
              explícita do usuário; ADM cadastra a EAP mas não lança
              o diário — pode mudar quando existir um perfil dedicado
              tipo "Encarregado") */}
          <Route path="/obra/diario" element={
            <PermissaoGuard perfis={['gestor']} chave="obra-diario"><DiarioObra /></PermissaoGuard>
          } />

          <Route path="/obra/painel" element={
            <PermissaoGuard perfis={['admin', 'gestor']} chave="obra-painel"><PainelObra /></PermissaoGuard>
          } />

          {/* REMOVIDO: /usuarios e /configuracoes ficaram redundantes
              — o Painel Administrador (rota /master) já cobre as duas
              coisas, por obra, do jeito certo pra quem administra
              várias obras ao mesmo tempo. */}

        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
