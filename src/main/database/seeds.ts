import Database from 'better-sqlite3'

export function runSeeds(db: Database.Database): void {

  // Só roda se não houver empresas cadastradas
  const count = (db.prepare(
    `SELECT COUNT(*) as total FROM empresas`
  ).get() as { total: number }).total

  if (count > 0) return

  console.log('[DB] Rodando seeds iniciais...')

  // ── Empresa padrão ────────────────────────────────────
  const empresa = db.prepare(`
    INSERT INTO empresas (nome, cnpj, email, telefone)
    VALUES (?, ?, ?, ?)
  `).run('Minha Empresa', '00.000.000/0001-00', 'contato@minhaempresa.com', '(11) 99999-0000')

  const eid = empresa.lastInsertRowid as number

  // ── Conta corrente padrão ─────────────────────────────
  db.prepare(`
    INSERT INTO contas (nome, tipo, banco, saldo, empresa_id)
    VALUES (?, ?, ?, ?, ?)
  `).run('Conta Principal', 'corrente', 'Banco do Brasil', 0, eid)

  db.prepare(`
    INSERT INTO contas (nome, tipo, saldo, empresa_id)
    VALUES (?, ?, ?, ?)
  `).run('Caixa', 'caixa', 0, eid)

  // ── Categorias padrão — Despesas ──────────────────────
  const categoriasDespesa = [
    { nome: 'Aluguel',        cor: '#ef4444' },
    { nome: 'Salários',       cor: '#f97316' },
    { nome: 'Fornecedores',   cor: '#eab308' },
    { nome: 'Marketing',      cor: '#8b5cf6' },
    { nome: 'Impostos',       cor: '#ec4899' },
    { nome: 'Utilidades',     cor: '#06b6d4' },
    { nome: 'TI / Software',  cor: '#3b82f6' },
    { nome: 'Outros',         cor: '#6b7280' },
  ]

  for (const cat of categoriasDespesa) {
    db.prepare(`
      INSERT INTO categorias (nome, tipo, cor, empresa_id)
      VALUES (?, 'despesa', ?, ?)
    `).run(cat.nome, cat.cor, eid)
  }

  // ── Categorias padrão — Receitas ──────────────────────
  const categoriasReceita = [
    { nome: 'Vendas',          cor: '#10b981' },
    { nome: 'Serviços',        cor: '#22c55e' },
    { nome: 'Consultoria',     cor: '#84cc16' },
    { nome: 'Assinaturas',     cor: '#14b8a6' },
    { nome: 'Investimentos',   cor: '#0ea5e9' },
    { nome: 'Outras Receitas', cor: '#a855f7' },
  ]

  for (const cat of categoriasReceita) {
    db.prepare(`
      INSERT INTO categorias (nome, tipo, cor, empresa_id)
      VALUES (?, 'receita', ?, ?)
    `).run(cat.nome, cat.cor, eid)
  }

  // ── Configurações padrão ──────────────────────────────
  const configs = [
    { chave: 'tema',          valor: 'dark'  },
    { chave: 'moeda',         valor: 'BRL'   },
    { chave: 'idioma',        valor: 'pt-BR' },
    { chave: 'alerta_venc',   valor: '3'     }, // dias antes
    { chave: 'empresa_ativa', valor: String(eid) },
  ]

  for (const cfg of configs) {
    db.prepare(`
      INSERT OR IGNORE INTO configuracoes (chave, valor, empresa_id)
      VALUES (?, ?, ?)
    `).run(cfg.chave, cfg.valor, eid)
  }

  console.log('[DB] Seeds concluídos.')
}
