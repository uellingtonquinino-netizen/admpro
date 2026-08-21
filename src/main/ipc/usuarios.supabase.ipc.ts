import { ipcMain } from 'electron'
import { getSupabase } from '../supabase/client'

type LoginParams = { email: string; senha: string }

async function getCurrentProfile() {
  const supabase = getSupabase()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Sessão do Supabase não encontrada.')

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome, email, perfil, ativo, carimbo_url')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!usuario || !usuario.ativo) {
    throw new Error('Sua conta ainda não está vinculada a um usuário ativo do sistema.')
  }

  const [extras, supervisor] = await Promise.all([
    supabase.from('usuario_permissoes_extras').select('chave, negada').eq('usuario_id', usuario.id),
    supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
  ])
  if (extras.error) throw new Error(extras.error.message)
  if (supervisor.error) throw new Error(supervisor.error.message)

  return {
    ...usuario,
    permissoes_extras: (extras.data ?? []).filter(row => !row.negada).map(row => row.chave),
    permissoes_negadas: (extras.data ?? []).filter(row => row.negada).map(row => row.chave),
    obras_supervisor: (supervisor.data ?? []).map(row => row.empresa_id),
  }
}

export function registerSupabaseUsuariosIpc() {
  const chamarAdmin = async (body: Record<string, unknown>) => {
    const supabase = getSupabase()
    // A sessão é mantida somente no processo principal do Electron. Passá-la
    // explicitamente evita que a Edge Function receba apenas a chave pública
    // do projeto e rejeite uma ação administrativa com 403.
    const { data: sessao, error: sessaoErro } = await supabase.auth.getSession()
    if (sessaoErro || !sessao.session) {
      throw new Error('Sessão do Supabase não encontrada. Faça login novamente.')
    }
    const { data, error } = await supabase.functions.invoke('usuarios-admin', {
      body,
      headers: { Authorization: `Bearer ${sessao.session.access_token}` },
    })
    if (error) {
      const response = (error as { context?: Response }).context
      if (response) {
        const detalhe = await response.clone().json().catch(() => null) as { error?: string } | null
        if (detalhe?.error) throw new Error(detalhe.error)
      }
      throw new Error(error.message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  }
  ipcMain.handle('usuarios:listar', async (_event, empresaId: number) => {
    const supabase = getSupabase()
    // CORRIGIDO: só buscava quem tem essa obra como "casa"
    // (empresa_id), nunca quem foi vinculado depois como obra EXTRA
    // (usuario_obras) — vincular um usuário existente a mais uma obra
    // nunca fazia ele aparecer na lista dessa obra.
    const [{ data: usuariosCasa, error: erroCasa }, { data: vinculosExtras, error: erroVinculos }] = await Promise.all([
      supabase.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url').eq('empresa_id', empresaId),
      supabase.from('usuario_obras').select('usuario_id').eq('empresa_id', empresaId),
    ])
    if (erroCasa) throw new Error(erroCasa.message)
    if (erroVinculos) throw new Error(erroVinculos.message)

    const idsExtras = (vinculosExtras ?? []).map(v => v.usuario_id).filter(id => !(usuariosCasa ?? []).some(u => u.id === id))
    let usuariosExtras: typeof usuariosCasa = []
    if (idsExtras.length > 0) {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url')
        .in('id', idsExtras)
      if (error) throw new Error(error.message)
      usuariosExtras = data
    }

    const usuarios = [...(usuariosCasa ?? []), ...usuariosExtras].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return Promise.all((usuarios ?? []).map(async usuario => {
      const [extras, supervisor, obras] = await Promise.all([
        supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', usuario.id),
        supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
        supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', usuario.id),
      ])
      for (const resultado of [extras, supervisor, obras]) {
        if (resultado.error) throw new Error(resultado.error.message)
      }
      return {
        ...usuario,
        permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
        permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
        obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id),
        obras_extras: (obras.data ?? []).map(x => x.empresa_id),
      }
    }))
  })

  // ── Listar TODOS os usuários, de todas as obras (Master) ──
  // Mesma lógica do lado SQLite (usuarios.ipc.ts) — ver comentário lá.
  ipcMain.handle('usuarios:listarTodos', async () => {
    const supabase = getSupabase()
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url,empresas(nome)')
      .order('nome')
    if (error) throw new Error(error.message)
    return Promise.all((usuarios ?? []).map(async usuario => {
      const [extras, supervisor, obras] = await Promise.all([
        supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', usuario.id),
        supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', usuario.id),
        supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', usuario.id),
      ])
      for (const resultado of [extras, supervisor, obras]) {
        if (resultado.error) throw new Error(resultado.error.message)
      }
      const { empresas, ...usuarioSemEmpresas } = usuario as typeof usuario & { empresas: { nome: string } | null }
      return {
        ...usuarioSemEmpresas,
        empresa_nome: empresas?.nome ?? '—',
        permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
        permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
        obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id),
        obras_extras: (obras.data ?? []).map(x => x.empresa_id),
      }
    }))
  })

  ipcMain.handle('usuarios:buscarPorId', async (_event, id: number) => {
    const supabase = getSupabase()
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!usuario) return null

    const [extras, supervisor, obras] = await Promise.all([
      supabase.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', id),
      supabase.from('supervisor_obras').select('empresa_id').eq('usuario_id', id),
      supabase.from('usuario_obras').select('empresa_id').eq('usuario_id', id),
    ])
    if (extras.error) throw new Error(extras.error.message)
    if (supervisor.error) throw new Error(supervisor.error.message)
    if (obras.error) throw new Error(obras.error.message)
    return {
      ...usuario,
      permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave),
      permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave),
      obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id),
      obras_extras: (obras.data ?? []).map(x => x.empresa_id),
    }
  })

  ipcMain.handle('usuarios:atualizar', async (_event, p: { id: number; nome: string; perfil: string; ativo: boolean }) => {
    const { error } = await getSupabase().from('usuarios').update({ nome: p.nome, perfil: p.perfil, ativo: p.ativo ? 1 : 0 }).eq('id', p.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('usuarios:definirPermissoesExtras', async (_event, p: { usuario_id: number; extras: string[]; negadas: string[] }) => {
    const supabase = getSupabase(); const { error: apagarErro } = await supabase.from('usuario_permissoes_extras').delete().eq('usuario_id', p.usuario_id); if (apagarErro) throw new Error(apagarErro.message)
    const linhas = [...p.extras.map(chave => ({ usuario_id: p.usuario_id, chave, negada: 0 })), ...p.negadas.map(chave => ({ usuario_id: p.usuario_id, chave, negada: 1 }))]
    if (linhas.length) { const { error } = await supabase.from('usuario_permissoes_extras').insert(linhas); if (error) throw new Error(error.message) }
    return { ok: true }
  })

  ipcMain.handle('usuarios:definirObras', async (_event, p: { usuario_id: number; empresa_ids: number[] }) => {
    const supabase = getSupabase(); const { error: apagarErro } = await supabase.from('usuario_obras').delete().eq('usuario_id', p.usuario_id); if (apagarErro) throw new Error(apagarErro.message)
    if (p.empresa_ids.length) { const { error } = await supabase.from('usuario_obras').insert(p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id }))); if (error) throw new Error(error.message) }
    return { ok: true }
  })

  ipcMain.handle('usuarios:definirObrasSupervisor', async (_event, p: { usuario_id: number; empresa_ids: number[] }) => {
    const supabase = getSupabase(); const { error: apagarErro } = await supabase.from('supervisor_obras').delete().eq('usuario_id', p.usuario_id); if (apagarErro) throw new Error(apagarErro.message)
    if (p.empresa_ids.length) { const { error } = await supabase.from('supervisor_obras').insert(p.empresa_ids.map(empresa_id => ({ usuario_id: p.usuario_id, empresa_id }))); if (error) throw new Error(error.message) }
    return { ok: true }
  })

  ipcMain.handle('usuarios:remover', async (_event, p: { id: number } | number) => {
    const id = typeof p === 'number' ? p : p.id
    const supabase = getSupabase()
    const { data: usuario } = await supabase.from('usuarios').select('nome,email,empresa_id').eq('id', id).single()
    if (usuario) {
      await supabase.rpc('registrar_exclusao', {
        p_tabela: 'usuarios', p_registro_id: id,
        p_descricao: `Usuário - ${usuario.nome} (${usuario.email})`,
        p_empresa_id: usuario.empresa_id,
      })
    }
    return chamarAdmin({ acao: 'remover', id })
  })

  ipcMain.handle('usuarios:login', async (_event, p: LoginParams) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email: p.email.trim(), password: p.senha })
    if (error) throw new Error('Usuário ou senha inválidos.')
    // CORRIGIDO: "último acesso" nunca era gravado no Supabase — nem
    // existia esse UPDATE aqui antes. E um UPDATE direto na tabela
    // teria sido barrado pela política (só o Master pode dar UPDATE
    // em usuarios) — por isso uma função própria, que só grava a
    // própria linha, nada mais.
    await supabase.rpc('registrar_login')
    return getCurrentProfile()
  })

  ipcMain.handle('usuarios:minhasObras', async (_event, usuarioId: number) => {
    const profile = await getCurrentProfile()
    if (profile.id !== usuarioId) throw new Error('Não é permitido consultar obras de outro usuário.')
    const supabase = getSupabase()
    const { data: links, error: linksError } = await supabase
      .from('usuario_obras').select('empresa_id').eq('usuario_id', usuarioId)
    if (linksError) throw new Error(linksError.message)
    const ids = links?.length ? links.map(link => link.empresa_id) : [profile.empresa_id]
    const { data: obras, error } = await supabase.from('empresas').select('id, nome').in('id', ids).order('nome')
    if (error) throw new Error(error.message)
    return obras ?? []
  })

  // CORRIGIDO: a tela já pedia "senha atual" no formulário, mas esse
  // handler ignorava esse campo — só checava o tamanho da senha
  // nova, e trocava direto. Agora confere de verdade a senha atual
  // primeiro (mesmo princípio de usuarios:alterarEmail, logo abaixo).
  ipcMain.handle('usuarios:alterarSenha', async (_event, p: { id: number; senha_atual: string; senha_nova: string }) => {
    if (p.senha_nova.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.')
    const profile = await getCurrentProfile()
    if (profile.id !== p.id) throw new Error('Não é permitido alterar a senha de outro usuário.')
    const { error: loginError } = await getSupabase().auth.signInWithPassword({ email: profile.email, password: p.senha_atual })
    if (loginError) throw new Error('Senha atual incorreta.')
    const { error } = await getSupabase().auth.updateUser({ password: p.senha_nova })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('usuarios:verificarSenha', async (_event, p: { id: number; senha: string }) => {
    const profile = await getCurrentProfile()
    if (profile.id !== p.id) return { ok: false }
    const { error } = await getSupabase().auth.signInWithPassword({ email: profile.email, password: p.senha })
    return { ok: !error }
  })

  ipcMain.handle('usuarios:alterarEmail', async (_event, p: { id: number; senha_atual: string; novo_email: string }) => {
    const profile = await getCurrentProfile()
    if (profile.id !== p.id) throw new Error('Não é permitido alterar o e-mail de outro usuário.')
    const { error: loginError } = await getSupabase().auth.signInWithPassword({ email: profile.email, password: p.senha_atual })
    if (loginError) throw new Error('Senha atual incorreta.')
    const { error } = await getSupabase().auth.updateUser({ email: p.novo_email.trim() })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('usuarios:atualizarCarimbo', async (_event, p: { carimbo_url: string | null }) => {
    const { error } = await getSupabase().rpc('atualizar_meu_carimbo', { p_carimbo_url: p.carimbo_url })
    if (error) throw new Error(error.message)
    return { ok: true }
  })

  ipcMain.handle('usuarios:criar', async (_event, p: {
    empresa_id: number; nome: string; email: string; senha: string; perfil: string
  }) => {
    const data = await chamarAdmin({ acao: 'criar', ...p })
    return { id: data.id }
  })

  ipcMain.handle('auth:logout', async () => {
    const { error } = await getSupabase().auth.signOut()
    if (error) throw new Error(error.message)
    return { ok: true }
  })
}
