import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers: cors })

  const admin = createClient(url, service)
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth.user) return Response.json({ error: 'Sessão inválida.' }, { status: 401, headers: cors })
  let { data: solicitante, error: erroPerfil } = await admin
    .from('usuarios')
    .select('id,perfil,ativo,empresa_id,email')
    .eq('auth_user_id', auth.user.id)
    .maybeSingle()
  // Contingência para perfis importados: o e-mail precisa coincidir com o
  // e-mail confirmado do Auth; nunca aceita um e-mail informado pelo cliente.
  if (!solicitante && auth.user.email) {
    const resultado = await admin
      .from('usuarios')
      .select('id,perfil,ativo,empresa_id,email')
      .ilike('email', auth.user.email)
      .maybeSingle()
    solicitante = resultado.data
    erroPerfil = resultado.error
  }
  console.log('usuarios-admin: solicitante identificado', {
    authUserId: auth.user.id,
    authEmail: auth.user.email ?? null,
    perfilId: solicitante?.id ?? null,
    perfilEmail: solicitante?.email ?? null,
    perfil: solicitante?.perfil ?? null,
    ativo: solicitante?.ativo ?? null,
  })
  if (!solicitante?.ativo || !['admin', 'master'].includes(solicitante.perfil)) {
    const perfilRecebido = solicitante?.perfil ?? 'não localizado'
    const ativoRecebido = solicitante?.ativo ? 'ativo' : 'inativo'
    return Response.json({
      error: `Sem permissão (${perfilRecebido}; ${ativoRecebido}; sessão: ${auth.user.email ?? auth.user.id}; consulta: ${erroPerfil?.message ?? 'nenhum registro'}).`,
    }, { status: 403, headers: cors })
  }

  const body = await request.json()
  const podeAdministrarObra = (empresaId: number) => solicitante.perfil === 'master' || solicitante.empresa_id === empresaId
  const buscarUsuario = async (id: number) => {
    const { data, error } = await admin.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url,auth_user_id').eq('id', id).maybeSingle()
    if (error || !data) return { usuario: null, erro: error?.message ?? 'Usuário não encontrado.' }
    if (!podeAdministrarObra(data.empresa_id)) return { usuario: null, erro: 'Obra não autorizada.' }
    return { usuario: data, erro: null }
  }
  const detalhesUsuario = async (usuario: Record<string, unknown>) => {
    const id = usuario.id as number
    const [extras, supervisor, obras] = await Promise.all([
      admin.from('usuario_permissoes_extras').select('chave,negada').eq('usuario_id', id),
      admin.from('supervisor_obras').select('empresa_id').eq('usuario_id', id),
      admin.from('usuario_obras').select('empresa_id').eq('usuario_id', id),
    ])
    return { ...usuario, permissoes_extras: (extras.data ?? []).filter(x => !x.negada).map(x => x.chave), permissoes_negadas: (extras.data ?? []).filter(x => !!x.negada).map(x => x.chave), obras_supervisor: (supervisor.data ?? []).map(x => x.empresa_id), obras_extras: (obras.data ?? []).map(x => x.empresa_id) }
  }

  if (body.acao === 'listar') {
    if (!body.empresa_id || !podeAdministrarObra(body.empresa_id)) return Response.json({ error: 'Obra não autorizada.' }, { status: 403, headers: cors })
    const { data, error } = await admin.from('usuarios').select('id,empresa_id,nome,email,perfil,ativo,created_at,last_login_at,carimbo_url').eq('empresa_id', body.empresa_id).order('nome')
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors })
    return Response.json(await Promise.all((data ?? []).map(detalhesUsuario)), { headers: cors })
  }
  if (body.acao === 'buscar') {
    const { usuario, erro } = await buscarUsuario(body.id)
    if (erro || !usuario) return Response.json({ error: erro }, { status: 403, headers: cors })
    return Response.json(await detalhesUsuario(usuario), { headers: cors })
  }
  if (body.acao === 'atualizar') {
    const { usuario, erro } = await buscarUsuario(body.id)
    if (erro || !usuario) return Response.json({ error: erro }, { status: 403, headers: cors })
    const { error } = await admin.from('usuarios').update({ nome: body.nome, perfil: body.perfil, ativo: body.ativo ? 1 : 0 }).eq('id', body.id)
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors })
    return Response.json({ ok: true }, { headers: cors })
  }
  if (body.acao === 'definirPermissoes' || body.acao === 'definirObras' || body.acao === 'definirObrasSupervisor') {
    const { usuario, erro } = await buscarUsuario(body.usuario_id)
    if (erro || !usuario) return Response.json({ error: erro }, { status: 403, headers: cors })
    const tabela = body.acao === 'definirPermissoes' ? 'usuario_permissoes_extras' : body.acao === 'definirObras' ? 'usuario_obras' : 'supervisor_obras'
    const { error: apagarErro } = await admin.from(tabela).delete().eq('usuario_id', body.usuario_id)
    if (apagarErro) return Response.json({ error: apagarErro.message }, { status: 400, headers: cors })
    if (body.acao === 'definirPermissoes') {
      const rows = [...(body.extras ?? []).map((chave: string) => ({ usuario_id: body.usuario_id, chave, negada: 0 })), ...(body.negadas ?? []).map((chave: string) => ({ usuario_id: body.usuario_id, chave, negada: 1 }))]
      if (rows.length) { const { error } = await admin.from(tabela).insert(rows); if (error) return Response.json({ error: error.message }, { status: 400, headers: cors }) }
    } else {
      const rows = (body.empresa_ids ?? []).map((empresa_id: number) => ({ usuario_id: body.usuario_id, empresa_id }))
      if (rows.length) { const { error } = await admin.from(tabela).insert(rows); if (error) return Response.json({ error: error.message }, { status: 400, headers: cors }) }
    }
    return Response.json({ ok: true }, { headers: cors })
  }
  if (body.acao === 'remover') {
    const { usuario, erro } = await buscarUsuario(body.id)
    if (erro || !usuario) return Response.json({ error: erro }, { status: 403, headers: cors })
    if (solicitante.id === body.id) return Response.json({ error: 'Você não pode excluir o próprio usuário.' }, { status: 400, headers: cors })
    const { error } = await admin.auth.admin.deleteUser(usuario.auth_user_id as string)
    if (error) return Response.json({ error: error.message }, { status: 400, headers: cors })
    const { error: profileError } = await admin.from('usuarios').delete().eq('id', body.id)
    if (profileError) return Response.json({ error: profileError.message }, { status: 400, headers: cors })
    return Response.json({ ok: true }, { headers: cors })
  }
  if (body.acao !== 'criar') return Response.json({ error: 'Ação inválida.' }, { status: 400, headers: cors })

  const { email, senha, nome, perfil, empresa_id } = body
  if (!email || !senha || !nome || !perfil || !empresa_id) return Response.json({ error: 'Dados incompletos.' }, { status: 400, headers: cors })
  if (!podeAdministrarObra(empresa_id)) return Response.json({ error: 'Obra não autorizada.' }, { status: 403, headers: cors })
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
  if (erroAuth || !criado.user) return Response.json({ error: erroAuth?.message ?? 'Falha ao criar conta.' }, { status: 400, headers: cors })
  const { data: usuario, error: erroCriacaoPerfil } = await admin.from('usuarios').insert({ empresa_id, nome, email, perfil, ativo: 1, auth_user_id: criado.user.id, senha_hash: 'supabase-auth' }).select('id').single()
  if (erroCriacaoPerfil) { await admin.auth.admin.deleteUser(criado.user.id); return Response.json({ error: erroCriacaoPerfil.message }, { status: 400, headers: cors }) }
  return Response.json({ id: usuario.id }, { headers: cors })
})
