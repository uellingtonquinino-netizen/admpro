import { ipcMain } from 'electron'
import { getDatabaseProvider, getSupabase } from '../supabase/client'
import { VERSAO_CONTRATO, preencherContrato } from './contratoTemplate'

// NOVO: Contrato de Prestação de Serviços — assinatura eletrônica
// simples (nome digitado + confirmação). Guarda o texto completo no
// momento da criação, não só uma referência à versão — se o modelo
// mudar depois, o que já foi assinado continua provando exatamente o
// que a pessoa concordou. Só funciona com Supabase (mesma linha dos
// outros módulos novos — Obra, Faturas).

export function registerContratosIpc() {
  ipcMain.handle('contratos:buscarOuCriar', async (_e, empresa_id: number) => {
    if (getDatabaseProvider() !== 'supabase') throw new Error('Contratos só funciona com Supabase configurado.')
    const s = getSupabase()

    const { data: existente, error: erroBusca } = await s
      .from('contratos').select('*').eq('empresa_id', empresa_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (erroBusca) throw new Error(erroBusca.message)

    // Já existe um contrato da versão atual (assinado ou pendente) —
    // devolve ele, sem criar outro.
    if (existente && existente.versao === VERSAO_CONTRATO) return existente

    // Não existe ainda, ou existe de uma versão antiga do modelo —
    // busca os dados da obra e monta o texto novo, preenchido.
    const { data: empresa, error: erroEmpresa } = await s
      .from('empresas').select('razao_social, nome, cnpj, valor_mensalidade').eq('id', empresa_id).single()
    if (erroEmpresa) throw new Error(erroEmpresa.message)

    const texto = preencherContrato({
      // CORRIGIDO: contratante tem que ser a razão social (nome legal
      // da empresa dona do CNPJ), não o "nome" da obra (que é só o
      // nome do empreendimento, tipo "RESIDENCIAL X" — usado só como
      // reserva, caso alguma obra antiga não tenha razão social
      // cadastrada ainda).
      nome_empresa: empresa.razao_social || empresa.nome,
      cnpj_empresa: empresa.cnpj, valor_mensalidade: Number(empresa.valor_mensalidade ?? 0),
    })

    const { data: novo, error: erroInsert } = await s.from('contratos').insert({
      empresa_id, versao: VERSAO_CONTRATO, texto_completo: texto, status: 'pendente',
    }).select('*').single()
    if (erroInsert) throw new Error(erroInsert.message)
    return novo
  })

  ipcMain.handle('contratos:assinar', async (_e, p: { contrato_id: number; nome_completo: string; usuario_id: number }) => {
    if (getDatabaseProvider() !== 'supabase') throw new Error('Contratos só funciona com Supabase configurado.')
    const { error } = await getSupabase().from('contratos').update({
      status: 'assinado',
      assinado_por_nome: p.nome_completo,
      assinado_por_usuario_id: p.usuario_id,
      data_assinatura: new Date().toISOString(),
    }).eq('id', p.contrato_id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
}
