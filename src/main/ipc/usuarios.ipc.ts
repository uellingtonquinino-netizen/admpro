import { ipcMain }  from 'electron'
import { getDb }    from '../database/connection'
import bcrypt       from 'bcryptjs'
import { getDatabaseProvider } from '../supabase/client'
import { registerSupabaseUsuariosIpc } from './usuarios.supabase.ipc'

interface AlterarSenhaParams {
  id:           number
  senha_atual:  string
  senha_nova:   string
}

interface CriarUsuarioParams {
  empresa_id: number
  nome:       string
  email:      string
  senha:      string
  perfil:     'admin' | 'gestor' | 'almoxarife' | 'supervisor'
}

interface AtualizarUsuarioParams {
  id:     number
  nome:   string
  perfil: 'admin' | 'gestor' | 'almoxarife' | 'supervisor'
  ativo:  boolean
}

interface LoginParams {
  email: string
  senha: string
}

export function registerUsuariosIpc() {
  if (getDatabaseProvider() === 'supabase') {
    registerSupabaseUsuariosIpc()
    return
  }
  const db = getDb()

  // ── Listar por empresa ────────────────────────────────
  // ALTERADO: agora também devolve as permissões extras de cada
  // usuário (páginas liberadas além do que o perfil já dá).
  ipcMain.handle('usuarios:listar', (_e, empresa_id: number) => {
    // CORRIGIDO: só buscava quem tem essa obra como "casa"
    // (empresa_id), nunca quem foi vinculado depois como obra EXTRA
    // (usuario_obras) — mesma correção do lado Supabase.
    const usuarios = db.prepare(`
      SELECT DISTINCT
        u.id, u.nome, u.email, u.perfil, u.ativo,
        u.created_at, u.last_login_at
      FROM usuarios u
      LEFT JOIN usuario_obras uo ON uo.usuario_id = u.id
      WHERE u.empresa_id = ? OR uo.empresa_id = ?
      ORDER BY u.nome ASC
    `).all(empresa_id, empresa_id) as { id: number }[]

    const buscarExtras  = db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 0`)
    const buscarNegadas = db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 1`)
    const buscarObras   = db.prepare(`SELECT empresa_id FROM supervisor_obras WHERE usuario_id = ?`)
    const buscarObrasExtras = db.prepare(`SELECT empresa_id FROM usuario_obras WHERE usuario_id = ?`)
    return usuarios.map(u => ({
      ...u,
      permissoes_extras:  (buscarExtras.all(u.id) as { chave: string }[]).map(r => r.chave),
      permissoes_negadas: (buscarNegadas.all(u.id) as { chave: string }[]).map(r => r.chave),
      obras_supervisor:  (buscarObras.all(u.id) as { empresa_id: number }[]).map(r => r.empresa_id),
      obras_extras:      (buscarObrasExtras.all(u.id) as { empresa_id: number }[]).map(r => r.empresa_id),
    }))
  })

  // ── Listar TODOS os usuários, de todas as obras (Master) ──
  // NOVO: a listagem normal (usuarios:listar) é presa a UMA obra —
  // ótimo pro ADM, que só mexe na obra dele, mas o Master precisa
  // enxergar todo mundo de uma vez, não importa a obra "dona" do
  // cadastro, pra achar um usuário já existente e vincular ele a mais
  // uma obra sem precisar ficar trocando de obra até encontrar onde
  // esse usuário mora.
  ipcMain.handle('usuarios:listarTodos', () => {
    const usuarios = db.prepare(`
      SELECT
        u.id, u.nome, u.email, u.perfil, u.ativo,
        u.created_at, u.last_login_at, u.empresa_id,
        e.nome AS empresa_nome
      FROM usuarios u
      JOIN empresas e ON e.id = u.empresa_id
      ORDER BY u.nome ASC
    `).all() as { id: number }[]

    const buscarExtras  = db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 0`)
    const buscarNegadas = db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 1`)
    const buscarObras   = db.prepare(`SELECT empresa_id FROM supervisor_obras WHERE usuario_id = ?`)
    const buscarObrasExtras = db.prepare(`SELECT empresa_id FROM usuario_obras WHERE usuario_id = ?`)
    return usuarios.map(u => ({
      ...u,
      permissoes_extras:  (buscarExtras.all(u.id) as { chave: string }[]).map(r => r.chave),
      permissoes_negadas: (buscarNegadas.all(u.id) as { chave: string }[]).map(r => r.chave),
      obras_supervisor:  (buscarObras.all(u.id) as { empresa_id: number }[]).map(r => r.empresa_id),
      obras_extras:      (buscarObrasExtras.all(u.id) as { empresa_id: number }[]).map(r => r.empresa_id),
    }))
  })

  // ── Buscar um usuário específico, com tudo (extras, obras) ──
  // NOVO: usado pelo Painel Master, que lista usuários de fontes
  // parciais (master:supervisores, master:obraDetalhe) — antes de
  // abrir pra editar, busca o registro completo aqui, pra não perder
  // permissões extras ou obras do supervisor ao salvar.
  ipcMain.handle('usuarios:buscarPorId', (_e, id: number) => {
    const usuario = db.prepare(`
      SELECT id, nome, email, perfil, ativo, created_at, last_login_at FROM usuarios WHERE id = ?
    `).get(id) as { id: number } | undefined
    if (!usuario) return null

    const extras = (db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 0`).all(id) as { chave: string }[]).map(r => r.chave)
    const negadas = (db.prepare(`SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 1`).all(id) as { chave: string }[]).map(r => r.chave)
    const obrasSupervisor = (db.prepare(`SELECT empresa_id FROM supervisor_obras WHERE usuario_id = ?`).all(id) as { empresa_id: number }[]).map(r => r.empresa_id)
    const obrasExtras = (db.prepare(`SELECT empresa_id FROM usuario_obras WHERE usuario_id = ?`).all(id) as { empresa_id: number }[]).map(r => r.empresa_id)

    return { ...usuario, permissoes_extras: extras, permissoes_negadas: negadas, obras_supervisor: obrasSupervisor, obras_extras: obrasExtras }
  })

  // ── Login ──────────────────────────────────────────────
  // NOTA: handler não presente na conversa original — AppRoutes.tsx,
  // PrivateRoute.tsx e Login.tsx (também reconstruídos) dependem de um
  // canal `usuarios:login`, então foi adicionado aqui seguindo o mesmo
  // padrão dos demais handlers deste arquivo, sem alterar a lógica já
  // existente de autenticação por bcrypt usada em `alterarSenha`.
  ipcMain.handle('usuarios:login', (_e, p: LoginParams) => {
    const usuario = db.prepare(`
      SELECT id, empresa_id, nome, email, senha_hash, perfil, ativo, carimbo_url
      FROM usuarios
      WHERE email = ?
    `).get(p.email) as
      | { id: number; empresa_id: number; nome: string; email: string
        ; senha_hash: string; perfil: string; ativo: number; carimbo_url: string | null }
      | undefined

    if (!usuario || !usuario.ativo) throw new Error('Usuário ou senha inválidos.')

    const ok = bcrypt.compareSync(p.senha, usuario.senha_hash)
    if (!ok) throw new Error('Usuário ou senha inválidos.')

    db.prepare(`
      UPDATE usuarios SET last_login_at = datetime('now') WHERE id = ?
    `).run(usuario.id)

    const permissoesExtras = (db.prepare(
      `SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 0`
    ).all(usuario.id) as { chave: string }[]).map(r => r.chave)

    // NOVO: páginas que o perfil já dá por padrão, mas que foram
    // explicitamente tiradas desse usuário — tem prioridade sobre o
    // perfil (ver PermissaoGuard).
    const permissoesNegadas = (db.prepare(
      `SELECT chave FROM usuario_permissoes_extras WHERE usuario_id = ? AND negada = 1`
    ).all(usuario.id) as { chave: string }[]).map(r => r.chave)

    // NOVO: se for supervisor, traz também quais obras ele acompanha.
    const obrasSupervisor = (db.prepare(
      `SELECT empresa_id FROM supervisor_obras WHERE usuario_id = ?`
    ).all(usuario.id) as { empresa_id: number }[]).map(r => r.empresa_id)

    const { senha_hash, ...usuarioSemSenha } = usuario
    return { ...usuarioSemSenha, permissoes_extras: permissoesExtras, permissoes_negadas: permissoesNegadas, obras_supervisor: obrasSupervisor }
  })

  // ── Obras que um usuário pode acessar (login e troca de obra) ──
  // NOVO: se o usuário não tiver nenhuma obra extra vinculada, cai de
  // volta pra obra "dona" do cadastro dele — ninguém que só
  // administra uma obra percebe diferença nenhuma.
  ipcMain.handle('usuarios:minhasObras', (_e, usuario_id: number) => {
    const extras = db.prepare(`
      SELECT e.id, e.nome FROM usuario_obras uo JOIN empresas e ON e.id = uo.empresa_id
      WHERE uo.usuario_id = ? ORDER BY e.nome COLLATE NOCASE ASC
    `).all(usuario_id) as { id: number; nome: string }[]

    if (extras.length > 0) return extras

    const usuario = db.prepare(`SELECT empresa_id FROM usuarios WHERE id = ?`).get(usuario_id) as { empresa_id: number } | undefined
    if (!usuario) return []
    const propria = db.prepare(`SELECT id, nome FROM empresas WHERE id = ?`).get(usuario.empresa_id)
    return propria ? [propria] : []
  })

  // ── Definir as obras de um usuário (ADM/Gestor/Almoxarife) ────
  ipcMain.handle('usuarios:definirObras', (_e, p: { usuario_id: number; empresa_ids: number[] }) => {
    const definir = db.transaction(() => {
      db.prepare(`DELETE FROM usuario_obras WHERE usuario_id = ?`).run(p.usuario_id)
      const inserir = db.prepare(`INSERT INTO usuario_obras (usuario_id, empresa_id) VALUES (?, ?)`)
      for (const empresaId of p.empresa_ids) inserir.run(p.usuario_id, empresaId)
    })
    definir()
    return { ok: true }
  })

  // ── Verificar senha (pra confirmar ações perigosas) ──────
  // NOVO: usado antes de ações destrutivas como excluir uma obra —
  // pede a senha de novo, mesmo já estando logado, como uma segunda
  // trava.
  ipcMain.handle('usuarios:verificarSenha', (_e, p: { id: number; senha: string }) => {
    const usuario = db.prepare(`SELECT senha_hash FROM usuarios WHERE id = ?`).get(p.id) as { senha_hash: string } | undefined
    if (!usuario) return { ok: false }
    return { ok: bcrypt.compareSync(p.senha, usuario.senha_hash) }
  })

  // ── Alterar senha ─────────────────────────────────────
  ipcMain.handle('usuarios:alterarSenha', (_e, p: AlterarSenhaParams) => {
    const usuario = db.prepare(`
      SELECT senha_hash FROM usuarios WHERE id = ?
    `).get(p.id) as { senha_hash: string } | undefined

    if (!usuario) throw new Error('Usuário não encontrado.')

    const ok = bcrypt.compareSync(p.senha_atual, usuario.senha_hash)
    if (!ok) throw new Error('Senha atual incorreta.')

    const novo_hash = bcrypt.hashSync(p.senha_nova, 10)
    db.prepare(`
      UPDATE usuarios SET senha_hash = ? WHERE id = ?
    `).run(novo_hash, p.id)

    return { ok: true }
  })

  // ── NOVO: alterar e-mail (Configurações → Segurança → Senha e
  // Login) — pede a senha atual de novo, como segunda trava, já que
  // o e-mail também é o login.
  ipcMain.handle('usuarios:alterarEmail', (_e, p: { id: number; senha_atual: string; novo_email: string }) => {
    const usuario = db.prepare(`SELECT senha_hash, empresa_id FROM usuarios WHERE id = ?`).get(p.id) as { senha_hash: string; empresa_id: number } | undefined
    if (!usuario) throw new Error('Usuário não encontrado.')

    const ok = bcrypt.compareSync(p.senha_atual, usuario.senha_hash)
    if (!ok) throw new Error('Senha atual incorreta.')

    const jaExiste = db.prepare(`
      SELECT id FROM usuarios WHERE email = ? AND empresa_id = ? AND id != ?
    `).get(p.novo_email, usuario.empresa_id, p.id)
    if (jaExiste) throw new Error('Já existe um usuário com esse e-mail.')

    db.prepare(`UPDATE usuarios SET email = ? WHERE id = ?`).run(p.novo_email, p.id)
    return { ok: true }
  })

  // ── NOVO: carimbo de assinatura (imagem) — cada usuário sobe a
  // própria imagem em Configurações, usada no lugar do carimbo de
  // texto ao autorizar AP's e Notas Fiscais.
  ipcMain.handle('usuarios:atualizarCarimbo', (_e, p: { id: number; carimbo_url: string | null }) => {
    db.prepare(`UPDATE usuarios SET carimbo_url = ? WHERE id = ?`).run(p.carimbo_url, p.id)
    return { ok: true }
  })

  // ── Criar usuário ─────────────────────────────────────
  ipcMain.handle('usuarios:criar', (_e, p: CriarUsuarioParams) => {
    const existe = db.prepare(`
      SELECT id FROM usuarios
      WHERE email = ? AND empresa_id = ?
    `).get(p.email, p.empresa_id)

    if (existe) throw new Error('Já existe um usuário com esse e-mail.')

    const senha_hash = bcrypt.hashSync(p.senha, 10)

    const result = db.prepare(`
      INSERT INTO usuarios
        (empresa_id, nome, email, senha_hash, perfil, ativo)
      VALUES
        (@empresa_id, @nome, @email, @senha_hash, @perfil, 1)
    `).run({ ...p, senha_hash })

    return { id: result.lastInsertRowid }
  })

  // ── Atualizar usuário ─────────────────────────────────
  // CORRIGIDO: o SQLite (via better-sqlite3) não aceita um booleano
  // JavaScript puro (true/false) como parâmetro — precisa ser 0 ou 1,
  // senão o comando falha. Isso impedia salvar a edição.
  ipcMain.handle('usuarios:atualizar', (_e, p: AtualizarUsuarioParams) => {
    db.prepare(`
      UPDATE usuarios
      SET nome   = @nome,
          perfil = @perfil,
          ativo  = @ativo
      WHERE id = @id
    `).run({ ...p, ativo: p.ativo ? 1 : 0 })
    return { ok: true }
  })

  // ── Definir permissões extras (substitui a lista inteira) ──
  // NOVO: além do perfil (admin/gestor/almoxarife), o ADM pode
  // liberar páginas extras pra um usuário específico.
  // ALTERADO: agora grava dois tipos de exceção — "extras" (páginas
  // além do que o perfil já dá) e "negadas" (páginas que o perfil dá
  // por padrão, mas foram tiradas desse usuário em particular).
  ipcMain.handle('usuarios:definirPermissoesExtras', (_e, p: { usuario_id: number; extras: string[]; negadas: string[] }) => {
    const definir = db.transaction(() => {
      db.prepare(`DELETE FROM usuario_permissoes_extras WHERE usuario_id = ?`).run(p.usuario_id)
      const inserir = db.prepare(`INSERT INTO usuario_permissoes_extras (usuario_id, chave, negada) VALUES (?, ?, ?)`)
      for (const chave of p.extras) inserir.run(p.usuario_id, chave, 0)
      for (const chave of p.negadas) inserir.run(p.usuario_id, chave, 1)
    })
    definir()
    return { ok: true }
  })

  // ── Definir obras que o supervisor acompanha (substitui a lista) ──
  ipcMain.handle('usuarios:definirObrasSupervisor', (_e, p: { usuario_id: number; empresa_ids: number[] }) => {
    const definir = db.transaction(() => {
      db.prepare(`DELETE FROM supervisor_obras WHERE usuario_id = ?`).run(p.usuario_id)
      const inserir = db.prepare(`INSERT INTO supervisor_obras (usuario_id, empresa_id) VALUES (?, ?)`)
      for (const empresaId of p.empresa_ids) inserir.run(p.usuario_id, empresaId)
    })
    definir()
    return { ok: true }
  })

  // ── Remover usuário ───────────────────────────────────
  // CORRIGIDO: só a tela impedia de excluir a si mesmo — agora o
  // próprio backend também recusa, mesmo que algo tente pular a tela.
  ipcMain.handle('usuarios:remover', (_e, p: { id: number; usuarioLogadoId?: number } | number) => {
    const dados = typeof p === 'number' ? { id: p } : p
    if (dados.usuarioLogadoId && dados.usuarioLogadoId === dados.id) {
      throw new Error('Você não pode excluir o seu próprio usuário.')
    }
    db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(dados.id)
    return { ok: true }
  })
}
