import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider, getSupabase } from '../supabase/client'

// NOVO: módulo "Obra" — Estrutura Analítica (EAP). Cada item tem um
// valor orçado (R$); o peso (%) é sempre CALCULADO na tela a partir
// disso, nunca gravado no banco — evita a EAP "desalinhar" se algum
// valor for editado depois. Existe um "modelo padrão" (empresa_id
// nulo), clonável pra dentro de qualquer obra.

interface ItemPayload {
  id?:                    number
  empresa_id:             number | null
  parent_id:              number | null
  nome:                   string
  valor_orcado:           number
  unidade_medida:         string | null
  ordem:                  number
  data_inicio_prevista?:  string | null
  data_fim_prevista?:     string | null
}

export function registerObraEapIpc() {
  if (getDatabaseProvider() === 'supabase') {
    registerSupabase()
    return
  }
  registerSqlite()
}

// ── SQLite (fallback local/dev) ──────────────────────────
function registerSqlite() {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS obra_eap_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER,
      parent_id INTEGER,
      nome TEXT NOT NULL,
      valor_orcado REAL NOT NULL DEFAULT 0,
      unidade_medida TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      data_inicio_prevista TEXT,
      data_fim_prevista TEXT
    );
  `)
  // Garante as colunas novas mesmo em bancos locais já existentes
  // (criados antes dessa correção).
  try { db.exec(`ALTER TABLE obra_eap_itens ADD COLUMN data_inicio_prevista TEXT`) } catch { /* já existe */ }
  try { db.exec(`ALTER TABLE obra_eap_itens ADD COLUMN data_fim_prevista TEXT`) } catch { /* já existe */ }

  ipcMain.handle('obraEap:listar', (_e, empresa_id: number) => {
    return db.prepare(`SELECT * FROM obra_eap_itens WHERE empresa_id = ? ORDER BY ordem ASC, id ASC`).all(empresa_id)
  })

  ipcMain.handle('obraEap:listarModelo', () => {
    return db.prepare(`SELECT * FROM obra_eap_itens WHERE empresa_id IS NULL ORDER BY ordem ASC, id ASC`).all()
  })

  ipcMain.handle('obraEap:criar', (_e, p: ItemPayload) => {
    const r = db.prepare(`
      INSERT INTO obra_eap_itens (empresa_id, parent_id, nome, valor_orcado, unidade_medida, ordem, data_inicio_prevista, data_fim_prevista)
      VALUES (@empresa_id, @parent_id, @nome, @valor_orcado, @unidade_medida, @ordem, @data_inicio_prevista, @data_fim_prevista)
    `).run({ ...p, data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null })
    return { id: r.lastInsertRowid }
  })

  ipcMain.handle('obraEap:atualizar', (_e, p: ItemPayload) => {
    db.prepare(`
      UPDATE obra_eap_itens SET nome=@nome, valor_orcado=@valor_orcado, unidade_medida=@unidade_medida, ordem=@ordem,
        data_inicio_prevista=@data_inicio_prevista, data_fim_prevista=@data_fim_prevista
      WHERE id=@id
    `).run({ ...p, data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null })
    return { ok: true }
  })

  ipcMain.handle('obraEap:excluir', (_e, id: number) => {
    // sem FK cascade no SQLite por padrão — apaga a árvore inteira embaixo na mão
    const apagarComFilhos = (itemId: number) => {
      const filhos = db.prepare(`SELECT id FROM obra_eap_itens WHERE parent_id = ?`).all(itemId) as { id: number }[]
      for (const f of filhos) apagarComFilhos(f.id)
      db.prepare(`DELETE FROM obra_eap_itens WHERE id = ?`).run(itemId)
    }
    apagarComFilhos(id)
    return { ok: true }
  })

  ipcMain.handle('obraEap:clonarModelo', (_e, empresa_id: number) => {
    const modelo = db.prepare(`SELECT * FROM obra_eap_itens WHERE empresa_id IS NULL ORDER BY ordem ASC, id ASC`).all() as any[]
    const mapaIds = new Map<number, number>() // id antigo (modelo) -> id novo (obra)
    const inserir = db.prepare(`
      INSERT INTO obra_eap_itens (empresa_id, parent_id, nome, valor_orcado, unidade_medida, ordem, data_inicio_prevista, data_fim_prevista)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    // já vem ordenado do pai antes do filho (ordem/id crescente + parent_id sempre menor que o próprio id)
    for (const item of modelo) {
      const novoParentId = item.parent_id ? mapaIds.get(item.parent_id) ?? null : null
      const r = inserir.run(empresa_id, novoParentId, item.nome, item.valor_orcado, item.unidade_medida, item.ordem, item.data_inicio_prevista, item.data_fim_prevista)
      mapaIds.set(item.id, Number(r.lastInsertRowid))
    }
    return { ok: true, quantidade: modelo.length }
  })
}

// ── Supabase (produção) ──────────────────────────────────
function registerSupabase() {
  ipcMain.handle('obraEap:listar', async (_e, empresa_id: number) => {
    const { data, error } = await getSupabase()
      .from('obra_eap_itens').select('*').eq('empresa_id', empresa_id).order('ordem').order('id')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  ipcMain.handle('obraEap:listarModelo', async () => {
    const { data, error } = await getSupabase()
      .from('obra_eap_itens').select('*').is('empresa_id', null).order('ordem').order('id')
    if (error) throw new Error(error.message)
    return data ?? []
  })

  ipcMain.handle('obraEap:criar', async (_e, p: ItemPayload) => {
    const { data, error } = await getSupabase().from('obra_eap_itens').insert({
      empresa_id: p.empresa_id, parent_id: p.parent_id, nome: p.nome,
      valor_orcado: p.valor_orcado, unidade_medida: p.unidade_medida, ordem: p.ordem,
      data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return { id: data.id }
  })

  ipcMain.handle('obraEap:atualizar', async (_e, p: ItemPayload) => {
    const { error } = await getSupabase().from('obra_eap_itens').update({
      nome: p.nome, valor_orcado: p.valor_orcado, unidade_medida: p.unidade_medida, ordem: p.ordem,
      data_inicio_prevista: p.data_inicio_prevista ?? null, data_fim_prevista: p.data_fim_prevista ?? null,
    }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('obraEap:excluir', async (_e, id: number) => {
    // FK no banco já é ON DELETE CASCADE — apaga a árvore inteira embaixo sozinho
    const { error } = await getSupabase().from('obra_eap_itens').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('obraEap:clonarModelo', async (_e, empresa_id: number) => {
    const s = getSupabase()
    const { data: modelo, error } = await s.from('obra_eap_itens').select('*').is('empresa_id', null).order('ordem').order('id')
    if (error) throw new Error(error.message)
    const mapaIds = new Map<number, number>()
    for (const item of modelo ?? []) {
      const novoParentId = item.parent_id ? mapaIds.get(item.parent_id) ?? null : null
      const { data: novo, error: e2 } = await s.from('obra_eap_itens').insert({
        empresa_id, parent_id: novoParentId, nome: item.nome,
        valor_orcado: item.valor_orcado, unidade_medida: item.unidade_medida, ordem: item.ordem,
        data_inicio_prevista: item.data_inicio_prevista, data_fim_prevista: item.data_fim_prevista,
      }).select('id').single()
      if (e2) throw new Error(e2.message)
      mapaIds.set(item.id, novo.id)
    }
    return { ok: true, quantidade: (modelo ?? []).length }
  })
}
