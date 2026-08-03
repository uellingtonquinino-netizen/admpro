// RECONSTRUÍDO: este arquivo é referenciado (import) em outros pontos da
// conversa original (ipc/index.ts, preload/index.ts), mas seu código nunca
// foi enviado em nenhuma das PARTEs. Implementação abaixo inferida a partir
// do esquema de banco (migrations.ts) e do padrão dos demais handlers
// (contas.ipc.ts, categorias.ipc.ts) para manter o projeto compilável.
import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { getDatabaseProvider } from '../supabase/client'
import { registerSupabaseEmpresasIpc } from './empresas.supabase.ipc'

interface CriarPayload {
  nome:                   string
  titulo_obra?:           string | null
  razao_social?:          string | null
  cnpj:                   string | null
  email:                  string | null
  telefone:               string | null
  endereco:               string | null
  cidade?:                string | null
  estado?:                string | null
  logo_url?:              string | null
  solicitante_padrao?:    string | null
  autorizado_por_padrao?: string | null
}

interface AtualizarPayload extends CriarPayload {
  id: number
}

export function registerEmpresasIpc() {
  if (getDatabaseProvider() === 'supabase') {
    registerSupabaseEmpresasIpc()
    return
  }
  const db = getDb()

  ipcMain.handle('empresas:listar', () => {
    return db.prepare(`
      SELECT * FROM empresas WHERE ativo = 1 ORDER BY nome ASC
    `).all()
  })

  ipcMain.handle('empresas:buscarPorId', (_e, id: number) => {
    return db.prepare(`SELECT * FROM empresas WHERE id = ?`).get(id)
  })

  ipcMain.handle('empresas:criar', (_e, p: CriarPayload) => {
    const result = db.prepare(`
      INSERT INTO empresas (nome, titulo_obra, razao_social, cnpj, email, telefone, endereco, logo_url, ativo)
      VALUES (@nome, @titulo_obra, @razao_social, @cnpj, @email, @telefone, @endereco, @logo_url, 1)
    `).run({ ...p, titulo_obra: p.titulo_obra ?? null, razao_social: p.razao_social ?? null, logo_url: p.logo_url ?? null })
    return { id: result.lastInsertRowid }
  })

  // CORRIGIDO: `logo_url` não estava na lista de colunas do UPDATE nem
  // no payload — o upload de logo era salvo só na tela (prévia local),
  // nunca gravado no banco. Por isso nenhum documento nunca mostrava a
  // logo de verdade, mesmo após "salvar" repetidas vezes.
  ipcMain.handle('empresas:atualizar', (_e, p: AtualizarPayload) => {
    db.prepare(`
      UPDATE empresas
      SET nome = @nome, titulo_obra = @titulo_obra, razao_social = @razao_social, cnpj = @cnpj, email = @email,
          telefone = @telefone, endereco = @endereco,
          cidade = @cidade, estado = @estado,
          logo_url = @logo_url,
          solicitante_padrao = @solicitante_padrao,
          autorizado_por_padrao = @autorizado_por_padrao
      WHERE id = @id
    `).run({
      ...p,
      titulo_obra:            p.titulo_obra ?? null,
      razao_social:           p.razao_social ?? null,
      cidade:                 p.cidade ?? null,
      estado:                 p.estado ?? null,
      logo_url:               p.logo_url ?? null,
      solicitante_padrao:    p.solicitante_padrao ?? null,
      autorizado_por_padrao: p.autorizado_por_padrao ?? null,
    })
    return { ok: true }
  })

  // CORRIGIDO: isso só marcava ativo=0 e nunca tirava a obra da
  // lista de verdade — por isso aparecia "excluído com sucesso" mas
  // a obra continuava lá. Agora exclui de verdade; o CASCADE do
  // banco já cuida de apagar tudo relacionado àquela obra junto
  // (colaboradores, lançamentos, usuários, etc.).
  ipcMain.handle('empresas:excluir', (_e, id: number) => {
    db.prepare(`DELETE FROM empresas WHERE id = ?`).run(id)
    return { ok: true }
  })
}
