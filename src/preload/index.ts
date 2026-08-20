import { contextBridge, ipcRenderer } from 'electron'

const api = {

  supabase: {
    status: () => ipcRenderer.invoke('supabase:status'),
  },

  // ── App (janela / versão) ────────────────────────────────
  // NOTA: bloco não estava exposto no preload original, embora
  // app.ipc.ts já registrasse esses canais no processo main —
  // adicionado aqui apenas para expor o que já existia.
  app: {
    getVersion:   ()               => ipcRenderer.invoke('app:getVersion'),
    openExternal: (url: string)    => ipcRenderer.invoke('app:openExternal', url),
    minimize:     ()               => ipcRenderer.invoke('app:minimize'),
    maximize:     ()               => ipcRenderer.invoke('app:maximize'),
    close:        ()               => ipcRenderer.invoke('app:close'),
    relaunch:     ()               => ipcRenderer.invoke('app:relaunch'),
  },

  // ── Empresas ──────────────────────────────────────────
  empresas: {
    listar:      ()             => ipcRenderer.invoke('empresas:listar'),
    buscarPorId: (id: number)   => ipcRenderer.invoke('empresas:buscarPorId', id),
    criar:       (p: unknown)   => ipcRenderer.invoke('empresas:criar',       p),
    atualizar:   (p: unknown)   => ipcRenderer.invoke('empresas:atualizar',   p),
    excluir:     (id: number)   => ipcRenderer.invoke('empresas:excluir',     id),
  },

  // ── Usuários ──────────────────────────────────────────
  // Mescla o estado "completo" (login) com a atualização
  // posterior da conversa (alterarSenha, remover no lugar de excluir).
  usuarios: {
    listar:       (empresa_id: number) => ipcRenderer.invoke('usuarios:listar',       empresa_id),
    listarTodos:  () => ipcRenderer.invoke('usuarios:listarTodos'),
    buscarPorId:  (id: number)         => ipcRenderer.invoke('usuarios:buscarPorId',  id),
    login:        (p: unknown)         => ipcRenderer.invoke('usuarios:login',        p),
    alterarSenha: (p: unknown)         => ipcRenderer.invoke('usuarios:alterarSenha', p),
    verificarSenha: (p: unknown)       => ipcRenderer.invoke('usuarios:verificarSenha', p),
    minhasObras:  (usuarioId: number)  => ipcRenderer.invoke('usuarios:minhasObras',  usuarioId),
    definirObras: (p: unknown)         => ipcRenderer.invoke('usuarios:definirObras', p),
    criar:        (p: unknown)         => ipcRenderer.invoke('usuarios:criar',        p),
    atualizar:    (p: unknown)         => ipcRenderer.invoke('usuarios:atualizar',    p),
    remover:      (p: unknown)         => ipcRenderer.invoke('usuarios:remover',      p),
    definirPermissoesExtras: (p: unknown) => ipcRenderer.invoke('usuarios:definirPermissoesExtras', p),
    definirObrasSupervisor: (p: unknown) => ipcRenderer.invoke('usuarios:definirObrasSupervisor', p),
    alterarEmail: (p: unknown) => ipcRenderer.invoke('usuarios:alterarEmail', p),
    atualizarCarimbo: (p: unknown) => ipcRenderer.invoke('usuarios:atualizarCarimbo', p),
  },

  // ── Recuperação de senha por e-mail ───────────────────────
  auth: {
    logout:                      () => ipcRenderer.invoke('auth:logout'),
    solicitarRecuperacaoSenha:  (email: string) => ipcRenderer.invoke('auth:solicitarRecuperacaoSenha', email),
    confirmarRecuperacaoSenha:  (p: unknown) => ipcRenderer.invoke('auth:confirmarRecuperacaoSenha', p),
  },

  // ── Configuração do servidor de e-mail (SMTP) ─────────────
  configuracoesEmail: {
    buscar:      () => ipcRenderer.invoke('configuracoesEmail:buscar'),
    salvar:      (p: unknown) => ipcRenderer.invoke('configuracoesEmail:salvar', p),
    testarEnvio: (destinatario: string) => ipcRenderer.invoke('configuracoesEmail:testarEnvio', destinatario),
  },

  // ── Dashboard ─────────────────────────────────────────
  dashboard: {
    resumo:        (p: unknown) => ipcRenderer.invoke('dashboard:resumo',        p),
    graficomensal: (p: unknown) => ipcRenderer.invoke('dashboard:graficomensal', p),
    ultimoslanc:   (p: unknown) => ipcRenderer.invoke('dashboard:ultimoslanc',   p),
    topCategorias: (p: unknown) => ipcRenderer.invoke('dashboard:topCategorias', p),
  },

  // ── Lançamentos ───────────────────────────────────────
  lancamentos: {
    listar:      (p: unknown) => ipcRenderer.invoke('lancamentos:listar',      p),
    buscarPorId: (id: number) => ipcRenderer.invoke('lancamentos:buscarPorId', id),
    criar:       (p: unknown) => ipcRenderer.invoke('lancamentos:criar',       p),
    atualizar:   (p: unknown) => ipcRenderer.invoke('lancamentos:atualizar',   p),
    excluir:     (id: number) => ipcRenderer.invoke('lancamentos:excluir',     id),
  },

  // ── Contas ────────────────────────────────────────────
  contas: {
    listar:      (p: unknown) => ipcRenderer.invoke('contas:listar',      p),
    buscarPorId: (id: number) => ipcRenderer.invoke('contas:buscarPorId', id),
    criar:       (p: unknown) => ipcRenderer.invoke('contas:criar',       p),
    atualizar:   (p: unknown) => ipcRenderer.invoke('contas:atualizar',   p),
    excluir:     (id: number) => ipcRenderer.invoke('contas:excluir',     id),
    saldoTotal:  (id: number) => ipcRenderer.invoke('contas:saldoTotal',  id),
  },

  // ── Categorias ────────────────────────────────────────
  categorias: {
    listar:    (p: unknown)  => ipcRenderer.invoke('categorias:listar',    p),
    criar:     (p: unknown)  => ipcRenderer.invoke('categorias:criar',     p),
    atualizar: (p: unknown)  => ipcRenderer.invoke('categorias:atualizar', p),
    excluir:   (id: number)  => ipcRenderer.invoke('categorias:excluir',   id),
    sugestoes: (p: unknown)  => ipcRenderer.invoke('categorias:sugestoes', p),
  },

  // ── Relatórios ────────────────────────────────────────
  relatorios: {
    evolucaoMensal: (p: unknown) => ipcRenderer.invoke('relatorios:evolucaoMensal', p),
    topCategorias:  (p: unknown) => ipcRenderer.invoke('relatorios:topCategorias',  p),
    fluxoDiario:    (p: unknown) => ipcRenderer.invoke('relatorios:fluxoDiario',    p),
    porConta:       (p: unknown) => ipcRenderer.invoke('relatorios:porConta',       p),
  },

  // ── Exportação ────────────────────────────────────────
  exportacao: {
    exportar:      (p: unknown) => ipcRenderer.invoke('exportacao:exportar',      p),
    salvarArquivo: (p: unknown) => ipcRenderer.invoke('exportacao:salvarArquivo', p),
  },

  // ── Colaboradores (RH) ──────────────────────────────────
  colaboradores: {
    listar:               (p: unknown)  => ipcRenderer.invoke('colaboradores:listar',               p),
    listarResumo:         (empresa_id: number) => ipcRenderer.invoke('colaboradores:listarResumo',   empresa_id),
    buscarPorId:           (id: number) => ipcRenderer.invoke('colaboradores:buscarPorId',           id),
    criar:                 (p: unknown) => ipcRenderer.invoke('colaboradores:criar',                 p),
    atualizar:              (p: unknown) => ipcRenderer.invoke('colaboradores:atualizar',             p),
    excluir:                (id: number) => ipcRenderer.invoke('colaboradores:excluir',               id),
    opcoesFiltro:           (empresa_id: number) => ipcRenderer.invoke('colaboradores:opcoesFiltro',  empresa_id),
    historicoDocumentos:    (colaborador_id: number) => ipcRenderer.invoke('colaboradores:historicoDocumentos', colaborador_id),
    registrarDocumento:     (p: unknown) => ipcRenderer.invoke('colaboradores:registrarDocumento',    p),
    resumoRH:               (empresa_id: number) => ipcRenderer.invoke('colaboradores:resumoRH',      empresa_id),
    listarAnexos:           (colaborador_id: number) => ipcRenderer.invoke('colaboradores:listarAnexos', colaborador_id),
    adicionarAnexo:         (p: unknown) => ipcRenderer.invoke('colaboradores:adicionarAnexo',        p),
    removerAnexo:           (id: number) => ipcRenderer.invoke('colaboradores:removerAnexo',           id),
  },

  // ── Folha de Pagamento (Recursos Humanos) ───────────────
  folhaPagamento: {
    colaboradoresAtivos: (empresaId: number) => ipcRenderer.invoke('folhaPagamento:colaboradoresAtivos', empresaId),
    listar:              (empresaId: number) => ipcRenderer.invoke('folhaPagamento:listar', empresaId),
    buscarPorId:         (id: number)        => ipcRenderer.invoke('folhaPagamento:buscarPorId', id),
    buscarPorCompetencia: (p: unknown)       => ipcRenderer.invoke('folhaPagamento:buscarPorCompetencia', p),
    criar:               (p: unknown)        => ipcRenderer.invoke('folhaPagamento:criar', p),
    atualizar:           (p: unknown)        => ipcRenderer.invoke('folhaPagamento:atualizar', p),
    excluir:             (id: number)        => ipcRenderer.invoke('folhaPagamento:excluir', id),
    exportarExcel:       (id: number)        => ipcRenderer.invoke('folhaPagamento:exportarExcel', id),
    importarEspelhosPonto: () => ipcRenderer.invoke('folhaPagamento:importarEspelhosPonto'),
  },

  // ── Obra — Estrutura Analítica (EAP) ────────────────────
  obraEap: {
    listar:        (empresaId: number) => ipcRenderer.invoke('obraEap:listar', empresaId),
    listarModelo:  ()                  => ipcRenderer.invoke('obraEap:listarModelo'),
    criar:         (p: unknown)        => ipcRenderer.invoke('obraEap:criar', p),
    atualizar:     (p: unknown)        => ipcRenderer.invoke('obraEap:atualizar', p),
    excluir:       (id: number)        => ipcRenderer.invoke('obraEap:excluir', id),
    clonarModelo:  (empresaId: number) => ipcRenderer.invoke('obraEap:clonarModelo', empresaId),
  },

  // ── Obra — Diário de Obra (RDO) ─────────────────────────
  obraDiario: {
    listar:                (empresaId: number) => ipcRenderer.invoke('obraDiario:listar', empresaId),
    buscarPorData:         (p: unknown)        => ipcRenderer.invoke('obraDiario:buscarPorData', p),
    buscarPorId:           (id: number)        => ipcRenderer.invoke('obraDiario:buscarPorId', id),
    percentuaisAcumulados: (empresaId: number) => ipcRenderer.invoke('obraDiario:percentuaisAcumulados', empresaId),
    todasAtividades:       (empresaId: number) => ipcRenderer.invoke('obraDiario:todasAtividades', empresaId),
    selecionarFotos:       ()                  => ipcRenderer.invoke('obraDiario:selecionarFotos'),
    urlFoto:               (caminho: string)   => ipcRenderer.invoke('obraDiario:urlFoto', caminho),
    salvar:                (p: unknown)        => ipcRenderer.invoke('obraDiario:salvar', p),
    excluir:               (id: number)        => ipcRenderer.invoke('obraDiario:excluir', id),
  },

  // ── Faturas — mensalidade de uso do sistema (boleto/Asaas) ──
  faturas: {
    listar:           (empresaId: number) => ipcRenderer.invoke('faturas:listar', empresaId),
    statusAssinatura: (empresaId: number) => ipcRenderer.invoke('faturas:statusAssinatura', empresaId),
    ativarAssinatura: (empresaId: number) => ipcRenderer.invoke('faturas:ativarAssinatura', empresaId),
  },

  // ── Contrato de Prestação de Serviços ───────────────────
  contratos: {
    buscarOuCriar: (empresaId: number) => ipcRenderer.invoke('contratos:buscarOuCriar', empresaId),
    assinar:       (p: unknown)        => ipcRenderer.invoke('contratos:assinar', p),
  },

  // ── Documentos (abre diálogo de impressão nativo) ───────
  documentos: {
    imprimir:           (p: unknown) => ipcRenderer.invoke('documentos:imprimir', p),
    gerarPdfComAnexos:  (p: unknown) => ipcRenderer.invoke('documentos:gerarPdfComAnexos', p),
    imprimirComAnexos:  (p: unknown) => ipcRenderer.invoke('documentos:imprimirComAnexos', p),
    salvarPdfInterno:   (p: unknown) => ipcRenderer.invoke('documentos:salvarPdfInterno', p),
    abrirArquivo:       (caminho: string) => ipcRenderer.invoke('documentos:abrirArquivo', caminho),
    gerarLote:          (arquivos: unknown) => ipcRenderer.invoke('documentos:gerarLote', arquivos),
    gerarPdfsSeparados: (p: unknown) => ipcRenderer.invoke('documentos:gerarPdfsSeparados', p),
    carimbarPrimeiraPagina: (p: unknown) => ipcRenderer.invoke('documentos:carimbarPrimeiraPagina', p),
    subirPdfStorage:    (p: unknown) => ipcRenderer.invoke('documentos:subirPdfStorage', p),
  },

  // ── Fornecedores ─────────────────────────────────────────
  fornecedores: {
    listar:       (p: unknown)  => ipcRenderer.invoke('fornecedores:listar',       p),
    listarResumo: (empresa_id: number) => ipcRenderer.invoke('fornecedores:listarResumo', empresa_id),
    buscarPorId:  (id: number)  => ipcRenderer.invoke('fornecedores:buscarPorId',  id),
    criar:        (p: unknown)  => ipcRenderer.invoke('fornecedores:criar',        p),
    atualizar:    (p: unknown)  => ipcRenderer.invoke('fornecedores:atualizar',    p),
    excluir:      (id: number)  => ipcRenderer.invoke('fornecedores:excluir',      id),
  },

  // ── Autorização de Pagamento ─────────────────────────────
  ap: {
    buscarUltima: (p: unknown) => ipcRenderer.invoke('ap:buscarUltima', p),
    registrar:    (p: unknown) => ipcRenderer.invoke('ap:registrar',    p),
    listar:       (p: unknown) => ipcRenderer.invoke('ap:listar',       p),
    capaPorIds:   (apIds: number[]) => ipcRenderer.invoke('ap:capaPorIds', apIds),
    resumo:       (p: unknown) => ipcRenderer.invoke('ap:resumo', p),
    buscarPorId:  (id: number) => ipcRenderer.invoke('ap:buscarPorId',  id),
    atualizar:    (p: unknown) => ipcRenderer.invoke('ap:atualizar',    p),
    aprovar:      (p: unknown) => ipcRenderer.invoke('ap:aprovar',      p),
    salvarCaminhoPdf: (p: unknown) => ipcRenderer.invoke('ap:salvarCaminhoPdf', p),
    excluir:      (id: number) => ipcRenderer.invoke('ap:excluir',      id),
  },

  // NOVO: Autorização de Pagamento em Lote — vários beneficiários,
  // mesmo fluxo de aprovação da AP normal.
  apLote: {
    criar:            (p: unknown) => ipcRenderer.invoke('apLote:criar', p),
    listar:           (empresaId: number) => ipcRenderer.invoke('apLote:listar', empresaId),
    buscarPorId:      (id: number) => ipcRenderer.invoke('apLote:buscarPorId', id),
    aprovar:          (id: number) => ipcRenderer.invoke('apLote:aprovar', id),
    salvarCaminhoPdf: (p: unknown) => ipcRenderer.invoke('apLote:salvarCaminhoPdf', p),
    excluir:          (id: number) => ipcRenderer.invoke('apLote:excluir', id),
  },

  // ── Recibos (numeração automática) ───────────────────────
  recibos: {
    emitir: (p: unknown) => ipcRenderer.invoke('recibos:emitir', p),
  },

  // ── Opções de cadastro (Função / Setor / Equipe) ─────────
  opcoes: {
    listar:    (p: unknown) => ipcRenderer.invoke('opcoes:listar',    p),
    criar:     (p: unknown) => ipcRenderer.invoke('opcoes:criar',     p),
    atualizar: (p: unknown) => ipcRenderer.invoke('opcoes:atualizar', p),
    excluir:   (id: number) => ipcRenderer.invoke('opcoes:excluir',   id),
  },

  // ── Modelos (larguras lidas direto do Excel de referência) ──
  templates: {
    larguraColunasFichaEpi: () => ipcRenderer.invoke('templates:larguraColunasFichaEpi'),
  },

  // ── Importação de colaboradores via Excel ────────────────
  importacao: {
    gerarModeloColaboradores: () => ipcRenderer.invoke('importacao:gerarModeloColaboradores'),
    importarColaboradores:    (p: unknown) => ipcRenderer.invoke('importacao:importarColaboradores', p),
  },

  // ── Relatórios de RH ──────────────────────────────────────
  relatoriosRH: {
    colaboradoresAtivos:   (p: unknown) => ipcRenderer.invoke('relatoriosRH:colaboradoresAtivos', p),
    porAdmissao:           (p: unknown) => ipcRenderer.invoke('relatoriosRH:porAdmissao',          p),
    vencimentoExperiencia: (p: unknown) => ipcRenderer.invoke('relatoriosRH:vencimentoExperiencia', p),
    alojados:              (empresaId: number) => ipcRenderer.invoke('relatoriosRH:alojados', empresaId),
    afastados:             (empresaId: number) => ipcRenderer.invoke('relatoriosRH:afastados', empresaId),
    inativos:              (empresaId: number) => ipcRenderer.invoke('relatoriosRH:inativos', empresaId),
    aniversariantes:       (p: unknown) => ipcRenderer.invoke('relatoriosRH:aniversariantes', p),
    movimentacaoPeriodo:   (p: unknown) => ipcRenderer.invoke('relatoriosRH:movimentacaoPeriodo', p),
    porSetor:              (p: unknown) => ipcRenderer.invoke('relatoriosRH:porSetor', p),
    contasBancarias:       (p: unknown) => ipcRenderer.invoke('relatoriosRH:contasBancarias', p),
  },

  // ── Notificações ────────────────────────────────────────
  notificacoes: {
    estoqueMinimo:          (empresaId: number) => ipcRenderer.invoke('notificacoes:estoqueMinimo', empresaId),
    estoqueZerado:          (empresaId: number) => ipcRenderer.invoke('notificacoes:estoqueZerado', empresaId),
    eventos:                (p: unknown) => ipcRenderer.invoke('notificacoes:eventos', p),
    marcarEventosComoLidos: (p: unknown) => ipcRenderer.invoke('notificacoes:marcarEventosComoLidos', p),
  },

  // ── Notas Fiscais (com boletos e despesa automática) ─────
  notasFiscais: {
    listar:      (p: unknown) => ipcRenderer.invoke('notasFiscais:listar',      p),
    buscarPorId: (id: number) => ipcRenderer.invoke('notasFiscais:buscarPorId', id),
    capaPorIds:  (notaIds: number[]) => ipcRenderer.invoke('notasFiscais:capaPorIds', notaIds),
    criar:       (p: unknown) => ipcRenderer.invoke('notasFiscais:criar',       p),
    atualizar:   (p: unknown) => ipcRenderer.invoke('notasFiscais:atualizar',   p),
    excluir:     (id: number) => ipcRenderer.invoke('notasFiscais:excluir',     id),
    aprovar:     (p: unknown) => ipcRenderer.invoke('notasFiscais:aprovar',     p),
    resumo:      (p: unknown) => ipcRenderer.invoke('notasFiscais:resumo', p),
    salvarCaminhosPdf: (p: unknown) => ipcRenderer.invoke('notasFiscais:salvarCaminhosPdf', p),
  },

  // ── Contas a Pagar ────────────────────────────────────────
  contasAPagar: {
    listar:       (p: unknown) => ipcRenderer.invoke('contasAPagar:listar',       p),
    darBaixa:     (p: unknown) => ipcRenderer.invoke('contasAPagar:darBaixa',     p),
    reabrir:      (id: number) => ipcRenderer.invoke('contasAPagar:reabrir',      id),
    pagarParcial: (p: unknown) => ipcRenderer.invoke('contasAPagar:pagarParcial', p),
  },

  // ── Contas a Receber ──────────────────────────────────────
  contasAReceber: {
    listar:       (p: unknown) => ipcRenderer.invoke('contasAReceber:listar',       p),
    darBaixa:     (p: unknown) => ipcRenderer.invoke('contasAReceber:darBaixa',     p),
    reabrir:      (id: number) => ipcRenderer.invoke('contasAReceber:reabrir',      id),
    pagarParcial: (p: unknown) => ipcRenderer.invoke('contasAReceber:pagarParcial', p),
  },

  // ── Almoxarifado ───────────────────────────────────────────
  produtos: {
    listar:                (p: unknown) => ipcRenderer.invoke('produtos:listar',                p),
    categorias:            (empresaId: number) => ipcRenderer.invoke('produtos:categorias',      empresaId),
    buscarPorCodigo:       (p: unknown) => ipcRenderer.invoke('produtos:buscarPorCodigo',        p),
    buscarPorId:           (id: number) => ipcRenderer.invoke('produtos:buscarPorId',            id),
    resumo:                (empresaId: number) => ipcRenderer.invoke('produtos:resumo',          empresaId),
    proximoCodigo:         (empresaId: number) => ipcRenderer.invoke('produtos:proximoCodigo',    empresaId),
    listarComMovimentacao: (p: unknown) => ipcRenderer.invoke('produtos:listarComMovimentacao',  p),
    movimentacao:          (p: unknown) => ipcRenderer.invoke('produtos:movimentacao',           p),
    porFaixaEstoque:       (p: unknown) => ipcRenderer.invoke('produtos:porFaixaEstoque',        p),
    alugados:              (p: unknown) => ipcRenderer.invoke('produtos:alugados',               p),
    criar:                 (p: unknown) => ipcRenderer.invoke('produtos:criar',                  p),
    atualizar:             (p: unknown) => ipcRenderer.invoke('produtos:atualizar',              p),
    excluir:               (id: number) => ipcRenderer.invoke('produtos:excluir',                id),
  },

  almoxarifadoEntradas: {
    listar:      (p: unknown) => ipcRenderer.invoke('almoxarifadoEntradas:listar',      p),
    buscarPorId: (id: number) => ipcRenderer.invoke('almoxarifadoEntradas:buscarPorId', id),
    criar:       (p: unknown) => ipcRenderer.invoke('almoxarifadoEntradas:criar',       p),
    excluir:     (id: number) => ipcRenderer.invoke('almoxarifadoEntradas:excluir',     id),
  },

  pessoasAvulsas: {
    listar: (p: unknown) => ipcRenderer.invoke('pessoasAvulsas:listar', p),
    criar:  (p: unknown) => ipcRenderer.invoke('pessoasAvulsas:criar',  p),
  },

  almoxarifadoSaidas: {
    listar:           (p: unknown) => ipcRenderer.invoke('almoxarifadoSaidas:listar',           p),
    buscarPorId:      (id: number) => ipcRenderer.invoke('almoxarifadoSaidas:buscarPorId',      id),
    criar:            (p: unknown) => ipcRenderer.invoke('almoxarifadoSaidas:criar',            p),
    salvarCaminhoPdf: (p: unknown) => ipcRenderer.invoke('almoxarifadoSaidas:salvarCaminhoPdf', p),
    excluir:          (id: number) => ipcRenderer.invoke('almoxarifadoSaidas:excluir',          id),
  },

  lotes: {
    criar:          (p: unknown) => ipcRenderer.invoke('lotes:criar',          p),
    fecharLote:     (p: unknown) => ipcRenderer.invoke('lotes:fecharLote',     p),
    listarAbertos:  (empresaId: number) => ipcRenderer.invoke('lotes:listarAbertos', empresaId),
    adicionarAoLote: (p: unknown) => ipcRenderer.invoke('lotes:adicionarAoLote', p),
    tirarDoLote:    (p: unknown) => ipcRenderer.invoke('lotes:tirarDoLote',    p),
    excluir:        (id: number) => ipcRenderer.invoke('lotes:excluir',       id),
    enviarParaSupervisor: (p: unknown) => ipcRenderer.invoke('lotes:enviarParaSupervisor', p),
    listarPorObra:  (empresaId: number) => ipcRenderer.invoke('lotes:listarPorObra',  empresaId),
    buscarPorId:    (id: number) => ipcRenderer.invoke('lotes:buscarPorId',    id),
    resumoObras:    (empresaIds: number[]) => ipcRenderer.invoke('lotes:resumoObras', empresaIds),
    listarSupervisores: () => ipcRenderer.invoke('lotes:listarSupervisores'),
    obrasDoSupervisor: (usuarioId: number) => ipcRenderer.invoke('lotes:obrasDoSupervisor', usuarioId),
    apsParaCapa: (loteId: number) => ipcRenderer.invoke('lotes:apsParaCapa', loteId),
  },

  master: {
    escritorio:   () => ipcRenderer.invoke('master:escritorio'),
    supervisores: () => ipcRenderer.invoke('master:supervisores'),
    setorPessoal: () => ipcRenderer.invoke('master:setorPessoal'),
    definirObrasSupervisor: (p: unknown) => ipcRenderer.invoke('master:definirObrasSupervisor', p),
    obras:        () => ipcRenderer.invoke('master:obras'),
    obraDetalhe:  (empresaId: number) => ipcRenderer.invoke('master:obraDetalhe', empresaId),
    listarExclusoes: () => ipcRenderer.invoke('master:listarExclusoes'),
  },

  // ── Solicitações ao Setor Pessoal ────────────────────────
  solicitacoesPessoal: {
    criar:          (p: unknown) => ipcRenderer.invoke('solicitacoesPessoal:criar', p),
    listarPorObra:  (empresaId: number) => ipcRenderer.invoke('solicitacoesPessoal:listarPorObra', empresaId),
    listarTodas:    () => ipcRenderer.invoke('solicitacoesPessoal:listarTodas'),
    buscarPorId:    (id: number) => ipcRenderer.invoke('solicitacoesPessoal:buscarPorId', id),
    responder:      (p: unknown) => ipcRenderer.invoke('solicitacoesPessoal:responder', p),
    concluir:       (id: number) => ipcRenderer.invoke('solicitacoesPessoal:concluir', id),
  },

  // ── Backup do banco de dados ──────────────────────────────
  backup: {
    exportar:      () => ipcRenderer.invoke('backup:exportar'),
    importar:      () => ipcRenderer.invoke('backup:importar'),
    exportarObra:  (empresaId: number) => ipcRenderer.invoke('backup:exportarObra', empresaId),
    importarObra:  () => ipcRenderer.invoke('backup:importarObra'),
  },

  // ── Painel inicial do Supervisor (dashboard) ──────────────
  supervisor: {
    painelInicio:              (p: unknown) => ipcRenderer.invoke('supervisor:painelInicio', p),
    graficosObras:             (p: unknown) => ipcRenderer.invoke('supervisor:graficosObras', p),
    notificacoesObras:         (empresaIds: number[]) => ipcRenderer.invoke('supervisor:notificacoesObras', empresaIds),
    colaboradoresPorDimensao:  (p: unknown) => ipcRenderer.invoke('supervisor:colaboradoresPorDimensao', p),
  },

}

contextBridge.exposeInMainWorld('api', api)

// ── Tipagem global ────────────────────────────────────────
// CORRIGIDO: `typeof window.api` não compila dentro do próprio preload
// (o preload roda antes de expor `api` em `window`, e o tsconfig do
// preload não inclui o global.d.ts do renderer que declara isso).
// O tipo agora é inferido do objeto `api` definido acima.
export type ApiType = typeof api
