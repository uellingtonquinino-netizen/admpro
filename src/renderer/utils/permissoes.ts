// NOVO: lista única de TODAS as páginas do sistema (nível de obra —
// ADM/GESTOR/ALMOXARIFADO), usada em "Acessos extras" no cadastro e
// na edição de usuário. `perfisPadrao` é quem já tem aquela página
// só por causa do perfil, sem precisar de nada extra — é o que
// decide se a caixinha começa marcada.
//
// Precisa ficar em sincronia manual com as `chave=` usadas em
// AppRoutes.tsx (e com os itens correspondentes no Sidebar.tsx) —
// se uma rota nova ganhar uma chave lá, ela precisa entrar aqui
// também pra aparecer na lista de Acessos extras.
// NOVO: além de páginas, essa lista também guarda permissões de
// COMPORTAMENTO — coisas que não são uma tela, mas uma capacidade
// extra dentro de uma tela que o usuário já acessa. Nenhum perfil
// tem essas por padrão (perfisPadrao vazio) — só quem o Administrador
// marcar explicitamente.
export interface PermissaoSistema {
  chave:        string
  label:        string
  perfisPadrao: ('admin' | 'gestor' | 'almoxarife')[]
}

export const PERMISSOES_SISTEMA: PermissaoSistema[] = [
  { chave: 'inicio',                 label: 'Início',                            perfisPadrao: ['admin', 'gestor'] },
  { chave: 'colaboradores',          label: 'Colaboradores',                     perfisPadrao: ['admin'] },
  { chave: 'relatorios-rh',          label: 'Relatórios RH',                     perfisPadrao: ['admin'] },
  { chave: 'solicitacoes-pessoal',   label: 'Solicitações ao Setor Pessoal',     perfisPadrao: ['admin'] },
  { chave: 'fornecedores',           label: 'Fornecedores',                      perfisPadrao: ['admin'] },
  { chave: 'lancamentos',            label: 'Lançamentos',                       perfisPadrao: ['admin'] },
  { chave: 'notas-fiscais',          label: 'Notas Fiscais',                     perfisPadrao: ['admin', 'gestor'] },
  { chave: 'contas-a-pagar',         label: 'Contas a Pagar',                    perfisPadrao: ['admin'] },
  { chave: 'contas-a-receber',       label: 'Contas a Receber',                  perfisPadrao: ['admin'] },
  { chave: 'autorizacao-pagamento',  label: 'Autorização de Pagamento',          perfisPadrao: ['admin', 'gestor'] },
  { chave: 'contas',                 label: 'Contas',                            perfisPadrao: ['admin'] },
  { chave: 'categorias',             label: 'Categorias',                        perfisPadrao: ['admin'] },
  { chave: 'relatorios-financeiros', label: 'Relatórios Financeiros',            perfisPadrao: ['admin'] },
  { chave: 'almoxarifado-painel',    label: 'Almoxarifado — Painel Inicial',     perfisPadrao: ['admin', 'almoxarife', 'gestor'] },
  { chave: 'almoxarifado-entradas',  label: 'Almoxarifado — Entradas',           perfisPadrao: ['admin', 'almoxarife'] },
  { chave: 'almoxarifado-saidas',    label: 'Almoxarifado — Saídas',             perfisPadrao: ['admin', 'almoxarife'] },
  { chave: 'almoxarifado-estoque',   label: 'Almoxarifado — Estoque',            perfisPadrao: ['admin', 'almoxarife', 'gestor'] },
  { chave: 'backup',                 label: 'Backup',                            perfisPadrao: ['admin'] },
  { chave: 'lotes-enviados',         label: 'Lotes Enviados',                    perfisPadrao: ['admin'] },
  { chave: 'fechar-lote-nao-autorizado', label: 'Fechar Lote com AP/Nota não autorizada', perfisPadrao: [] },
  { chave: 'apagar-lote', label: 'Apagar Lote', perfisPadrao: [] },
]
