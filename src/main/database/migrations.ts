import Database from 'better-sqlite3'

export function runMigrations(db: Database.Database): void {

  // ── Controle de versão ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      version    INTEGER NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = (db.prepare(
    `SELECT version FROM migrations ORDER BY version DESC LIMIT 1`
  ).get() as { version: number } | undefined)?.version ?? 0

  if (applied < 1) { migration_001(db); markDone(db, 1) }
  if (applied < 2) { migration_002(db); markDone(db, 2) }
  if (applied < 3) { migration_003(db); markDone(db, 3) }
  if (applied < 4) { migration_004(db); markDone(db, 4) }
  if (applied < 5) { migration_005(db); markDone(db, 5) }
  if (applied < 6) { migration_006(db); markDone(db, 6) }
  if (applied < 7) { migration_007(db); markDone(db, 7) }
  if (applied < 8) { migration_008(db); markDone(db, 8) }
  if (applied < 9) { migration_009(db); markDone(db, 9) }
  if (applied < 10) { migration_010(db); markDone(db, 10) }
  if (applied < 11) { migration_011(db); markDone(db, 11) }
  if (applied < 12) { migration_012(db); markDone(db, 12) }
  if (applied < 13) { migration_013(db); markDone(db, 13) }
  if (applied < 14) { migration_014(db); markDone(db, 14) }
  if (applied < 15) { migration_015(db); markDone(db, 15) }
  if (applied < 16) { migration_016(db); markDone(db, 16) }
  if (applied < 17) { migration_017(db); markDone(db, 17) }
  if (applied < 18) { migration_018(db); markDone(db, 18) }
  if (applied < 19) { migration_019(db); markDone(db, 19) }
  if (applied < 20) { migration_020(db); markDone(db, 20) }
  if (applied < 21) { migration_021(db); markDone(db, 21) }
  if (applied < 22) { migration_022(db); markDone(db, 22) }
  if (applied < 23) { migration_023(db); markDone(db, 23) }
  if (applied < 24) { migration_024(db); markDone(db, 24) }
  if (applied < 25) { migration_025(db); markDone(db, 25) }
  if (applied < 26) { migration_026(db); markDone(db, 26) }
  if (applied < 27) { migration_027(db); markDone(db, 27) }
  if (applied < 28) { migration_028(db); markDone(db, 28) }
  if (applied < 29) { migration_029(db); markDone(db, 29) }
  if (applied < 30) { migration_030(db); markDone(db, 30) }
  if (applied < 31) { migration_031(db); markDone(db, 31) }
  if (applied < 32) { migration_032(db); markDone(db, 32) }
  if (applied < 33) { migration_033(db); markDone(db, 33) }
  if (applied < 34) { migration_034(db); markDone(db, 34) }
  if (applied < 35) { migration_035(db); markDone(db, 35) }
  if (applied < 36) { migration_036(db); markDone(db, 36) }
  if (applied < 37) { migration_037(db); markDone(db, 37) }
  if (applied < 38) { migration_038(db); markDone(db, 38) }
  if (applied < 39) { migration_039(db); markDone(db, 39) }
  if (applied < 40) { migration_040(db); markDone(db, 40) }
  if (applied < 41) { migration_041(db); markDone(db, 41) }
  if (applied < 42) { migration_042(db); markDone(db, 42) }
  if (applied < 43) { migration_043(db); markDone(db, 43) }
  if (applied < 44) { migration_044(db); markDone(db, 44) }
  if (applied < 45) { migration_045(db); markDone(db, 45) }
  if (applied < 46) { migration_046(db); markDone(db, 46) }
  if (applied < 47) { migration_047(db); markDone(db, 47) }
  if (applied < 48) { migration_048(db); markDone(db, 48) }
  if (applied < 49) { migration_049(db); markDone(db, 49) }
  if (applied < 50) { migration_050(db); markDone(db, 50) }

  console.log('[DB] Migrations OK')
}

function markDone(db: Database.Database, v: number) {
  db.prepare(`INSERT INTO migrations (version) VALUES (?)`).run(v)
}

// ─────────────────────────────────────────────────────────
// Migration 001 — Tabelas base
// ─────────────────────────────────────────────────────────
function migration_001(db: Database.Database) {
  db.exec(`

    -- Empresas
    CREATE TABLE IF NOT EXISTS empresas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      cnpj        TEXT,
      email       TEXT,
      telefone    TEXT,
      endereco    TEXT,
      logo        TEXT,
      ativo       INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Contas bancárias / carteiras
    CREATE TABLE IF NOT EXISTS contas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      tipo        TEXT    NOT NULL DEFAULT 'corrente',
      banco       TEXT,
      agencia     TEXT,
      numero      TEXT,
      saldo       REAL    NOT NULL DEFAULT 0,
      ativo       INTEGER NOT NULL DEFAULT 1,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Categorias
    CREATE TABLE IF NOT EXISTS categorias (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      tipo        TEXT    NOT NULL DEFAULT 'ambos',
      cor         TEXT    NOT NULL DEFAULT '#6366f1',
      descricao   TEXT,
      ativo       INTEGER NOT NULL DEFAULT 1,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      cpf_cnpj    TEXT,
      email       TEXT,
      telefone    TEXT,
      endereco    TEXT,
      tipo        TEXT    NOT NULL DEFAULT 'pj',
      ativo       INTEGER NOT NULL DEFAULT 1,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Fornecedores
    CREATE TABLE IF NOT EXISTS fornecedores (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      cpf_cnpj    TEXT,
      email       TEXT,
      telefone    TEXT,
      endereco    TEXT,
      categoria   TEXT,
      ativo       INTEGER NOT NULL DEFAULT 1,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Lançamentos financeiros
    CREATE TABLE IF NOT EXISTS lancamentos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao      TEXT    NOT NULL,
      tipo           TEXT    NOT NULL CHECK(tipo IN ('receita','despesa')),
      valor          REAL    NOT NULL CHECK(valor > 0),
      data_venc      TEXT    NOT NULL,
      data_pgto      TEXT,
      status         TEXT    NOT NULL DEFAULT 'pendente'
                             CHECK(status IN ('pendente','pago','cancelado')),
      observacao     TEXT,
      conta_id       INTEGER REFERENCES contas(id)      ON DELETE SET NULL,
      categoria_id   INTEGER REFERENCES categorias(id)  ON DELETE SET NULL,
      cliente_id     INTEGER REFERENCES clientes(id)    ON DELETE SET NULL,
      fornecedor_id  INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 002 — Índices de performance
// ─────────────────────────────────────────────────────────
function migration_002(db: Database.Database) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lanc_empresa
      ON lancamentos(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_lanc_status
      ON lancamentos(status);

    CREATE INDEX IF NOT EXISTS idx_lanc_tipo
      ON lancamentos(tipo);

    CREATE INDEX IF NOT EXISTS idx_lanc_data_venc
      ON lancamentos(data_venc);

    CREATE INDEX IF NOT EXISTS idx_lanc_conta
      ON lancamentos(conta_id);

    CREATE INDEX IF NOT EXISTS idx_lanc_categoria
      ON lancamentos(categoria_id);

    CREATE INDEX IF NOT EXISTS idx_contas_empresa
      ON contas(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_categorias_empresa
      ON categorias(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_clientes_empresa
      ON clientes(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_fornecedores_empresa
      ON fornecedores(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 003 — Tabela de configurações
// ─────────────────────────────────────────────────────────
function migration_003(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chave       TEXT    NOT NULL,
      valor       TEXT,
      empresa_id  INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
      UNIQUE(chave, empresa_id)
    );
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 004 — Tabela de anexos
// ─────────────────────────────────────────────────────────
function migration_004(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anexos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lancamento_id  INTEGER NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      caminho        TEXT    NOT NULL,
      tamanho        INTEGER,
      mime           TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_anexos_lancamento
      ON anexos(lancamento_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 005 — Tabela de logs de auditoria
// ─────────────────────────────────────────────────────────
function migration_005(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tabela      TEXT    NOT NULL,
      registro_id INTEGER NOT NULL,
      acao        TEXT    NOT NULL CHECK(acao IN ('insert','update','delete')),
      dados_antes TEXT,
      dados_depois TEXT,
      empresa_id  INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_auditoria_tabela
      ON auditoria(tabela, registro_id);

    CREATE INDEX IF NOT EXISTS idx_auditoria_empresa
      ON auditoria(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 006 — Tabela de usuários (login/permissões)
// NOTA: esta tabela é usada por src/main/ipc/usuarios.ipc.ts
// mas nunca foi criada explicitamente na conversa original —
// adicionada aqui a partir das colunas referenciadas em
// usuarios.ipc.ts (id, empresa_id, nome, email, senha_hash,
// perfil, ativo, created_at, last_login_at).
// ─────────────────────────────────────────────────────────
function migration_006(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'operador'
                             CHECK(perfil IN ('admin','operador','visualizador')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 007 — Colaboradores (RH) + histórico de documentos
// NOVO: módulo de RH, construído a partir das planilhas de
// cadastro de colaboradores e dos 15 documentos de departamento
// pessoal enviados como referência (Ficha de EPI, Aviso Prévio,
// ASO, Advertência, Rescisão, etc.).
// ─────────────────────────────────────────────────────────
function migration_007(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS colaboradores (
      id                            INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id                    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

      -- Identificação
      nome                          TEXT    NOT NULL,
      cpf                           TEXT,
      rg                            TEXT,
      rg_orgao_emissor              TEXT,
      nascimento                    TEXT,
      estado_civil                  TEXT,
      nacionalidade                 TEXT    DEFAULT 'Brasileira',
      nome_mae                      TEXT,
      nome_pai                      TEXT,
      escolaridade                  TEXT,
      pcd                           INTEGER NOT NULL DEFAULT 0,
      foto_url                      TEXT,

      -- Contrato
      funcao                        TEXT,
      setor                         TEXT,
      equipe                        TEXT,
      tipo_contrato                 TEXT    DEFAULT 'CLT',
      data_admissao                 TEXT,
      dias_experiencia              INTEGER DEFAULT 45,
      data_vencimento_experiencia   TEXT,
      data_demissao                 TEXT,
      tipo_demissao                 TEXT,
      salario_base                  REAL,
      status                        TEXT    NOT NULL DEFAULT 'ativo'
                                             CHECK(status IN ('ativo','afastado','ferias','desligado')),

      -- Documentos trabalhistas
      ctps                          TEXT,
      ctps_serie                    TEXT,
      pis                           TEXT,

      -- Contato
      telefone                      TEXT,
      email                         TEXT,
      contato_emergencia_nome       TEXT,
      contato_emergencia_telefone   TEXT,

      -- Endereço
      endereco                      TEXT,
      numero                        TEXT,
      bairro                        TEXT,
      cidade                        TEXT,
      estado                        TEXT,
      cep                           TEXT,

      -- Dados bancários
      banco                         TEXT,
      agencia                       TEXT,
      operacao                      TEXT,
      conta                         TEXT,
      conta_digito                  TEXT,
      tipo_conta                    TEXT,

      -- Benefícios / viagem
      passagem                      TEXT,
      valor_ida_volta               REAL,
      alimentacao                   REAL,

      -- Uniforme / EPI
      tamanho_camisa                TEXT,
      tamanho_calca                 TEXT,
      numero_calcado                TEXT,

      observacoes                   TEXT,
      created_at                    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_colaboradores_empresa
      ON colaboradores(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_colaboradores_status
      ON colaboradores(status);

    CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao
      ON colaboradores(funcao);

    -- Histórico de documentos gerados por colaborador (para auditoria
    -- e para reaproveitar os últimos dados usados, como já acontece
    -- na planilha de AP com "puxar a última utilizada")
    CREATE TABLE IF NOT EXISTS colaborador_documentos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      tipo           TEXT    NOT NULL,
      dados_json      TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_colab_documentos_colaborador
      ON colaborador_documentos(colaborador_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 008 — Módulo de AP: fornecedores, campos de
// Centro de Custo na empresa (solicitante/autorizado padrão)
// e histórico de autorizações de pagamento emitidas.
// ─────────────────────────────────────────────────────────
function migration_008(db: Database.Database) {
  db.exec(`
    ALTER TABLE empresas ADD COLUMN solicitante_padrao    TEXT;
    ALTER TABLE empresas ADD COLUMN autorizado_por_padrao TEXT;

    CREATE TABLE IF NOT EXISTS fornecedores (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

      nome            TEXT    NOT NULL,
      tipo_pessoa     TEXT    NOT NULL DEFAULT 'pj' CHECK(tipo_pessoa IN ('pj','pf')),
      cnpj            TEXT,
      cpf             TEXT,
      email           TEXT,
      telefone        TEXT,
      endereco        TEXT,
      categoria       TEXT,

      forma_pagamento TEXT    NOT NULL DEFAULT 'boleto' CHECK(forma_pagamento IN ('boleto','conta')),
      banco           TEXT,
      agencia         TEXT,
      operacao        TEXT,
      conta           TEXT,
      conta_digito    TEXT,
      tipo_conta      TEXT,
      chave_pix       TEXT,

      ativo           INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_fornecedores_empresa
      ON fornecedores(empresa_id);

    -- Histórico de Autorizações de Pagamento emitidas — permite puxar
    -- automaticamente a última descrição/valor usados para o mesmo
    -- beneficiário, como na planilha original.
    CREATE TABLE IF NOT EXISTS autorizacoes_pagamento (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

      beneficiario_tipo   TEXT    NOT NULL CHECK(beneficiario_tipo IN ('fornecedor','colaborador')),
      beneficiario_id     INTEGER NOT NULL,
      beneficiario_nome   TEXT    NOT NULL,

      descricao           TEXT,
      valor               REAL    NOT NULL,
      observacoes         TEXT,
      vencimento          TEXT,
      solicitante         TEXT,
      autorizado_por      TEXT,

      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ap_empresa
      ON autorizacoes_pagamento(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_ap_beneficiario
      ON autorizacoes_pagamento(beneficiario_tipo, beneficiario_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 009 — CORREÇÃO: a tabela `fornecedores` já existia desde a
// migration_001 (schema antigo, com `cpf_cnpj` e sem os campos de
// pagamento) — o `CREATE TABLE IF NOT EXISTS` da migration_008 não fez
// nada porque a tabela já existia, deixando faltar as colunas novas
// (tipo_pessoa, cnpj, cpf, forma_pagamento, dados bancários, ativo).
// Aqui verificamos quais colunas realmente faltam e adicionamos só
// essas, preservando qualquer fornecedor já cadastrado.
// ─────────────────────────────────────────────────────────
function migration_009(db: Database.Database) {
  const colunasAtuais = new Set(
    (db.prepare(`PRAGMA table_info(fornecedores)`).all() as { name: string }[])
      .map(c => c.name)
  )

  const colunasNecessarias: [string, string][] = [
    ['tipo_pessoa',     `TEXT NOT NULL DEFAULT 'pj'`],
    ['cnpj',            'TEXT'],
    ['cpf',             'TEXT'],
    ['categoria',       'TEXT'],
    ['forma_pagamento', `TEXT NOT NULL DEFAULT 'boleto'`],
    ['banco',           'TEXT'],
    ['agencia',         'TEXT'],
    ['operacao',        'TEXT'],
    ['conta',           'TEXT'],
    ['conta_digito',    'TEXT'],
    ['tipo_conta',      'TEXT'],
    ['chave_pix',       'TEXT'],
  ]

  for (const [coluna, definicao] of colunasNecessarias) {
    if (!colunasAtuais.has(coluna)) {
      db.exec(`ALTER TABLE fornecedores ADD COLUMN ${coluna} ${definicao}`)
    }
  }

  // Migra dados antigos: se havia um cpf_cnpj preenchido (schema antigo)
  // e o novo campo cnpj/cpf ainda está vazio, copia pro campo certo
  // com base no tamanho do documento.
  if (colunasAtuais.has('cpf_cnpj')) {
    const antigos = db.prepare(
      `SELECT id, cpf_cnpj FROM fornecedores WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj != ''`
    ).all() as { id: number; cpf_cnpj: string }[]

    for (const f of antigos) {
      const digitos = f.cpf_cnpj.replace(/\D/g, '')
      if (digitos.length === 14) {
        db.prepare(`UPDATE fornecedores SET cnpj = ?, tipo_pessoa = 'pj' WHERE id = ? AND (cnpj IS NULL OR cnpj = '')`)
          .run(f.cpf_cnpj, f.id)
      } else if (digitos.length === 11) {
        db.prepare(`UPDATE fornecedores SET cpf = ?, tipo_pessoa = 'pf' WHERE id = ? AND (cpf IS NULL OR cpf = '')`)
          .run(f.cpf_cnpj, f.id)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────
// Migration 010 — Cidade/UF no cadastro da obra (Centro de Custo),
// para preencher "local" automaticamente em todos os documentos, e
// tabela de sequência para numerar recibos automaticamente.
// ─────────────────────────────────────────────────────────
function migration_010(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(empresas)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('cidade')) db.exec(`ALTER TABLE empresas ADD COLUMN cidade TEXT`)
  if (!colunas.has('estado')) db.exec(`ALTER TABLE empresas ADD COLUMN estado TEXT`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS recibos (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      beneficiario_nome  TEXT    NOT NULL,
      valor              REAL    NOT NULL,
      referente          TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recibos_empresa
      ON recibos(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 011 — Listas reutilizáveis de Função/Setor/Equipe
// (cadastradas em janela própria, selecionadas no colaborador) e
// novos campos no colaborador: título de eleitor, reservista, CNH,
// cor/raça, alojado, tem baixada.
// ─────────────────────────────────────────────────────────
function migration_011(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opcoes_colaborador (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      tipo        TEXT    NOT NULL CHECK(tipo IN ('funcao','setor','equipe')),
      nome        TEXT    NOT NULL,
      ativo       INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(empresa_id, tipo, nome)
    );

    CREATE INDEX IF NOT EXISTS idx_opcoes_colaborador_busca
      ON opcoes_colaborador(empresa_id, tipo);
  `)

  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  const novasColunas: [string, string][] = [
    ['titulo_numero',    'TEXT'],
    ['titulo_zona',      'TEXT'],
    ['titulo_secao',     'TEXT'],
    ['reservista',       'TEXT'],
    ['cnh_numero',       'TEXT'],
    ['cnh_categoria',    'TEXT'],
    ['cnh_vencimento',   'TEXT'],
    ['cor_raca',         'TEXT'],
    ['alojado',          'INTEGER NOT NULL DEFAULT 0'],
    ['tem_baixada',      'INTEGER NOT NULL DEFAULT 0'],
  ]
  for (const [coluna, definicao] of novasColunas) {
    if (!colunas.has(coluna)) {
      db.exec(`ALTER TABLE colaboradores ADD COLUMN ${coluna} ${definicao}`)
    }
  }
}

// ─────────────────────────────────────────────────────────
// Migration 012 — CORREÇÃO DEFINITIVA da logo: a tabela `empresas`
// nunca teve uma coluna `logo_url` — a migration_001 original criou a
// coluna como `logo` (nunca usada por nenhum código do app, que sempre
// leu/gravou em `logo_url`). Ou seja, o app tentava salvar e ler uma
// coluna que simplesmente não existia — por isso a logo nunca
// persistia de verdade no banco, mesmo com o upload "funcionando" na
// tela (só ficava guardado localmente na sessão, nunca no banco).
// ─────────────────────────────────────────────────────────
function migration_012(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(empresas)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('logo_url')) {
    db.exec(`ALTER TABLE empresas ADD COLUMN logo_url TEXT`)
  }
  // Se havia algo salvo na coluna antiga (improvável, nunca foi escrita
  // por nenhum código), migra para a coluna nova antes de seguir.
  if (colunas.has('logo') && colunas.has('logo_url')) {
    db.exec(`
      UPDATE empresas SET logo_url = logo
      WHERE logo IS NOT NULL AND logo != '' AND (logo_url IS NULL OR logo_url = '')
    `)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 013 — Código do colaborador (matrícula e-Social),
// preenchido manualmente no cadastro (não gerado automaticamente).
// ─────────────────────────────────────────────────────────
function migration_013(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('matricula_esocial')) {
    db.exec(`ALTER TABLE colaboradores ADD COLUMN matricula_esocial TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 014 — CORREÇÃO: a tabela `lancamentos` nunca teve a
// coluna `data` (data do lançamento) — só existiam `data_venc`
// (vencimento) e `data_pgto` (pagamento). O restante do código (tela
// de Lançamentos e os handlers de criar/editar/listar) sempre tratou
// "data" como um campo separado e obrigatório, então toda tentativa
// de listar, criar ou editar um lançamento com filtro de mês/ano
// falhava com "no such column: l.data". Adiciona a coluna que faltava
// e preenche os lançamentos já existentes com o vencimento, para não
// ficarem sem data.
// ─────────────────────────────────────────────────────────
function migration_014(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(lancamentos)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('data')) {
    db.exec(`ALTER TABLE lancamentos ADD COLUMN data TEXT`)
    db.exec(`UPDATE lancamentos SET data = data_venc WHERE data IS NULL`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 015 — Notas Fiscais: uma nota pode ter vários boletos
// (valor + vencimento), cada nota gera automaticamente uma despesa
// no Financeiro com o valor total, na data da nota.
// ─────────────────────────────────────────────────────────
function migration_015(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id       INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      numero_pedido    TEXT,
      data             TEXT    NOT NULL,
      numero_nf        TEXT,
      fornecedor_id    INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
      fornecedor_nome  TEXT    NOT NULL,
      lancamento_id    INTEGER REFERENCES lancamentos(id)  ON DELETE SET NULL,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notas_fiscais_boletos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_id     INTEGER NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
      valor       REAL    NOT NULL,
      vencimento  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notas_fiscais_empresa
      ON notas_fiscais(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_notas_fiscais_boletos_nota
      ON notas_fiscais_boletos(nota_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 016 — Autorização de Pagamento também passa a aceitar
// vários boletos (valor + vencimento), igual às Notas Fiscais — o
// mesmo fornecedor pode ter mais de um boleto numa AP só, e o valor
// total lançado como despesa é a soma de todos.
// ─────────────────────────────────────────────────────────
function migration_016(db: Database.Database) {
  const colunasAp = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunasAp.has('lancamento_id')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN lancamento_id INTEGER REFERENCES lancamentos(id) ON DELETE SET NULL`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS autorizacoes_pagamento_boletos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ap_id       INTEGER NOT NULL REFERENCES autorizacoes_pagamento(id) ON DELETE CASCADE,
      valor       REAL    NOT NULL,
      vencimento  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ap_boletos_ap
      ON autorizacoes_pagamento_boletos(ap_id);
  `)

  // As APs já emitidas antes desta atualização têm um valor e
  // vencimento únicos guardados direto na própria tabela — migra cada
  // uma para um boleto na tabela nova, assim toda AP (antiga ou nova)
  // passa a ter seus valores consultados sempre do mesmo jeito.
  const jaTemBoleto = db.prepare(`SELECT 1 FROM autorizacoes_pagamento_boletos WHERE ap_id = ?`)
  const antigas = db.prepare(`SELECT id, valor, vencimento FROM autorizacoes_pagamento`).all() as
    { id: number; valor: number; vencimento: string | null }[]
  const inserirBoleto = db.prepare(`
    INSERT INTO autorizacoes_pagamento_boletos (ap_id, valor, vencimento) VALUES (?, ?, ?)
  `)
  for (const ap of antigas) {
    if (jaTemBoleto.get(ap.id)) continue
    inserirBoleto.run(ap.id, ap.valor, ap.vencimento || new Date().toISOString().slice(0, 10))
  }
}

// ─────────────────────────────────────────────────────────
// Migration 017 — Contas a Pagar: cada boleto (de AP ou de Nota
// Fiscal) passa a ter sua PRÓPRIA despesa vinculada, em vez de uma
// única despesa somando todos os boletos. Isso permite dar baixa
// (marcar como pago) ou fazer pagamento parcial de cada boleto
// individualmente. CORRIGIDO também: a despesa nascia já como "pago"
// (só para contar em Despesas do Mês) — o que fazia toda AP/NF recém
// lançada aparecer como "Pago" mesmo sem ter sido paga de verdade.
// Agora nasce "pendente" (Situação exibida como "A vencer"/"Vencido"
// conforme a data), e o Despesas do Mês passa a somar pela data de
// EMISSÃO, incluindo pendentes e pagas (não só as já pagas).
// ─────────────────────────────────────────────────────────
function migration_017(db: Database.Database) {
  for (const tabela of ['notas_fiscais_boletos', 'autorizacoes_pagamento_boletos']) {
    const colunas = new Set(
      (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map(c => c.name)
    )
    if (!colunas.has('lancamento_id')) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN lancamento_id INTEGER REFERENCES lancamentos(id) ON DELETE SET NULL`)
    }
  }

  // Notas Fiscais: divide a despesa única (soma) em uma por boleto.
  const notas = db.prepare(`
    SELECT id, data, numero_nf, fornecedor_nome, fornecedor_id, lancamento_id
    FROM notas_fiscais WHERE lancamento_id IS NOT NULL
  `).all() as { id: number; data: string; numero_nf: string | null; fornecedor_nome: string; fornecedor_id: number | null; lancamento_id: number }[]

  const empresaDoLancamento = db.prepare(`SELECT empresa_id FROM lancamentos WHERE id = ?`)
  const inserirLancamento = db.prepare(`
    INSERT INTO lancamentos (descricao, tipo, valor, data, data_venc, status, fornecedor_id, empresa_id)
    VALUES (@descricao, 'despesa', @valor, @data, @data_venc, 'pendente', @fornecedor_id, @empresa_id)
  `)
  const vincularBoletoNf = db.prepare(`UPDATE notas_fiscais_boletos SET lancamento_id = ? WHERE id = ?`)
  const boletosDaNota = db.prepare(`
    SELECT id, valor, vencimento FROM notas_fiscais_boletos WHERE nota_id = ? AND lancamento_id IS NULL
  `)

  for (const nota of notas) {
    const empresa = empresaDoLancamento.get(nota.lancamento_id) as { empresa_id: number } | undefined
    if (!empresa) continue
    const boletos = boletosDaNota.all(nota.id) as { id: number; valor: number; vencimento: string }[]
    for (const b of boletos) {
      const result = inserirLancamento.run({
        descricao:     `NF ${nota.numero_nf ?? ''} - ${nota.fornecedor_nome}`.trim(),
        valor:         b.valor,
        data:          nota.data,
        data_venc:     b.vencimento,
        fornecedor_id: nota.fornecedor_id,
        empresa_id:    empresa.empresa_id,
      })
      vincularBoletoNf.run(result.lastInsertRowid, b.id)
    }
    db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(nota.lancamento_id)
    db.prepare(`UPDATE notas_fiscais SET lancamento_id = NULL WHERE id = ?`).run(nota.id)
  }

  // Autorizações de Pagamento: mesma divisão.
  const aps = db.prepare(`
    SELECT id, beneficiario_nome, descricao, created_at, lancamento_id
    FROM autorizacoes_pagamento WHERE lancamento_id IS NOT NULL
  `).all() as { id: number; beneficiario_nome: string; descricao: string | null; created_at: string; lancamento_id: number }[]

  const vincularBoletoAp = db.prepare(`UPDATE autorizacoes_pagamento_boletos SET lancamento_id = ? WHERE id = ?`)
  const boletosDaAp = db.prepare(`
    SELECT id, valor, vencimento FROM autorizacoes_pagamento_boletos WHERE ap_id = ? AND lancamento_id IS NULL
  `)

  for (const ap of aps) {
    const empresa = empresaDoLancamento.get(ap.lancamento_id) as { empresa_id: number } | undefined
    if (!empresa) continue
    const boletos = boletosDaAp.all(ap.id) as { id: number; valor: number; vencimento: string }[]
    for (const b of boletos) {
      const result = inserirLancamento.run({
        descricao:     `AP - ${ap.beneficiario_nome}${ap.descricao ? `: ${ap.descricao}` : ''}`,
        valor:         b.valor,
        data:          ap.created_at.slice(0, 10),
        data_venc:     b.vencimento,
        fornecedor_id: null,
        empresa_id:    empresa.empresa_id,
      })
      vincularBoletoAp.run(result.lastInsertRowid, b.id)
    }
    db.prepare(`DELETE FROM lancamentos WHERE id = ?`).run(ap.lancamento_id)
    db.prepare(`UPDATE autorizacoes_pagamento SET lancamento_id = NULL WHERE id = ?`).run(ap.id)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 018 — Guarda os caminhos dos documentos anexados a cada
// AP (nota/recibo, boletos, medição), na ordem escolhida — antes eles
// só existiam na hora de gerar o PDF juntado e se perdiam depois, sem
// nenhum jeito de reimprimir com os anexos mais tarde.
// ─────────────────────────────────────────────────────────
function migration_018(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autorizacoes_pagamento_anexos (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ap_id    INTEGER NOT NULL REFERENCES autorizacoes_pagamento(id) ON DELETE CASCADE,
      caminho  TEXT    NOT NULL,
      ordem    INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ap_anexos_ap
      ON autorizacoes_pagamento_anexos(ap_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 019 — Guarda o caminho do PDF já juntado (AP + anexos),
// salvo automaticamente numa pasta própria do programa assim que a AP
// é registrada. Assim, reimprimir depois é só abrir esse arquivo já
// pronto no leitor de PDF do Windows — sem depender do Electron
// reabrir e reimprimir um PDF internamente (o que estava dando página
// em branco).
// ─────────────────────────────────────────────────────────
function migration_019(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('pdf_path')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN pdf_path TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 020 — Almoxarifado: cadastro de produtos (com estoque
// atual e mínimo) e entradas de nota (com os itens de cada nota,
// que somam ao estoque e recalculam o valor do produto).
// ─────────────────────────────────────────────────────────
function migration_020(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      codigo          TEXT    NOT NULL,
      nome            TEXT    NOT NULL,
      descricao       TEXT,
      unidade         TEXT,
      estoque_atual   REAL    NOT NULL DEFAULT 0,
      estoque_minimo  REAL    NOT NULL DEFAULT 0,
      valor_unitario  REAL    NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_produtos_codigo
      ON produtos(empresa_id, codigo);

    CREATE TABLE IF NOT EXISTS almoxarifado_entradas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id       INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      numero_nota      TEXT,
      numero_pedido    TEXT,
      data             TEXT    NOT NULL,
      fornecedor_id    INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
      fornecedor_nome  TEXT    NOT NULL,
      valor_desconto   REAL    NOT NULL DEFAULT 0,
      valor_total      REAL    NOT NULL DEFAULT 0,
      lancamento_id    INTEGER REFERENCES lancamentos(id) ON DELETE SET NULL,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS almoxarifado_entradas_itens (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      entrada_id      INTEGER NOT NULL REFERENCES almoxarifado_entradas(id) ON DELETE CASCADE,
      produto_id      INTEGER NOT NULL REFERENCES produtos(id),
      produto_codigo  TEXT    NOT NULL,
      produto_nome    TEXT    NOT NULL,
      quantidade      REAL    NOT NULL,
      valor_unitario  REAL    NOT NULL,
      valor_total     REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_produtos_empresa
      ON produtos(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_almox_entradas_empresa
      ON almoxarifado_entradas(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_almox_entradas_itens_entrada
      ON almoxarifado_entradas_itens(entrada_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 021 — Almoxarifado: saídas de produto (retirada), e um
// cadastro simples de "pessoas avulsas" — gente que retira material
// sem ser colaborador da empresa (não entra na tabela de
// colaboradores, só nome e CPF).
// ─────────────────────────────────────────────────────────
function migration_021(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pessoas_avulsas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome        TEXT    NOT NULL,
      cpf         TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS almoxarifado_saidas (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      data                TEXT    NOT NULL,
      produto_id          INTEGER NOT NULL REFERENCES produtos(id),
      produto_codigo      TEXT    NOT NULL,
      produto_nome        TEXT    NOT NULL,
      quantidade          REAL    NOT NULL,
      retirado_por_tipo   TEXT    NOT NULL DEFAULT 'colaborador',
      retirado_por_id     INTEGER,
      retirado_por_nome   TEXT    NOT NULL,
      setor               TEXT,
      solicitado_por_id   INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
      solicitado_por_nome TEXT,
      liberado_por        TEXT,
      pdf_path            TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pessoas_avulsas_empresa
      ON pessoas_avulsas(empresa_id);

    CREATE INDEX IF NOT EXISTS idx_almox_saidas_empresa
      ON almoxarifado_saidas(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 022 — Novo esquema de perfis de acesso: admin (ADM),
// gestor (GESTOR/engenheiro) e almoxarife (ALMOXARIFADO), no lugar
// de admin/operador/visualizador. SQLite não permite alterar um
// CHECK direto, então a tabela é recriada preservando os usuários —
// quem já era 'admin' continua 'admin'; 'operador' e 'visualizador'
// (perfis com menos acesso que admin) viram 'gestor', o mais próximo
// em nível de acesso dentro do novo esquema.
// ─────────────────────────────────────────────────────────
function migration_022(db: Database.Database) {
  db.exec(`
    CREATE TABLE usuarios_novo (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'gestor'
                             CHECK(perfil IN ('admin','gestor','almoxarife')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    INSERT INTO usuarios_novo (id, empresa_id, nome, email, senha_hash, perfil, ativo, created_at, last_login_at)
    SELECT id, empresa_id, nome, email, senha_hash,
      CASE WHEN perfil = 'admin' THEN 'admin' ELSE 'gestor' END,
      ativo, created_at, last_login_at
    FROM usuarios;

    DROP TABLE usuarios;
    ALTER TABLE usuarios_novo RENAME TO usuarios;

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 023 — Aprovação de AP: guarda quem aprovou e quando, pra
// carimbar no documento ("Aprovado por Fulano em dd/mm/aaaa às hh:mm")
// e mostrar o status na listagem. O GESTOR (engenheiro) é quem
// aprova; a AP nasce sem aprovação, até alguém autorizar.
// ─────────────────────────────────────────────────────────
function migration_023(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('aprovado_por')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN aprovado_por TEXT`)
  }
  if (!colunas.has('aprovado_em')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN aprovado_em TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 024 — Permissões extras por usuário (Opção A escolhida):
// os três perfis (admin/gestor/almoxarife) continuam definindo o
// acesso padrão, mas o ADM pode liberar páginas extras pra um
// usuário específico, além do que o perfil dele já dá.
// ─────────────────────────────────────────────────────────
function migration_024(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuario_permissoes_extras (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      chave        TEXT    NOT NULL,
      UNIQUE(usuario_id, chave)
    );

    CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_extras_usuario
      ON usuario_permissoes_extras(usuario_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 025 — Notificações por evento (AP criada/aprovada,
// entrada/saída de almoxarifado) — diferente das notificações de
// estado (aniversariante, experiência vencendo, estoque baixo), que
// continuam calculadas na hora, essas precisam ser guardadas porque
// representam um acontecimento pontual (senão toda AP já existente
// pareceria "nova" pra sempre).
// ─────────────────────────────────────────────────────────
function migration_025(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notificacoes_eventos (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id            INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      tipo                  TEXT    NOT NULL,
      destinatario_perfil   TEXT    NOT NULL,
      titulo                TEXT    NOT NULL,
      mensagem              TEXT,
      lida                  INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notificacoes_eventos_busca
      ON notificacoes_eventos(empresa_id, destinatario_perfil, lida);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 026 — Notas Fiscais: anexos separados por categoria (a
// nota física em si, e o(s) boleto(s) — cada um vira seu próprio PDF
// juntado, não um documento único como a AP), mais o mesmo fluxo de
// aprovação do Gestor que a AP já tem.
// ─────────────────────────────────────────────────────────
function migration_026(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notas_fiscais_anexos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nota_id   INTEGER NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
      caminho   TEXT    NOT NULL,
      categoria TEXT    NOT NULL CHECK(categoria IN ('nota','boleto')),
      ordem     INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nf_anexos_nota
      ON notas_fiscais_anexos(nota_id);
  `)

  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(notas_fiscais)`).all() as { name: string }[]).map(c => c.name)
  )
  const adicionar = (coluna: string, tipo: string) => {
    if (!colunas.has(coluna)) db.exec(`ALTER TABLE notas_fiscais ADD COLUMN ${coluna} ${tipo}`)
  }
  adicionar('nota_pdf_path', 'TEXT')
  adicionar('boletos_pdf_path', 'TEXT')
  adicionar('aprovado_por', 'TEXT')
  adicionar('aprovado_em', 'TEXT')
}

// ─────────────────────────────────────────────────────────
// Migration 027 — Perfil Supervisor: responde por várias obras (ao
// contrário do Gestor, que responde só pela dele). Guarda quais
// obras cada supervisor acompanha (supervisor_obras), e introduz o
// conceito de "lote" — um pacote de APs e Notas Fiscais de uma obra,
// num período, que o ADM monta e envia pra aprovação do supervisor
// (mesma "vaga" de aprovação que a AP/NF já tem — só que quem assina
// nesse caso é o Supervisor, no lugar do Gestor).
// ─────────────────────────────────────────────────────────
function migration_027(db: Database.Database) {
  // Perfil: mesma recriação de tabela usada antes (SQLite não deixa
  // alterar um CHECK direto), agora incluindo 'supervisor'.
  db.exec(`
    CREATE TABLE usuarios_novo_027 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'gestor'
                             CHECK(perfil IN ('admin','gestor','almoxarife','supervisor')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    INSERT INTO usuarios_novo_027
      SELECT id, empresa_id, nome, email, senha_hash, perfil, ativo, created_at, last_login_at
      FROM usuarios;

    DROP TABLE usuarios;
    ALTER TABLE usuarios_novo_027 RENAME TO usuarios;

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);

    -- Quais obras cada supervisor acompanha.
    CREATE TABLE IF NOT EXISTS supervisor_obras (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      UNIQUE(usuario_id, empresa_id)
    );

    CREATE INDEX IF NOT EXISTS idx_supervisor_obras_usuario
      ON supervisor_obras(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_supervisor_obras_empresa
      ON supervisor_obras(empresa_id);

    -- Lote: "Programação Financeira (obra) de X a Y" — o ADM monta,
    -- reunindo AP's e Notas Fiscais daquele período, e envia pro
    -- Supervisor aprovar.
    CREATE TABLE IF NOT EXISTS lotes_financeiros (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id   INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      titulo       TEXT    NOT NULL,
      data_inicio  TEXT    NOT NULL,
      data_fim     TEXT    NOT NULL,
      criado_por   TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_lotes_financeiros_empresa
      ON lotes_financeiros(empresa_id);
  `)

  // AP e NF passam a poder pertencer a um lote.
  const colunasAp = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunasAp.has('lote_id')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN lote_id INTEGER REFERENCES lotes_financeiros(id) ON DELETE SET NULL`)
  }
  const colunasNf = new Set(
    (db.prepare(`PRAGMA table_info(notas_fiscais)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunasNf.has('lote_id')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN lote_id INTEGER REFERENCES lotes_financeiros(id) ON DELETE SET NULL`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 028 — A aprovação do Supervisor passa a ser um carimbo
// PRÓPRIO, separado do carimbo do Gestor (aprovado_por/aprovado_em) —
// assim os dois podem existir ao mesmo tempo no mesmo documento, sem
// um apagar o outro. Também guarda uma referência (ex: o id do lote)
// junto da notificação, pra poder levar direto pro lugar certo ao
// clicar nela.
// ─────────────────────────────────────────────────────────
function migration_028(db: Database.Database) {
  const adicionarSeFaltar = (tabela: string, coluna: string, tipo: string) => {
    const colunas = new Set(
      (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map(c => c.name)
    )
    if (!colunas.has(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`)
  }

  adicionarSeFaltar('autorizacoes_pagamento', 'aprovado_supervisor_por', 'TEXT')
  adicionarSeFaltar('autorizacoes_pagamento', 'aprovado_supervisor_em', 'TEXT')
  adicionarSeFaltar('notas_fiscais', 'aprovado_supervisor_por', 'TEXT')
  adicionarSeFaltar('notas_fiscais', 'aprovado_supervisor_em', 'TEXT')
  adicionarSeFaltar('notificacoes_eventos', 'referencia_id', 'INTEGER')
}

// ─────────────────────────────────────────────────────────
// Migration 029 — Perfil Escritório Central: um nível acima do
// Supervisor. Não acompanha obras diretamente — acompanha VÁRIOS
// supervisores, e dentro de cada um, as obras dele. Terceira "vaga"
// de assinatura (aprovado_central_por/em), separada das outras duas.
// ─────────────────────────────────────────────────────────
function migration_029(db: Database.Database) {
  db.exec(`
    CREATE TABLE usuarios_novo_029 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'gestor'
                             CHECK(perfil IN ('admin','gestor','almoxarife','supervisor','central')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    INSERT INTO usuarios_novo_029
      SELECT id, empresa_id, nome, email, senha_hash, perfil, ativo, created_at, last_login_at
      FROM usuarios;

    DROP TABLE usuarios;
    ALTER TABLE usuarios_novo_029 RENAME TO usuarios;

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);
  `)

  const adicionarSeFaltar = (tabela: string, coluna: string, tipo: string) => {
    const colunas = new Set(
      (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map(c => c.name)
    )
    if (!colunas.has(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`)
  }
  adicionarSeFaltar('autorizacoes_pagamento', 'aprovado_central_por', 'TEXT')
  adicionarSeFaltar('autorizacoes_pagamento', 'aprovado_central_em', 'TEXT')
  adicionarSeFaltar('notas_fiscais', 'aprovado_central_por', 'TEXT')
  adicionarSeFaltar('notas_fiscais', 'aprovado_central_em', 'TEXT')
}

// ─────────────────────────────────────────────────────────
// Migration 030 — Perfil Administrador Master: autoridade total
// sobre o sistema inteiro — cadastra qualquer tipo de usuário (ADM,
// Gestor, Almoxarife, Supervisor, Escritório Central, ou outro
// Master), enxerga tudo em todas as obras, mas não participa do
// fluxo de aprovação de AP/Nota (isso é papel de Gestor/Supervisor/
// Central). Chamado de "master" no banco pra não colidir com o
// perfil "admin" (que é por obra).
// ─────────────────────────────────────────────────────────
function migration_030(db: Database.Database) {
  db.exec(`
    CREATE TABLE usuarios_novo_030 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'gestor'
                             CHECK(perfil IN ('admin','gestor','almoxarife','supervisor','central','master')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    INSERT INTO usuarios_novo_030
      SELECT id, empresa_id, nome, email, senha_hash, perfil, ativo, created_at, last_login_at
      FROM usuarios;

    DROP TABLE usuarios;
    ALTER TABLE usuarios_novo_030 RENAME TO usuarios;

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 031 — ADM, Gestor e Almoxarife também podem administrar
// mais de uma obra, do mesmo jeito que o Supervisor já fazia (tabela
// separada, não mexe em supervisor_obras). Quando esse usuário não
// tiver nenhuma linha aqui, o sistema cai de volta pra obra "dona" do
// cadastro dele (usuarios.empresa_id) — ninguém que administra uma
// obra só percebe diferença nenhuma.
// ─────────────────────────────────────────────────────────
function migration_031(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuario_obras (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      UNIQUE(usuario_id, empresa_id)
    );

    CREATE INDEX IF NOT EXISTS idx_usuario_obras_usuario
      ON usuario_obras(usuario_id);
    CREATE INDEX IF NOT EXISTS idx_usuario_obras_empresa
      ON usuario_obras(empresa_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 032 — Segundo campo de data na Nota Fiscal: a data em
// que a nota fiscal FÍSICA foi emitida (pode ser diferente da data
// de emissão do documento/pedido, que já existia). Só informativa —
// não entra no filtro de período da tela, que continua usando a
// data que já existia.
// ─────────────────────────────────────────────────────────
function migration_032(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(notas_fiscais)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('data_emissao_nf')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN data_emissao_nf TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 033 — CORRIGIDO: colaboradores importados via planilha
// Excel nunca tinham o "Vencimento da experiência" calculado — esse
// campo só era calculado no formulário de cadastro/edição individual
// (data de admissão + dias de experiência), e a importação em massa
// não passava por ali. Resultado: quem foi cadastrado por
// importação sumia do relatório de Vencimento de Experiência e da
// notificação do sino, mesmo com a data de admissão e os dias de
// experiência certos no cadastro. Essa migration recalcula pra trás,
// pra quem já está assim no banco (a importação em si também foi
// corrigida, pra não voltar a acontecer com quem for importado
// daqui pra frente).
// ─────────────────────────────────────────────────────────
function migration_033(db: Database.Database) {
  db.exec(`
    UPDATE colaboradores
    SET data_vencimento_experiencia = date(data_admissao, '+' || (dias_experiencia - 1) || ' days')
    WHERE (data_vencimento_experiencia IS NULL OR data_vencimento_experiencia = '')
      AND data_admissao IS NOT NULL AND data_admissao != ''
      AND dias_experiencia IS NOT NULL
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 034 — NOVO: campos que faltavam pra gerar a Ficha de
// Registro do Empregado (documento novo, modelo padrão trabalhista):
//
// - empresas.razao_social — a razão social de verdade (a que casa
//   com o CNPJ), diferente do nome da obra (que é só uma forma de
//   organizar/identificar a obra internamente, não o nome jurídico
//   da empresa registrada naquele CNPJ).
// - colaboradores.sexo, .naturalidade, .cbo, .rg_data_emissao,
//   .ctps_data_expedicao, .ctps_uf — dados pessoais/contratuais que
//   o cadastro ainda não tinha campo próprio.
// ─────────────────────────────────────────────────────────
function migration_034(db: Database.Database) {
  const colunasEmpresas = new Set(
    (db.prepare(`PRAGMA table_info(empresas)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunasEmpresas.has('razao_social')) {
    db.exec(`ALTER TABLE empresas ADD COLUMN razao_social TEXT`)
  }

  const colunasColaboradores = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  const novasColunas = [
    'sexo', 'naturalidade', 'cbo', 'rg_data_emissao', 'ctps_data_expedicao', 'ctps_uf',
  ]
  for (const coluna of novasColunas) {
    if (!colunasColaboradores.has(coluna)) {
      db.exec(`ALTER TABLE colaboradores ADD COLUMN ${coluna} TEXT`)
    }
  }
}

// ─────────────────────────────────────────────────────────
// Migration 035 — Perfil SETOR PESSOAL: recebe do ADM de qualquer
// obra as solicitações de admissão, desligamento, alteração salarial
// e outras movimentações; processa no DP e devolve os documentos
// prontos pro ADM imprimir, colher assinatura e arquivar. Não é
// preso a uma obra (igual Central/Master) — enxerga as solicitações
// de todas.
//
// - usuarios: novo valor 'setor_pessoal' no CHECK de perfil (recria
//   a tabela, mesmo padrão já usado pra 'supervisor'/'central'/'master').
// - solicitacoes_pessoal: uma solicitação por vez (tipo, status,
//   quem pediu, quem respondeu, observações de cada lado).
// - solicitacoes_pessoal_anexos: os arquivos de cada lado (o que o
//   ADM manda junto do pedido, o que o Setor Pessoal manda de volta).
// - colaboradores_anexos: anexos soltos no cadastro do colaborador
//   (ex: certidão de nascimento de filho) — não depende de uma
//   solicitação existir.
// ─────────────────────────────────────────────────────────
function migration_035(db: Database.Database) {
  db.exec(`
    CREATE TABLE usuarios_novo_035 (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      nome           TEXT    NOT NULL,
      email          TEXT    NOT NULL,
      senha_hash     TEXT    NOT NULL,
      perfil         TEXT    NOT NULL DEFAULT 'gestor'
                             CHECK(perfil IN ('admin','gestor','almoxarife','supervisor','central','master','setor_pessoal')),
      ativo          INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      last_login_at  TEXT,
      UNIQUE(email, empresa_id)
    );

    INSERT INTO usuarios_novo_035
      SELECT id, empresa_id, nome, email, senha_hash, perfil, ativo, created_at, last_login_at
      FROM usuarios;

    DROP TABLE usuarios;
    ALTER TABLE usuarios_novo_035 RENAME TO usuarios;

    CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
      ON usuarios(empresa_id);

    CREATE TABLE IF NOT EXISTS solicitacoes_pessoal (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      colaborador_id      INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      tipo                TEXT    NOT NULL CHECK(tipo IN ('admissao','desligamento','alteracao_salarial','outro')),
      status              TEXT    NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','respondido','concluido')),
      observacoes         TEXT,
      solicitado_por      TEXT    NOT NULL,
      solicitado_em       TEXT    NOT NULL DEFAULT (datetime('now')),
      resposta_observacoes TEXT,
      respondido_por      TEXT,
      respondido_em       TEXT,
      concluido_em        TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_solicitacoes_pessoal_empresa
      ON solicitacoes_pessoal(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_pessoal_colaborador
      ON solicitacoes_pessoal(colaborador_id);
    CREATE INDEX IF NOT EXISTS idx_solicitacoes_pessoal_status
      ON solicitacoes_pessoal(status);

    CREATE TABLE IF NOT EXISTS solicitacoes_pessoal_anexos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id  INTEGER NOT NULL REFERENCES solicitacoes_pessoal(id) ON DELETE CASCADE,
      caminho         TEXT    NOT NULL,
      nome            TEXT    NOT NULL,
      origem          TEXT    NOT NULL CHECK(origem IN ('adm','setor_pessoal')),
      ordem           INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_solic_pessoal_anexos_solicitacao
      ON solicitacoes_pessoal_anexos(solicitacao_id);

    CREATE TABLE IF NOT EXISTS colaboradores_anexos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id  INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
      caminho         TEXT    NOT NULL,
      nome            TEXT    NOT NULL,
      descricao       TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_colaboradores_anexos_colaborador
      ON colaboradores_anexos(colaborador_id);
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 036 — NOVO: "Título da Obra" — nome comercial/de
// divulgação do empreendimento (ex: "Residencial Top Life"),
// diferente do "Nome da obra" (organização interna) e da "Razão
// Social" (nome jurídico do CNPJ). Usado nas caixas do Painel
// Supervisor repaginado.
// ─────────────────────────────────────────────────────────
function migration_036(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(empresas)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('titulo_obra')) {
    db.exec(`ALTER TABLE empresas ADD COLUMN titulo_obra TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 037 — NOVO: recuperação de senha por e-mail (código de
// 6 dígitos, expira em 15 min) e a configuração do servidor de
// e-mail (SMTP) que envia esse código — uma linha só, cadastrada
// pelo Administrador Master.
// ─────────────────────────────────────────────────────────
function migration_037(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recuperacao_senha (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      codigo      TEXT    NOT NULL,
      expira_em   TEXT    NOT NULL,
      usado       INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_recuperacao_senha_usuario
      ON recuperacao_senha(usuario_id);

    -- Uma linha só (id sempre 1) — configuração do servidor SMTP que
    -- manda o e-mail de recuperação. A senha do e-mail fica aqui em
    -- texto puro, no mesmo nível de proteção do resto do banco local
    -- (igual outros dados sensíveis já guardados no sistema).
    CREATE TABLE IF NOT EXISTS configuracoes_email (
      id               INTEGER PRIMARY KEY CHECK (id = 1),
      smtp_host        TEXT,
      smtp_porta       INTEGER,
      smtp_usuario     TEXT,
      smtp_senha       TEXT,
      smtp_seguro      INTEGER NOT NULL DEFAULT 1,
      remetente_nome   TEXT,
      remetente_email  TEXT,
      updated_at       TEXT
    );
  `)
}

// ─────────────────────────────────────────────────────────
// Migration 038 — Almoxarifado: fornecedor no cadastro do material/
// ferramenta (não tinha), e os campos de aluguel (marcar "Alugado"
// abre valor do aluguel, período de cobrança e vencimento) — usados
// no relatório novo de Alugados na tela Estoque.
// ─────────────────────────────────────────────────────────
function migration_038(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(produtos)`).all() as { name: string }[]).map(c => c.name)
  )
  const adicionar: [string, string][] = [
    ['fornecedor_id',      'INTEGER REFERENCES fornecedores(id)'],
    ['alugado',            "INTEGER NOT NULL DEFAULT 0"],
    ['valor_aluguel',      'REAL'],
    ['aluguel_periodo',    'TEXT'],
    ['aluguel_vencimento', 'TEXT'],
  ]
  for (const [coluna, tipo] of adicionar) {
    if (!colunas.has(coluna)) db.exec(`ALTER TABLE produtos ADD COLUMN ${coluna} ${tipo}`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 039 — Acessos extras deixa de ser só "liberar a mais":
// a mesma tabela agora também guarda "negado" — o Administrador
// consegue tirar de um usuário até uma página que o perfil dele
// já dava por padrão, não só adicionar.
// ─────────────────────────────────────────────────────────
function migration_039(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(usuario_permissoes_extras)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('negada')) {
    db.exec(`ALTER TABLE usuario_permissoes_extras ADD COLUMN negada INTEGER NOT NULL DEFAULT 0`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 040 — "Fechar Lote" deixa de ser a mesma coisa que
// "Enviar pro Supervisor": o ADM organiza as AP's/Notas num lote
// primeiro (só agrupa, na mesma obra, o lote vai crescendo conforme
// mais itens entram), e manda pro Supervisor quando quiser, depois.
// `enviado_em` NULL = lote fechado mas ainda não enviado; preenchido
// = já foi mandado (mesmo comportamento de sempre a partir daí).
// ─────────────────────────────────────────────────────────
function migration_040(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(lotes_financeiros)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('enviado_em')) {
    db.exec(`ALTER TABLE lotes_financeiros ADD COLUMN enviado_em TEXT`)
    // Lotes que já existiam antes dessa migration já foram todos
    // enviados (era o único jeito de criar um lote até agora) — marca
    // com a data de criação, pra não sumir/virar "aberto" à toa.
    db.exec(`UPDATE lotes_financeiros SET enviado_em = created_at WHERE enviado_em IS NULL`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 041 — Lotes deixam de ser nomeados pela data de emissão
// e passam a ter um número sequencial por obra ("Lote 01", "Lote
// 02"...). Lotes antigos (de antes dessa mudança) ficam como estão,
// com o título baseado em data que já tinham — só os novos usam
// número.
// ─────────────────────────────────────────────────────────
function migration_041(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(lotes_financeiros)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('numero')) {
    db.exec(`ALTER TABLE lotes_financeiros ADD COLUMN numero INTEGER`)
  }
}

// ─────────────────────────────────────────────────────────
// Migration 042 — carimbo de assinatura vira imagem: cada usuário
// (ADM/Gestor/Supervisor) pode subir a própria imagem de carimbo, em
// vez do carimbo de texto gerado pelo sistema. Pra saber de quem é o
// carimbo na hora de gerar o PDF, as aprovações passam a guardar
// também o usuario_id de quem aprovou (além do nome, que continua
// existindo pra não quebrar nada que já lia esse campo).
// ─────────────────────────────────────────────────────────
function migration_042(db: Database.Database) {
  const colunasUsuarios = new Set(
    (db.prepare(`PRAGMA table_info(usuarios)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunasUsuarios.has('carimbo_url')) {
    db.exec(`ALTER TABLE usuarios ADD COLUMN carimbo_url TEXT`)
  }

  for (const tabela of ['autorizacoes_pagamento', 'notas_fiscais']) {
    const colunas = new Set(
      (db.prepare(`PRAGMA table_info(${tabela})`).all() as { name: string }[]).map(c => c.name)
    )
    if (!colunas.has('aprovado_por_usuario_id')) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN aprovado_por_usuario_id INTEGER REFERENCES usuarios(id)`)
    }
    if (!colunas.has('aprovado_supervisor_por_usuario_id')) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN aprovado_supervisor_por_usuario_id INTEGER REFERENCES usuarios(id)`)
    }
  }
}

// ─────────────────────────────────────────────────────────
// migration_043 — Acréscimo na Entrada de Almoxarifado, além do
// desconto que já existia (pedido do usuário).
// ─────────────────────────────────────────────────────────
function migration_043(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(almoxarifado_entradas)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('valor_acrescimo')) {
    db.exec(`ALTER TABLE almoxarifado_entradas ADD COLUMN valor_acrescimo REAL NOT NULL DEFAULT 0`)
  }
}

// ─────────────────────────────────────────────────────────
// migration_044 — Categoria no cadastro de Material/Ferramenta
// (pedido do usuário, pra filtrar por categoria no Painel Inicial).
// ─────────────────────────────────────────────────────────
function migration_044(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(produtos)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('categoria')) {
    db.exec(`ALTER TABLE produtos ADD COLUMN categoria TEXT`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(empresa_id, categoria)`)
  }
}

// ─────────────────────────────────────────────────────────
// migration_045 — Saída do Almoxarifado passa a aceitar vários
// materiais/ferramentas de uma vez, igual já era a Entrada (antes só
// dava pra dar saída de um item por vez). Usa "recriar tabela" em vez
// de DROP COLUMN — mais portável entre versões do SQLite.
// ─────────────────────────────────────────────────────────
function migration_045(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(almoxarifado_saidas)`).all() as { name: string }[]).map(c => c.name)
  )
  // Se "produto_id" não existe mais na tabela, essa migration já rodou.
  if (!colunas.has('produto_id')) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS almoxarifado_saidas_itens (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      saida_id        INTEGER NOT NULL REFERENCES almoxarifado_saidas(id) ON DELETE CASCADE,
      produto_id      INTEGER NOT NULL REFERENCES produtos(id),
      produto_codigo  TEXT    NOT NULL,
      produto_nome    TEXT    NOT NULL,
      quantidade      REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_almox_saidas_itens_saida
      ON almoxarifado_saidas_itens(saida_id);

    CREATE TABLE almoxarifado_saidas_novo (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
      data                TEXT    NOT NULL,
      retirado_por_tipo   TEXT    NOT NULL DEFAULT 'colaborador',
      retirado_por_id     INTEGER,
      retirado_por_nome   TEXT    NOT NULL,
      setor               TEXT,
      solicitado_por_id   INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
      solicitado_por_nome TEXT,
      liberado_por        TEXT,
      pdf_path            TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  // Migra o que já existir (fica pra trás na tabela antiga, cada
  // linha existente vira uma saída com 1 item na tabela nova de itens).
  const existentes = db.prepare(`SELECT * FROM almoxarifado_saidas`).all() as Record<string, unknown>[]
  const inserirCabecalho = db.prepare(`
    INSERT INTO almoxarifado_saidas_novo
      (id, empresa_id, data, retirado_por_tipo, retirado_por_id, retirado_por_nome, setor,
       solicitado_por_id, solicitado_por_nome, liberado_por, pdf_path, created_at)
    VALUES
      (@id, @empresa_id, @data, @retirado_por_tipo, @retirado_por_id, @retirado_por_nome, @setor,
       @solicitado_por_id, @solicitado_por_nome, @liberado_por, @pdf_path, @created_at)
  `)
  const inserirItem = db.prepare(`
    INSERT INTO almoxarifado_saidas_itens (saida_id, produto_id, produto_codigo, produto_nome, quantidade)
    VALUES (@saida_id, @produto_id, @produto_codigo, @produto_nome, @quantidade)
  `)
  for (const linha of existentes) {
    inserirCabecalho.run(linha)
    inserirItem.run({
      saida_id: linha.id, produto_id: linha.produto_id, produto_codigo: linha.produto_codigo,
      produto_nome: linha.produto_nome, quantidade: linha.quantidade,
    })
  }

  db.exec(`
    DROP TABLE almoxarifado_saidas;
    ALTER TABLE almoxarifado_saidas_novo RENAME TO almoxarifado_saidas;
  `)
}

// ─────────────────────────────────────────────────────────
// migration_046 — Data de emissão editável na AP (antes só existia
// created_at, hora técnica do registro no banco, sem dar pra ajustar).
// ─────────────────────────────────────────────────────────
function migration_046(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('data_emissao')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento ADD COLUMN data_emissao TEXT`)
    db.exec(`UPDATE autorizacoes_pagamento SET data_emissao = date(created_at) WHERE data_emissao IS NULL`)
  }
}

// ─────────────────────────────────────────────────────────
// migration_047 — Código/matrícula do colaborador (pedido do
// usuário, pra aparecer no Comunicado de Dispensa ao Setor Pessoal).
// Sequencial por empresa, gerado automático — mesma lógica de código
// já usada em produtos do Almoxarifado.
// ─────────────────────────────────────────────────────────
function migration_047(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('codigo')) {
    db.exec(`ALTER TABLE colaboradores ADD COLUMN codigo TEXT`)

    // Preenche quem já existe com um código sequencial (por empresa,
    // seguindo a ordem de cadastro) — assim ninguém fica sem código.
    const empresas = db.prepare(`SELECT DISTINCT empresa_id FROM colaboradores`).all() as { empresa_id: number }[]
    const atualizarCodigo = db.prepare(`UPDATE colaboradores SET codigo = ? WHERE id = ?`)
    for (const { empresa_id } of empresas) {
      const colaboradoresDaEmpresa = db.prepare(
        `SELECT id FROM colaboradores WHERE empresa_id = ? ORDER BY id ASC`
      ).all(empresa_id) as { id: number }[]
      colaboradoresDaEmpresa.forEach((c, i) => {
        atualizarCodigo.run(String(i + 1).padStart(4, '0'), c.id)
      })
    }
  }
}

// ─────────────────────────────────────────────────────────
// migration_048 — Marca se um anexo da AP também recebe o carimbo de
// aprovação (pedido do usuário: assinar a AP e a Nota Fiscal/boletim
// de medição anexado junto, no mesmo carimbo).
// ─────────────────────────────────────────────────────────
function migration_048(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(autorizacoes_pagamento_anexos)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('vai_assinatura')) {
    db.exec(`ALTER TABLE autorizacoes_pagamento_anexos ADD COLUMN vai_assinatura INTEGER NOT NULL DEFAULT 0`)
  }
}

// ─────────────────────────────────────────────────────────
// migration_049 — Período de trabalho (em dias) até a próxima
// baixada, e a data calculada de vencimento — mesmo padrão de
// dias_experiencia/data_vencimento_experiencia, que já existe.
// ─────────────────────────────────────────────────────────
function migration_049(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('dias_periodo_baixada')) {
    db.exec(`ALTER TABLE colaboradores ADD COLUMN dias_periodo_baixada INTEGER`)
  }
  if (!colunas.has('data_vencimento_baixada')) {
    db.exec(`ALTER TABLE colaboradores ADD COLUMN data_vencimento_baixada TEXT`)
  }
}

// ─────────────────────────────────────────────────────────
// migration_050 — Data que serve de base pro cálculo da baixada (nem
// sempre é a mesma da admissão) — editável, só pré-preenchida com a
// admissão como sugestão na tela.
// ─────────────────────────────────────────────────────────
function migration_050(db: Database.Database) {
  const colunas = new Set(
    (db.prepare(`PRAGMA table_info(colaboradores)`).all() as { name: string }[]).map(c => c.name)
  )
  if (!colunas.has('data_inicio_baixada')) {
    db.exec(`ALTER TABLE colaboradores ADD COLUMN data_inicio_baixada TEXT`)
  }
}
