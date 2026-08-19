import { registerAppIpc }         from './app.ipc'
import { registerEmpresasIpc }    from './empresas.ipc'
import { registerUsuariosIpc }    from './usuarios.ipc'
import { registerDashboardIpc }   from './dashboard.ipc'
import { registerLancamentosIpc } from './lancamentos.ipc'
import { registerContasIpc }      from './contas.ipc'
import { registerCategoriasIpc }  from './categorias.ipc'
import { registerRelatoriosIpc }  from './relatorios.ipc'
import { registerExportacaoIpc }  from './exportacao.ipc'
import { registerColaboradoresIpc } from './colaboradores.ipc'
import { registerDocumentosIpc }    from './documentos.ipc'
import { registerFornecedoresIpc }  from './fornecedores.ipc'
import { registerApIpc }            from './ap.ipc'
import { registerRecibosIpc }       from './recibos.ipc'
import { registerOpcoesIpc }        from './opcoes.ipc'
import { registerTemplatesIpc }     from './templates.ipc'
import { registerImportacaoIpc }    from './importacao.ipc'
import { registerRelatoriosRHIpc }  from './relatoriosRH.ipc'
import { registerNotificacoesIpc }  from './notificacoes.ipc'
import { registerNotasFiscaisIpc }  from './notasFiscais.ipc'
import { registerContasAPagarIpc }  from './contasAPagar.ipc'
import { registerContasAReceberIpc } from './contasAReceber.ipc'
import { registerProdutosIpc } from './produtos.ipc'
import { registerAlmoxarifadoEntradasIpc } from './almoxarifadoEntradas.ipc'
import { registerPessoasAvulsasIpc } from './pessoasAvulsas.ipc'
import { registerAlmoxarifadoSaidasIpc } from './almoxarifadoSaidas.ipc'
import { registerLotesIpc } from './lotes.ipc'
import { registerMasterIpc } from './master.ipc'
import { registerSolicitacoesPessoalIpc } from './solicitacoesPessoal.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerSupabaseIpc } from './supabase.ipc'
import { registerSupervisorPainelIpc } from './supervisorPainel.ipc'
import { registerRecuperacaoSenhaIpc } from './recuperacaoSenha.ipc'
import { registerConfiguracoesEmailIpc } from './configuracoesEmail.ipc'
import { registerFolhaPagamentoIpc } from './folhaPagamento.ipc'
import { registerObraEapIpc } from './obraEap.ipc'
import { registerObraDiarioIpc } from './obraDiario.ipc'
import { registerFaturasIpc } from './faturas.ipc'
import { registerContratosIpc } from './contratos.ipc'

export function registerAllIpc() {
  registerAppIpc()
  registerEmpresasIpc()
  registerUsuariosIpc()
  registerDashboardIpc()
  registerLancamentosIpc()
  registerContasIpc()
  registerCategoriasIpc()
  registerRelatoriosIpc()
  registerExportacaoIpc()
  registerColaboradoresIpc()
  registerDocumentosIpc()
  registerFornecedoresIpc()
  registerApIpc()
  registerRecibosIpc()
  registerOpcoesIpc()
  registerTemplatesIpc()
  registerImportacaoIpc()
  registerRelatoriosRHIpc()
  registerNotificacoesIpc()
  registerNotasFiscaisIpc()
  registerContasAPagarIpc()
  registerContasAReceberIpc()
  registerProdutosIpc()
  registerAlmoxarifadoEntradasIpc()
  registerPessoasAvulsasIpc()
  registerAlmoxarifadoSaidasIpc()
  registerLotesIpc()
  registerMasterIpc()
  registerSolicitacoesPessoalIpc()
  registerBackupIpc()
  registerSupabaseIpc()
  registerSupervisorPainelIpc()
  registerRecuperacaoSenhaIpc()
  registerConfiguracoesEmailIpc()
  registerFolhaPagamentoIpc()
  registerObraEapIpc()
  registerObraDiarioIpc()
  registerFaturasIpc()
  registerContratosIpc()
}
