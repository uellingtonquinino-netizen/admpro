import { FormEvent, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Session } from '@supabase/supabase-js'
import { PDFDocument, rgb } from 'pdf-lib'
import { ArrowLeftRight, Bell, Boxes, Building2, CalendarDays, ChevronDown, ClipboardList, LayoutDashboard, LogOut, MapPin, Menu, PackageMinus, PackagePlus, RefreshCw, Search, UsersRound, Wallet, X } from 'lucide-react'
import { supabase } from './supabase'
import '../renderer/index.css'
import './web.css'

type Perfil = {
  id: number
  empresa_id: number
  nome: string
  email: string
  perfil: string
  ativo: boolean | number
  carimbo_url?: string | null
}

type ResumoObra = {
  ativos: number
  custoFolha: number
  lancamentos: { id: number; descricao: string; valor: number; tipo: string; data: string; status: string }[]
  mediaIdade: number | null
  aniversariantes: { nome: string; funcao: string | null; nascimento: string }[]
  porFuncao: { funcao: string; quantidade: number; custo: number }[]
}

type Lancamento = { id: number; descricao: string; valor: number; tipo: string; data: string; data_venc: string | null; status: string }
type Colaborador = { id: number; nome: string; funcao: string | null; setor: string | null; status: string; salario_base: number }
type Produto = { id: number; codigo: string; nome: string; unidade: string | null; estoque_atual: number; estoque_minimo: number; valor_unitario: number }
type EntradaAlmoxarifado = { id: number; data: string; numero_nota: string | null; fornecedor_nome: string; valor_total: number }
type SaidaAlmoxarifado = { id: number; data: string; produto_nome: string; produto_codigo: string; quantidade: number; retirado_por_nome: string; setor: string | null }
type AutorizacaoWeb = { id: number; beneficiario_tipo: string; beneficiario_id: number; beneficiario_nome: string; descricao: string | null; valor: number; vencimento: string | null; aprovado_por: string | null; lote_id: number | null }
type NotaFiscalWeb = { id: number; fornecedor_id: number | null; fornecedor_nome: string; numero_nf: string | null; data: string; valor_total: number; aprovado_por: string | null; lote_id: number | null }
type AnexoFinanceiro = { id: number; caminho: string; categoria?: string; ordem: number }
type FornecedorWeb = { id: number; nome: string; tipo_pessoa: string; cnpj: string | null; cpf: string | null; email: string | null; telefone: string | null; categoria: string | null; forma_pagamento: string }
type LoteWeb = { id: number; numero: number | null; titulo: string; criado_por: string | null; created_at: string; enviado_em: string | null }
type ResumoMaster = { obras: number; usuarios: number; supervisores: number; administradores: number }
type UsuarioMaster = { id: number; nome: string; email: string; perfil: string; ativo: boolean | number }
type ObraMaster = { id: number; nome: string; titulo_obra: string | null; estado: string | null }
type ResumoSupervisor = {
  obras: { id: number; nome: string; titulo_obra: string | null; estado: string | null }[]
  colaboradores: number
  idadeMedia: number | null
  admissoes: number
  desligamentos: number
  despesas: number
  pendencias: number
}
type SolicitacaoPessoal = {
  id: number
  empresa_id: number
  colaborador_id: number
  tipo: string
  status: string
  solicitado_por: string
  solicitado_em: string
  respondido_por: string | null
  colaborador_nome: string
  obra_nome: string
}
type ResumoCentral = {
  id: number
  nome: string
  email: string
  obras: { id: number; nome: string }[]
  pendencias: number
}
type ItemCentral = { id: number; tipo: 'ap' | 'nf'; empresa_id: number; nome: string; referencia: string; valor: number | null }
type OpcaoFinanceira = { id: number; nome: string }

const nomesPerfil: Record<string, string> = {
  admin: 'Administrador', gestor: 'Gestor', almoxarife: 'Almoxarife',
  supervisor: 'Supervisor', central: 'Escritório Central', master: 'Administrador Master',
  setor_pessoal: 'Setor Pessoal',
}

const tiposSolicitacao: Record<string, string> = {
  admissao: 'Admissão', desligamento: 'Desligamento', alteracao_salarial: 'Alteração salarial', outro: 'Movimentação',
}

function PortalWeb() {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [carimboUrl, setCarimboUrl] = useState('')
  const [salvandoCarimbo, setSalvandoCarimbo] = useState(false)
  const [resumo, setResumo] = useState<ResumoObra | null>(null)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [colaboradoresWeb, setColaboradoresWeb] = useState<Colaborador[]>([])
  const [produtosWeb, setProdutosWeb] = useState<Produto[]>([])
  const [entradasWeb, setEntradasWeb] = useState<EntradaAlmoxarifado[]>([])
  const [saidasWeb, setSaidasWeb] = useState<SaidaAlmoxarifado[]>([])
  const [autorizacoesWeb, setAutorizacoesWeb] = useState<AutorizacaoWeb[]>([])
  const [notasFiscaisWeb, setNotasFiscaisWeb] = useState<NotaFiscalWeb[]>([])
  const [fornecedoresWeb, setFornecedoresWeb] = useState<FornecedorWeb[]>([])
  const [lotesWeb, setLotesWeb] = useState<LoteWeb[]>([])
  const [resumoMaster, setResumoMaster] = useState<ResumoMaster | null>(null)
  const [usuariosMaster, setUsuariosMaster] = useState<UsuarioMaster[]>([])
  const [obrasMaster, setObrasMaster] = useState<ObraMaster[]>([])
  const [resumoSupervisor, setResumoSupervisor] = useState<ResumoSupervisor | null>(null)
  const [solicitacoesPessoal, setSolicitacoesPessoal] = useState<SolicitacaoPessoal[]>([])
  const [resumoCentral, setResumoCentral] = useState<ResumoCentral[]>([])
  const [itensCentralPendentes, setItensCentralPendentes] = useState<ItemCentral[]>([])
  const [itensSupervisorPendentes, setItensSupervisorPendentes] = useState<ItemCentral[]>([])
  const [itemCentralProcessando, setItemCentralProcessando] = useState<string | null>(null)
  const [itemFinanceiroProcessando, setItemFinanceiroProcessando] = useState<string | null>(null)
  const [documentoFinanceiroTipo, setDocumentoFinanceiroTipo] = useState<'ap' | 'nf'>('ap')
  const [documentoFinanceiroId, setDocumentoFinanceiroId] = useState('')
  const [anexosFinanceiros, setAnexosFinanceiros] = useState<AnexoFinanceiro[]>([])
  const [novosAnexosFinanceiros, setNovosAnexosFinanceiros] = useState<File[]>([])
  const [carregandoAnexosFinanceiros, setCarregandoAnexosFinanceiros] = useState(false)
  const [enviandoAnexosFinanceiros, setEnviandoAnexosFinanceiros] = useState(false)
  const [solicitacaoRespondendoId, setSolicitacaoRespondendoId] = useState<number | null>(null)
  const [respostaPessoal, setRespostaPessoal] = useState('')
  const [anexosResposta, setAnexosResposta] = useState<File[]>([])
  const [salvandoRespostaPessoal, setSalvandoRespostaPessoal] = useState(false)
  const [categoriasWeb, setCategoriasWeb] = useState<OpcaoFinanceira[]>([])
  const [contasWeb, setContasWeb] = useState<OpcaoFinanceira[]>([])
  const [pagina, setPagina] = useState<'inicio' | 'financeiro' | 'ap' | 'notas' | 'fornecedores' | 'lotes' | 'rh' | 'almox' | 'estoque' | 'entradas' | 'saidas' | 'supervisor' | 'pessoal' | 'central'>('inicio')
  const [menuAberto, setMenuAberto] = useState(false)
  const [buscaColaborador, setBuscaColaborador] = useState('')
  const [filtroStatusRh, setFiltroStatusRh] = useState('todos')
  const [buscaLancamento, setBuscaLancamento] = useState('')
  const [filtroTipoFinanceiro, setFiltroTipoFinanceiro] = useState('todos')
  const [novoFornecedor, setNovoFornecedor] = useState(false)
  const [salvandoFornecedor, setSalvandoFornecedor] = useState(false)
  const [formFornecedor, setFormFornecedor] = useState({ nome: '', tipo_pessoa: 'pj', cnpj: '', cpf: '', email: '', telefone: '', categoria: '', forma_pagamento: 'boleto' })
  const [novaAp, setNovaAp] = useState(false)
  const [editandoApId, setEditandoApId] = useState<number | null>(null)
  const [salvandoAp, setSalvandoAp] = useState(false)
  const [formAp, setFormAp] = useState({ fornecedor_id: '', descricao: '', valor: '', vencimento: new Date().toISOString().slice(0, 10), observacoes: '' })
  const [novaNf, setNovaNf] = useState(false)
  const [editandoNfId, setEditandoNfId] = useState<number | null>(null)
  const [salvandoNf, setSalvandoNf] = useState(false)
  const [formNf, setFormNf] = useState({ fornecedor_id: '', numero_nf: '', numero_pedido: '', valor: '', vencimento: new Date().toISOString().slice(0, 10), data: new Date().toISOString().slice(0, 10) })
  const [editandoFornecedorId, setEditandoFornecedorId] = useState<number | null>(null)
  const [itensLoteSelecionados, setItensLoteSelecionados] = useState<Set<string>>(new Set())
  const [processandoLote, setProcessandoLote] = useState(false)
  const [buscaProduto, setBuscaProduto] = useState('')
  const [novaEntrada, setNovaEntrada] = useState(false)
  const [salvandoEntrada, setSalvandoEntrada] = useState(false)
  const [formEntrada, setFormEntrada] = useState({ produto_id: '', quantidade: '', valor_unitario: '', fornecedor_nome: '', numero_nota: '', data: new Date().toISOString().slice(0, 10) })
  const [novaSaida, setNovaSaida] = useState(false)
  const [salvandoSaida, setSalvandoSaida] = useState(false)
  const [formSaida, setFormSaida] = useState({ produto_id: '', quantidade: '', retirado_por_nome: '', setor: '', data: new Date().toISOString().slice(0, 10) })
  const [novoLancamento, setNovoLancamento] = useState(false)
  const [salvandoLancamento, setSalvandoLancamento] = useState(false)
  const [formLancamento, setFormLancamento] = useState({ descricao: '', valor: '', tipo: 'despesa', data: new Date().toISOString().slice(0, 10), data_venc: '', categoria_id: '', conta_id: '' })
  const [novoColaborador, setNovoColaborador] = useState(false)
  const [salvandoColaborador, setSalvandoColaborador] = useState(false)
  const [formColaborador, setFormColaborador] = useState({ nome: '', funcao: '', setor: '', data_admissao: new Date().toISOString().slice(0, 10), salario_base: '' })
  const [novoUsuarioMaster, setNovoUsuarioMaster] = useState(false)
  const [salvandoUsuarioMaster, setSalvandoUsuarioMaster] = useState(false)
  const [formUsuarioMaster, setFormUsuarioMaster] = useState({ nome: '', email: '', senha: '', perfil: 'admin', empresa_id: '' })
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)

  async function carregarPerfil(sessao: Session | null) {
    setSession(sessao)
    setPerfil(null)
    if (!sessao) { setCarregando(false); return }

    const { data, error } = await supabase
      .from('usuarios')
      .select('id,empresa_id,nome,email,perfil,ativo,carimbo_url')
      .eq('auth_user_id', sessao.user.id)
      .maybeSingle()
    if (error) setErro(`Não foi possível carregar seu perfil: ${error.message}`)
    else if (!data || !data.ativo) setErro('Sua conta não está vinculada a um usuário ativo do sistema.')
    else {
      setPerfil(data)
      setCarimboUrl(data.carimbo_url ?? '')
      setPagina(data.perfil === 'almoxarife' ? 'almox' : data.perfil === 'supervisor' ? 'supervisor' : data.perfil === 'setor_pessoal' ? 'pessoal' : data.perfil === 'central' ? 'central' : 'inicio')
      if (data.perfil === 'master') {
        const [obras, usuarios] = await Promise.all([
          supabase.from('empresas').select('id,nome,titulo_obra,estado').order('nome'),
          supabase.from('usuarios').select('id,nome,email,perfil,ativo').order('nome'),
        ])
        if (!obras.error && !usuarios.error) {
          const ativos = (usuarios.data ?? []).filter(item => !!item.ativo)
          setResumoMaster({ obras: obras.data?.length ?? 0, usuarios: ativos.length, supervisores: ativos.filter(item => item.perfil === 'supervisor').length, administradores: ativos.filter(item => item.perfil === 'admin').length })
          setObrasMaster(obras.data ?? [])
          setUsuariosMaster(usuarios.data ?? [])
        } else setErro('Não foi possível carregar a estrutura administrativa.')
        setCarregando(false)
        return
      }
      if (data.perfil === 'supervisor') {
        const { data: vinculos, error: erroVinculos } = await supabase
          .from('supervisor_obras')
          .select('empresa_id')
          .eq('usuario_id', data.id)
        if (erroVinculos) {
          setErro('Não foi possível carregar as obras sob sua supervisão.')
          setCarregando(false)
          return
        }
        const empresaIds = (vinculos ?? []).map(item => item.empresa_id)
        if (empresaIds.length === 0) {
          setResumoSupervisor({ obras: [], colaboradores: 0, idadeMedia: null, admissoes: 0, desligamentos: 0, despesas: 0, pendencias: 0 })
          setCarregando(false)
          return
        }
        const inicioMes = new Date(); inicioMes.setDate(1)
        const inicioMesTexto = inicioMes.toISOString().slice(0, 10)
        const [{ data: obras, error: erroObras }, { data: colaboradores, error: erroColaboradores }, { data: lancamentos, error: erroLancamentos }, { data: autorizacoes, error: erroAutorizacoes }, { data: notas, error: erroNotas }] = await Promise.all([
          supabase.from('empresas').select('id,nome,titulo_obra,estado').in('id', empresaIds).order('nome'),
          supabase.from('colaboradores').select('status,nascimento,data_admissao,data_demissao').in('empresa_id', empresaIds),
          supabase.from('lancamentos').select('valor,tipo,status,data').in('empresa_id', empresaIds),
          supabase.from('autorizacoes_pagamento').select('id,empresa_id,lote_id,beneficiario_nome,valor,aprovado_supervisor_por').in('empresa_id', empresaIds),
          supabase.from('notas_fiscais').select('id,empresa_id,lote_id,fornecedor_nome,numero_nf,aprovado_supervisor_por').in('empresa_id', empresaIds),
        ])
        if (erroObras || erroColaboradores || erroLancamentos || erroAutorizacoes || erroNotas) {
          setErro('Não foi possível carregar o painel de supervisão.')
        } else {
          const ativos = (colaboradores ?? []).filter(item => item.status === 'ativo')
          const idades = ativos.filter(item => item.nascimento).map(item => (Date.now() - new Date(`${item.nascimento}T00:00:00`).getTime()) / 31557600000)
          setResumoSupervisor({
            obras: obras ?? [],
            colaboradores: ativos.length,
            idadeMedia: idades.length ? Math.round(idades.reduce((total, idade) => total + idade, 0) / idades.length) : null,
            admissoes: (colaboradores ?? []).filter(item => item.data_admissao?.slice(0, 7) === inicioMesTexto.slice(0, 7)).length,
            desligamentos: (colaboradores ?? []).filter(item => item.data_demissao?.slice(0, 7) === inicioMesTexto.slice(0, 7)).length,
            despesas: (lancamentos ?? []).filter(item => item.tipo === 'despesa' && item.status !== 'cancelado' && item.data >= inicioMesTexto).reduce((total, item) => total + Number(item.valor), 0),
            pendencias: (autorizacoes ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).length + (notas ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).length,
          })
          setItensSupervisorPendentes([
            ...(autorizacoes ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).map(item => ({ id: item.id, tipo: 'ap' as const, empresa_id: item.empresa_id, nome: item.beneficiario_nome, referencia: 'Autorização de pagamento', valor: item.valor })),
            ...(notas ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por === null).map(item => ({ id: item.id, tipo: 'nf' as const, empresa_id: item.empresa_id, nome: item.fornecedor_nome, referencia: `Nota fiscal ${item.numero_nf ?? '—'}`, valor: null })),
          ])
          setAutorizacoesWeb((autorizacoes ?? []).map(item => ({ id: item.id, beneficiario_tipo: 'fornecedor', beneficiario_id: 0, beneficiario_nome: item.beneficiario_nome, descricao: null, valor: Number(item.valor), vencimento: null, aprovado_por: item.aprovado_supervisor_por, lote_id: item.lote_id })))
          setNotasFiscaisWeb((notas ?? []).map(item => ({ id: item.id, fornecedor_id: null, fornecedor_nome: item.fornecedor_nome, numero_nf: item.numero_nf, data: '', valor_total: 0, aprovado_por: item.aprovado_supervisor_por, lote_id: item.lote_id })))
        }
        setCarregando(false)
        return
      }
      if (data.perfil === 'setor_pessoal') {
        const [{ data: solicitacoes, error: erroSolicitacoes }, { data: colaboradores, error: erroColaboradores }, { data: empresas, error: erroEmpresas }] = await Promise.all([
          supabase.from('solicitacoes_pessoal').select('id,empresa_id,colaborador_id,tipo,status,solicitado_por,solicitado_em,respondido_por').order('solicitado_em', { ascending: false }).limit(150),
          supabase.from('colaboradores').select('id,nome'),
          supabase.from('empresas').select('id,nome'),
        ])
        if (erroSolicitacoes || erroColaboradores || erroEmpresas) {
          setErro('Não foi possível carregar as solicitações do Setor Pessoal.')
        } else {
          const colaboradorPorId = new Map((colaboradores ?? []).map(item => [item.id, item.nome]))
          const obraPorId = new Map((empresas ?? []).map(item => [item.id, item.nome]))
          setSolicitacoesPessoal((solicitacoes ?? []).map(item => ({
            ...item,
            colaborador_nome: colaboradorPorId.get(item.colaborador_id) ?? 'Colaborador não encontrado',
            obra_nome: obraPorId.get(item.empresa_id) ?? 'Obra não encontrada',
          })))
        }
        setCarregando(false)
        return
      }
      if (data.perfil === 'central') {
        const [{ data: supervisores, error: erroSupervisores }, { data: vinculos, error: erroVinculos }, { data: empresas, error: erroEmpresas }, { data: lotes, error: erroLotes }, { data: autorizacoes, error: erroAutorizacoes }, { data: notas, error: erroNotas }] = await Promise.all([
          supabase.from('usuarios').select('id,nome,email').eq('perfil', 'supervisor').eq('ativo', 1).order('nome'),
          supabase.from('supervisor_obras').select('usuario_id,empresa_id'),
          supabase.from('empresas').select('id,nome'),
          supabase.from('lotes_financeiros').select('id,empresa_id'),
          supabase.from('autorizacoes_pagamento').select('id,empresa_id,lote_id,beneficiario_nome,valor,aprovado_supervisor_por,aprovado_central_por'),
          supabase.from('notas_fiscais').select('id,empresa_id,lote_id,fornecedor_nome,numero_nf,aprovado_supervisor_por,aprovado_central_por'),
        ])
        if (erroSupervisores || erroVinculos || erroEmpresas || erroLotes || erroAutorizacoes || erroNotas) {
          setErro('Não foi possível carregar o painel do Escritório Central.')
        } else {
          const obraPorId = new Map((empresas ?? []).map(item => [item.id, item]))
          const obrasPorSupervisor = new Map<number, number[]>()
          for (const vinculo of vinculos ?? []) obrasPorSupervisor.set(vinculo.usuario_id, [...(obrasPorSupervisor.get(vinculo.usuario_id) ?? []), vinculo.empresa_id])
          const empresaPorLote = new Map((lotes ?? []).map(item => [item.id, item.empresa_id]))
          const pendenciasPorObra = new Map<number, number>()
          for (const item of [...(autorizacoes ?? []), ...(notas ?? [])]) {
            if (item.lote_id === null || item.aprovado_supervisor_por === null || item.aprovado_central_por !== null) continue
            const empresaId = empresaPorLote.get(item.lote_id)
            if (empresaId) pendenciasPorObra.set(empresaId, (pendenciasPorObra.get(empresaId) ?? 0) + 1)
          }
          setResumoCentral((supervisores ?? []).map(supervisor => {
            const obras = (obrasPorSupervisor.get(supervisor.id) ?? []).map(id => obraPorId.get(id)).filter((obra): obra is { id: number; nome: string } => !!obra)
            return { id: supervisor.id, nome: supervisor.nome, email: supervisor.email, obras, pendencias: obras.reduce((total, obra) => total + (pendenciasPorObra.get(obra.id) ?? 0), 0) }
          }))
          setItensCentralPendentes([
            ...(autorizacoes ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por !== null && item.aprovado_central_por === null).map(item => ({ id: item.id, tipo: 'ap' as const, empresa_id: item.empresa_id, nome: item.beneficiario_nome, referencia: 'Autorização de pagamento', valor: item.valor })),
            ...(notas ?? []).filter(item => item.lote_id !== null && item.aprovado_supervisor_por !== null && item.aprovado_central_por === null).map(item => ({ id: item.id, tipo: 'nf' as const, empresa_id: item.empresa_id, nome: item.fornecedor_nome, referencia: `Nota fiscal ${item.numero_nf ?? '—'}`, valor: null })),
          ])
          setAutorizacoesWeb((autorizacoes ?? []).map(item => ({ id: item.id, beneficiario_tipo: 'fornecedor', beneficiario_id: 0, beneficiario_nome: item.beneficiario_nome, descricao: null, valor: Number(item.valor), vencimento: null, aprovado_por: item.aprovado_central_por, lote_id: item.lote_id })))
          setNotasFiscaisWeb((notas ?? []).map(item => ({ id: item.id, fornecedor_id: null, fornecedor_nome: item.fornecedor_nome, numero_nf: item.numero_nf, data: '', valor_total: 0, aprovado_por: item.aprovado_central_por, lote_id: item.lote_id })))
        }
        setCarregando(false)
        return
      }
      const [colaboradores, lancamentos] = await Promise.all([
        supabase.from('colaboradores').select('nome,funcao,nascimento,salario_base').eq('empresa_id', data.empresa_id).eq('status', 'ativo'),
        supabase.from('lancamentos').select('id,descricao,valor,tipo,data,status').eq('empresa_id', data.empresa_id).order('created_at', { ascending: false }).limit(5),
      ])
      if (colaboradores.error || lancamentos.error) {
        setErro('Não foi possível carregar o resumo da obra.')
      } else {
        const hoje = new Date()
        const idades = (colaboradores.data ?? []).filter(item => item.nascimento).map(item => (hoje.getTime() - new Date(`${item.nascimento}T00:00:00`).getTime()) / 31557600000)
        const porFuncao = new Map<string, { quantidade: number; custo: number }>()
        for (const item of colaboradores.data ?? []) {
          if (!item.funcao) continue
          const atual = porFuncao.get(item.funcao) ?? { quantidade: 0, custo: 0 }
          atual.quantidade += 1; atual.custo += Number(item.salario_base); porFuncao.set(item.funcao, atual)
        }
        setResumo({
          ativos: colaboradores.data?.length ?? 0,
          custoFolha: (colaboradores.data ?? []).reduce((total, item) => total + Number(item.salario_base), 0),
          lancamentos: lancamentos.data ?? [],
          mediaIdade: idades.length ? Math.round(idades.reduce((total, idade) => total + idade, 0) / idades.length) : null,
          aniversariantes: (colaboradores.data ?? []).filter(item => item.nascimento?.slice(5, 7) === String(hoje.getMonth() + 1).padStart(2, '0')).map(item => ({ nome: item.nome, funcao: item.funcao, nascimento: item.nascimento! })).sort((a, b) => a.nascimento.localeCompare(b.nascimento)),
          porFuncao: [...porFuncao].map(([funcao, dados]) => ({ funcao, ...dados })).sort((a, b) => b.quantidade - a.quantidade),
        })
        const { data: listaFinanceira, error: erroFinanceiro } = await supabase
          .from('lancamentos')
          .select('id,descricao,valor,tipo,data,data_venc,status')
          .eq('empresa_id', data.empresa_id)
          .order('data', { ascending: false })
          .order('id', { ascending: false })
          .limit(100)
        if (erroFinanceiro) setErro('Não foi possível carregar os lançamentos financeiros.')
        else setLancamentos(listaFinanceira ?? [])
        const { data: listaColaboradores, error: erroColaboradores } = await supabase
          .from('colaboradores')
          .select('id,nome,funcao,setor,status,salario_base')
          .eq('empresa_id', data.empresa_id)
          .order('nome')
          .limit(200)
        if (erroColaboradores) setErro('Não foi possível carregar os colaboradores.')
        else setColaboradoresWeb(listaColaboradores ?? [])
        const { data: produtos, error: erroProdutos } = await supabase.from('produtos').select('id,codigo,nome,unidade,estoque_atual,estoque_minimo,valor_unitario').eq('empresa_id', data.empresa_id).order('nome')
        if (erroProdutos) setErro('Não foi possível carregar o estoque.')
        else setProdutosWeb(produtos ?? [])
        const [{ data: entradas, error: erroEntradas }, { data: saidas, error: erroSaidas }] = await Promise.all([
          supabase.from('almoxarifado_entradas').select('id,data,numero_nota,fornecedor_nome,valor_total').eq('empresa_id', data.empresa_id).order('data', { ascending: false }).order('id', { ascending: false }).limit(80),
          supabase.from('almoxarifado_saidas').select('id,data,produto_nome,produto_codigo,quantidade,retirado_por_nome,setor').eq('empresa_id', data.empresa_id).order('data', { ascending: false }).order('id', { ascending: false }).limit(80),
        ])
        if (erroEntradas || erroSaidas) setErro('Não foi possível carregar as movimentações do almoxarifado.')
        else { setEntradasWeb(entradas ?? []); setSaidasWeb(saidas ?? []) }
        const [{ data: autorizacoes, error: erroAutorizacoes }, { data: notasFiscais, error: erroNotasFiscais }] = await Promise.all([
          supabase.from('autorizacoes_pagamento').select('id,beneficiario_tipo,beneficiario_id,beneficiario_nome,descricao,valor,vencimento,aprovado_por,lote_id').eq('empresa_id', data.empresa_id).order('created_at', { ascending: false }).limit(100),
          supabase.from('notas_fiscais').select('id,fornecedor_id,fornecedor_nome,numero_nf,data,valor_total,aprovado_por,lote_id').eq('empresa_id', data.empresa_id).order('created_at', { ascending: false }).limit(100),
        ])
        if (erroAutorizacoes || erroNotasFiscais) setErro('Não foi possível carregar as autorizações e notas fiscais.')
        else { setAutorizacoesWeb(autorizacoes ?? []); setNotasFiscaisWeb(notasFiscais ?? []) }
        const { data: fornecedores, error: erroFornecedores } = await supabase.from('fornecedores').select('id,nome,tipo_pessoa,cnpj,cpf,email,telefone,categoria,forma_pagamento').eq('empresa_id', data.empresa_id).eq('ativo', 1).order('nome')
        if (erroFornecedores) setErro('Não foi possível carregar os fornecedores.')
        else setFornecedoresWeb(fornecedores ?? [])
        const { data: lotes, error: erroLotes } = await supabase.from('lotes_financeiros').select('id,numero,titulo,criado_por,created_at,enviado_em').eq('empresa_id', data.empresa_id).order('id', { ascending: false })
        if (erroLotes) setErro('Não foi possível carregar os lotes financeiros.')
        else setLotesWeb(lotes ?? [])
        const [categorias, contas] = await Promise.all([
          supabase.from('categorias').select('id,nome').eq('empresa_id', data.empresa_id).order('nome'),
          supabase.from('contas').select('id,nome').eq('empresa_id', data.empresa_id).order('nome'),
        ])
        if (categorias.error || contas.error) setErro('Não foi possível carregar categorias e contas financeiras.')
        else { setCategoriasWeb(categorias.data ?? []); setContasWeb(contas.data ?? []) }
      }
    }
    setCarregando(false)
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => carregarPerfil(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      void carregarPerfil(novaSessao)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function entrar(evento: FormEvent) {
    evento.preventDefault()
    setErro(''); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    if (error) setErro('E-mail ou senha inválidos.')
    setEnviando(false)
  }

  async function salvarLancamento(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil || !formLancamento.categoria_id || !formLancamento.conta_id) {
      setErro('Selecione uma categoria e uma conta.')
      return
    }
    setErro(''); setSalvandoLancamento(true)
    const { error } = await supabase.rpc('criar_lancamento', {
      p: {
        empresa_id: perfil.empresa_id,
        descricao: formLancamento.descricao.trim(),
        valor: Number(formLancamento.valor),
        tipo: formLancamento.tipo,
        status: 'pendente',
        data: formLancamento.data,
        data_venc: formLancamento.data_venc || null,
        categoria_id: Number(formLancamento.categoria_id),
        conta_id: Number(formLancamento.conta_id),
        observacao: null,
      },
    })
    setSalvandoLancamento(false)
    if (error) { setErro(`Não foi possível salvar o lançamento: ${error.message}`); return }
    setNovoLancamento(false)
    setFormLancamento({ descricao: '', valor: '', tipo: 'despesa', data: new Date().toISOString().slice(0, 10), data_venc: '', categoria_id: '', conta_id: '' })
    await carregarPerfil(session)
  }

  async function salvarFornecedor(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    setErro(''); setSalvandoFornecedor(true)
    const dadosFornecedor = {
      empresa_id: perfil.empresa_id, nome: formFornecedor.nome.trim(), tipo_pessoa: formFornecedor.tipo_pessoa,
      cnpj: formFornecedor.tipo_pessoa === 'pj' ? formFornecedor.cnpj.trim() || null : null,
      cpf: formFornecedor.tipo_pessoa === 'pf' ? formFornecedor.cpf.trim() || null : null,
      email: formFornecedor.email.trim() || null, telefone: formFornecedor.telefone.trim() || null,
      categoria: formFornecedor.categoria.trim() || null, forma_pagamento: formFornecedor.forma_pagamento,
      ativo: 1,
    }
    const { error } = editandoFornecedorId
      ? await supabase.from('fornecedores').update(dadosFornecedor).eq('id', editandoFornecedorId)
      : await supabase.from('fornecedores').insert(dadosFornecedor)
    setSalvandoFornecedor(false)
    if (error) { setErro(`Não foi possível cadastrar o fornecedor: ${error.message}`); return }
    setNovoFornecedor(false)
    setEditandoFornecedorId(null)
    setFormFornecedor({ nome: '', tipo_pessoa: 'pj', cnpj: '', cpf: '', email: '', telefone: '', categoria: '', forma_pagamento: 'boleto' })
    await carregarPerfil(session)
  }

  async function salvarAp(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    const fornecedor = fornecedoresWeb.find(item => item.id === Number(formAp.fornecedor_id))
    if (!fornecedor) { setErro('Selecione o fornecedor da autorização.'); return }
    setErro(''); setSalvandoAp(true)
    const dadosAp = {
      empresa_id: perfil.empresa_id, beneficiario_tipo: 'fornecedor', beneficiario_id: fornecedor.id,
      beneficiario_nome: fornecedor.nome, descricao: formAp.descricao.trim(), observacoes: formAp.observacoes.trim(),
      boletos: [{ valor: Number(formAp.valor), vencimento: formAp.vencimento }], solicitante: perfil.nome, autorizado_por: perfil.nome,
    }
    const { error } = editandoApId
      ? await supabase.rpc('atualizar_ap', { p: { ...dadosAp, id: editandoApId } })
      : await supabase.rpc('criar_ap', { p: dadosAp })
    setSalvandoAp(false)
    if (error) { setErro(`Não foi possível criar a autorização: ${error.message}`); return }
    setNovaAp(false); setEditandoApId(null); setFormAp({ fornecedor_id: '', descricao: '', valor: '', vencimento: new Date().toISOString().slice(0, 10), observacoes: '' })
    await carregarPerfil(session)
  }

  async function salvarNf(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    const fornecedor = fornecedoresWeb.find(item => item.id === Number(formNf.fornecedor_id))
    if (!fornecedor) { setErro('Selecione o fornecedor da nota fiscal.'); return }
    setErro(''); setSalvandoNf(true)
    const dadosNf = {
      empresa_id: perfil.empresa_id, fornecedor_id: fornecedor.id, fornecedor_nome: fornecedor.nome,
      numero_nf: formNf.numero_nf.trim(), numero_pedido: formNf.numero_pedido.trim(), data: formNf.data,
      data_emissao_nf: formNf.data, boletos: [{ valor: Number(formNf.valor), vencimento: formNf.vencimento }],
    }
    const { error } = editandoNfId
      ? await supabase.rpc('atualizar_nota_fiscal', { p: { ...dadosNf, id: editandoNfId } })
      : await supabase.rpc('criar_nota_fiscal', { p: dadosNf })
    setSalvandoNf(false)
    if (error) { setErro(`Não foi possível criar a nota fiscal: ${error.message}`); return }
    setNovaNf(false); setEditandoNfId(null); setFormNf({ fornecedor_id: '', numero_nf: '', numero_pedido: '', valor: '', vencimento: new Date().toISOString().slice(0, 10), data: new Date().toISOString().slice(0, 10) })
    await carregarPerfil(session)
  }

  function alternarItemLote(chave: string) {
    setItensLoteSelecionados(atual => {
      const proximo = new Set(atual)
      proximo.has(chave) ? proximo.delete(chave) : proximo.add(chave)
      return proximo
    })
  }

  async function criarLoteFinanceiro() {
    if (!perfil || itensLoteSelecionados.size === 0) { setErro('Selecione ao menos uma AP ou Nota Fiscal aprovada.'); return }
    const apIds = [...itensLoteSelecionados].filter(item => item.startsWith('ap-')).map(item => Number(item.slice(3)))
    const nfIds = [...itensLoteSelecionados].filter(item => item.startsWith('nf-')).map(item => Number(item.slice(3)))
    setErro(''); setProcessandoLote(true)
    const { error } = await supabase.rpc('fechar_lote_financeiro', { p: { empresa_id: perfil.empresa_id, ap_ids: apIds, nf_ids: nfIds, criado_por: perfil.nome } })
    setProcessandoLote(false)
    if (error) { setErro(`Não foi possível criar o lote: ${error.message}`); return }
    setItensLoteSelecionados(new Set())
    await carregarPerfil(session)
  }

  async function enviarLoteFinanceiro(loteId: number) {
    if (!session) return
    setErro(''); setProcessandoLote(true)
    const { error } = await supabase.rpc('enviar_lotes_supervisor', { p_lote_ids: [loteId] })
    setProcessandoLote(false)
    if (error) { setErro(`Não foi possível enviar o lote: ${error.message}`); return }
    await carregarPerfil(session)
  }

  async function salvarColaborador(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    setErro(''); setSalvandoColaborador(true)
    const { error } = await supabase.from('colaboradores').insert({
      empresa_id: perfil.empresa_id,
      nome: formColaborador.nome.trim(),
      funcao: formColaborador.funcao.trim() || null,
      setor: formColaborador.setor.trim() || null,
      data_admissao: formColaborador.data_admissao || null,
      salario_base: formColaborador.salario_base ? Number(formColaborador.salario_base) : null,
      status: 'ativo',
      pcd: 0, alojado: 0, tem_baixada: 0,
    })
    setSalvandoColaborador(false)
    if (error) { setErro(`Não foi possível cadastrar o colaborador: ${error.message}`); return }
    setNovoColaborador(false)
    setFormColaborador({ nome: '', funcao: '', setor: '', data_admissao: new Date().toISOString().slice(0, 10), salario_base: '' })
    await carregarPerfil(session)
  }

  async function salvarEntrada(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    const produto = produtosWeb.find(item => item.id === Number(formEntrada.produto_id))
    if (!produto) { setErro('Selecione o material para registrar a entrada.'); return }
    setErro(''); setSalvandoEntrada(true)
    const { error } = await supabase.rpc('criar_entrada_almoxarifado', { p: {
      empresa_id: perfil.empresa_id,
      numero_nota: formEntrada.numero_nota.trim(),
      numero_pedido: '',
      data: formEntrada.data,
      fornecedor_nome: formEntrada.fornecedor_nome.trim() || 'Fornecedor não informado',
      valor_desconto: 0,
      itens: [{ produto_id: produto.id, produto_codigo: produto.codigo, produto_nome: produto.nome, quantidade: Number(formEntrada.quantidade), valor_unitario: Number(formEntrada.valor_unitario) }],
    } })
    setSalvandoEntrada(false)
    if (error) { setErro(`Não foi possível registrar a entrada: ${error.message}`); return }
    setNovaEntrada(false)
    setFormEntrada({ produto_id: '', quantidade: '', valor_unitario: '', fornecedor_nome: '', numero_nota: '', data: new Date().toISOString().slice(0, 10) })
    await carregarPerfil(session)
  }

  async function salvarSaida(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil) return
    const produto = produtosWeb.find(item => item.id === Number(formSaida.produto_id))
    if (!produto) { setErro('Selecione o material para registrar a saída.'); return }
    setErro(''); setSalvandoSaida(true)
    const { error } = await supabase.rpc('criar_saida_almoxarifado', { p: {
      empresa_id: perfil.empresa_id,
      data: formSaida.data,
      produto_id: produto.id,
      produto_codigo: produto.codigo,
      produto_nome: produto.nome,
      quantidade: Number(formSaida.quantidade),
      retirado_por_tipo: 'pessoa_avulsa',
      retirado_por_nome: formSaida.retirado_por_nome.trim(),
      setor: formSaida.setor.trim() || null,
      liberado_por: perfil.nome,
    } })
    setSalvandoSaida(false)
    if (error) { setErro(`Não foi possível registrar a saída: ${error.message}`); return }
    setNovaSaida(false)
    setFormSaida({ produto_id: '', quantidade: '', retirado_por_nome: '', setor: '', data: new Date().toISOString().slice(0, 10) })
    await carregarPerfil(session)
  }

  async function salvarUsuarioMaster(evento: FormEvent) {
    evento.preventDefault()
    if (!session || !formUsuarioMaster.empresa_id) {
      setErro('Selecione a obra para o novo usuário.')
      return
    }
    setErro(''); setSalvandoUsuarioMaster(true)
    const { data, error } = await supabase.functions.invoke('usuarios-admin', {
      body: { acao: 'criar', nome: formUsuarioMaster.nome.trim(), email: formUsuarioMaster.email.trim(), senha: formUsuarioMaster.senha, perfil: formUsuarioMaster.perfil, empresa_id: Number(formUsuarioMaster.empresa_id) },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setSalvandoUsuarioMaster(false)
    if (error || data?.error) {
      setErro(`Não foi possível criar o usuário: ${data?.error ?? error?.message ?? 'erro desconhecido'}`)
      return
    }
    setNovoUsuarioMaster(false)
    setFormUsuarioMaster({ nome: '', email: '', senha: '', perfil: 'admin', empresa_id: '' })
    await carregarPerfil(session)
  }

  async function responderSolicitacaoPessoal(evento: FormEvent, solicitacao: SolicitacaoPessoal) {
    evento.preventDefault()
    if (!perfil || anexosResposta.length === 0) {
      setErro('Anexe pelo menos um documento antes de responder.')
      return
    }
    setErro(''); setSalvandoRespostaPessoal(true)
    try {
      for (const [ordem, arquivo] of anexosResposta.entries()) {
        const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const caminho = `${solicitacao.empresa_id}/solicitacoes/${solicitacao.id}/${Date.now()}-${ordem}-${nomeSeguro}`
        const { error: erroUpload } = await supabase.storage.from('documentos-rh').upload(caminho, arquivo)
        if (erroUpload) throw erroUpload
        const { error: erroAnexo } = await supabase.from('solicitacoes_pessoal_anexos').insert({ solicitacao_id: solicitacao.id, caminho: `supabase://documentos-rh/${caminho}`, nome: arquivo.name, origem: 'setor_pessoal', ordem })
        if (erroAnexo) throw erroAnexo
      }
      const { error: erroResposta } = await supabase.from('solicitacoes_pessoal').update({ status: 'respondido', respondido_por: perfil.nome, resposta_observacoes: respostaPessoal.trim() || null, respondido_em: new Date().toISOString() }).eq('id', solicitacao.id)
      if (erroResposta) throw erroResposta
      setSolicitacaoRespondendoId(null); setRespostaPessoal(''); setAnexosResposta([])
      await carregarPerfil(session)
    } catch (causa) {
      setErro(`Não foi possível enviar a resposta: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`)
    } finally {
      setSalvandoRespostaPessoal(false)
    }
  }

  async function aprovarItemPendente(item: ItemCentral) {
    if (!session) return
    const chave = `${item.tipo}-${item.id}`
    setErro(''); setItemCentralProcessando(chave)
    const { error } = await supabase.rpc(item.tipo === 'ap' ? 'aprovar_ap' : 'aprovar_nota_fiscal', { p_id: item.id })
    setItemCentralProcessando(null)
    if (error) { setErro(`Não foi possível aprovar o item: ${error.message}`); return }
    await carregarPerfil(session)
  }

  async function aprovarItemCentral(item: ItemCentral) { await aprovarItemPendente(item) }

  async function aprovarItemFinanceiro(tipo: 'ap' | 'nf', id: number) {
    if (!session) return
    const chave = `${tipo}-${id}`
    setErro(''); setItemFinanceiroProcessando(chave)
    const { error } = await supabase.rpc(tipo === 'ap' ? 'aprovar_ap' : 'aprovar_nota_fiscal', { p_id: id })
    setItemFinanceiroProcessando(null)
    if (error) { setErro(`Não foi possível aprovar o item: ${error.message}`); return }
    await carregarPerfil(session)
  }

  function caminhoStorage(caminho: string) {
    return caminho.startsWith('supabase://documentos-rh/') ? caminho.slice('supabase://documentos-rh/'.length) : caminho
  }

  async function carregarAnexosFinanceiros(tipo = documentoFinanceiroTipo, idTexto = documentoFinanceiroId) {
    if (!idTexto) { setAnexosFinanceiros([]); return }
    setCarregandoAnexosFinanceiros(true)
    const resultado = tipo === 'ap'
      ? await supabase.from('autorizacoes_pagamento_anexos').select('id,caminho,ordem').eq('ap_id', Number(idTexto)).order('ordem')
      : await supabase.from('notas_fiscais_anexos').select('id,caminho,categoria,ordem').eq('nota_id', Number(idTexto)).order('ordem')
    setCarregandoAnexosFinanceiros(false)
    if (resultado.error) { setErro(`Não foi possível carregar os anexos: ${resultado.error.message}`); return }
    setAnexosFinanceiros((resultado.data ?? []) as AnexoFinanceiro[])
  }

  async function enviarAnexosFinanceiros(evento: FormEvent) {
    evento.preventDefault()
    if (!perfil || !documentoFinanceiroId || novosAnexosFinanceiros.length === 0) { setErro('Selecione o documento e ao menos um arquivo.'); return }
    if (!['admin', 'master'].includes(perfil.perfil)) { setErro('Seu perfil possui acesso apenas para consulta de anexos financeiros.'); return }
    setErro(''); setEnviandoAnexosFinanceiros(true)
    try {
      for (const [ordem, arquivo] of novosAnexosFinanceiros.entries()) {
        const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const caminho = `${perfil.empresa_id}/financeiro/${documentoFinanceiroTipo}/${documentoFinanceiroId}/${Date.now()}-${ordem}-${nomeSeguro}`
        const { error: erroUpload } = await supabase.storage.from('documentos-rh').upload(caminho, arquivo)
        if (erroUpload) throw erroUpload
        const resultadoRegistro = documentoFinanceiroTipo === 'ap'
          ? await supabase.from('autorizacoes_pagamento_anexos').insert({ ap_id: Number(documentoFinanceiroId), caminho: `supabase://documentos-rh/${caminho}`, ordem })
          : await supabase.from('notas_fiscais_anexos').insert({ nota_id: Number(documentoFinanceiroId), caminho: `supabase://documentos-rh/${caminho}`, categoria: 'nota', ordem })
        const erroRegistro = resultadoRegistro.error
        if (erroRegistro) throw erroRegistro
      }
      setNovosAnexosFinanceiros([])
      await carregarAnexosFinanceiros()
    } catch (causa) {
      setErro(`Não foi possível enviar os anexos: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`)
    } finally {
      setEnviandoAnexosFinanceiros(false)
    }
  }

  async function obterUrlArquivo(caminho: string) {
    const { data, error } = await supabase.storage.from('documentos-rh').createSignedUrl(caminhoStorage(caminho), 60)
    if (error || !data?.signedUrl) throw error ?? new Error('Não foi possível gerar o acesso temporário ao arquivo.')
    return data.signedUrl
  }

  async function visualizarArquivo(caminho: string) {
    try { window.open(await obterUrlArquivo(caminho), '_blank', 'noopener') }
    catch (causa) { setErro(`Não foi possível abrir o arquivo: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`) }
  }

  async function baixarArquivo(caminho: string) {
    try {
      const resposta = await fetch(await obterUrlArquivo(caminho))
      if (!resposta.ok) throw new Error('Falha ao baixar o arquivo.')
      const objeto = URL.createObjectURL(await resposta.blob())
      const link = document.createElement('a'); link.href = objeto; link.download = caminhoStorage(caminho).split('/').at(-1) ?? 'documento'; link.click(); URL.revokeObjectURL(objeto)
    } catch (causa) { setErro(`Não foi possível baixar o arquivo: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`) }
  }

  async function imprimirArquivo(caminho: string) {
    try {
      const resposta = await fetch(await obterUrlArquivo(caminho))
      if (!resposta.ok) throw new Error('Falha ao preparar a impressão.')
      const objeto = URL.createObjectURL(await resposta.blob())
      const janela = window.open(objeto, '_blank', 'noopener')
      if (!janela) throw new Error('Permita pop-ups para imprimir o documento.')
      janela.addEventListener('load', () => { janela.focus(); janela.print() }, { once: true })
      window.setTimeout(() => URL.revokeObjectURL(objeto), 60_000)
    } catch (causa) { setErro(`Não foi possível imprimir o arquivo: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`) }
  }

  async function assinarPdfNoStorage(caminho: string) {
    if (!perfil || !carimboUrl) { setErro('Cadastre sua assinatura antes de assinar o PDF.'); return }
    if (!documentoFinanceiroId) { setErro('Selecione a AP ou a Nota Fiscal para assinar.'); return }
    try {
      const resposta = await fetch(await obterUrlArquivo(caminho))
      if (!resposta.ok) throw new Error('Não foi possível abrir o PDF original.')
      const pdf = await PDFDocument.load(await resposta.arrayBuffer())
      const dadosAssinatura = await fetch(carimboUrl).then(r => r.arrayBuffer())
      let imagem
      try { imagem = await pdf.embedPng(dadosAssinatura) }
      catch { imagem = await pdf.embedJpg(dadosAssinatura) }
      const pagina = pdf.getPages()[0]
      const { width } = pagina.getSize()
      const escala = Math.min(150 / imagem.width, 70 / imagem.height, 1)
      const assinaturaLargura = imagem.width * escala
      const assinaturaAltura = imagem.height * escala
      const x = Math.max(24, width - assinaturaLargura - 36)
      pagina.drawRectangle({ x: x - 8, y: 20, width: assinaturaLargura + 16, height: assinaturaAltura + 32, color: rgb(1, 1, 1), opacity: 0.92, borderColor: rgb(0.15, 0.35, 0.7), borderWidth: 0.7 })
      pagina.drawImage(imagem, { x, y: 44, width: assinaturaLargura, height: assinaturaAltura })
      pagina.drawText(`Aprovado por ${perfil.nome} em ${new Date().toLocaleString('pt-BR')}`, { x, y: 28, size: 7, color: rgb(0.08, 0.18, 0.36) })
      const arquivoOriginal = caminhoStorage(caminho).split('/').at(-1)?.replace(/\.pdf$/i, '') ?? 'documento'
      const destino = `${perfil.empresa_id}/financeiro/assinados/${documentoFinanceiroTipo}/${documentoFinanceiroId}/${Date.now()}-${arquivoOriginal}-assinado.pdf`
      const bytesPdf = await pdf.save()
      const bufferPdf = bytesPdf.buffer.slice(bytesPdf.byteOffset, bytesPdf.byteOffset + bytesPdf.byteLength) as ArrayBuffer
      const { error: erroUpload } = await supabase.storage.from('documentos-rh').upload(destino, new Blob([bufferPdf], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: false })
      if (erroUpload) throw erroUpload
      const { error: erroRegistro } = await supabase.rpc('registrar_pdf_assinado_web', { p_tipo: documentoFinanceiroTipo, p_id: Number(documentoFinanceiroId), p_caminho: `supabase://documentos-rh/${destino}` })
      if (erroRegistro) throw erroRegistro
      await visualizarArquivo(`supabase://documentos-rh/${destino}`)
    } catch (causa) {
      setErro(`Não foi possível aplicar a assinatura: ${causa instanceof Error ? causa.message : 'erro desconhecido'}`)
    }
  }

  function selecionarCarimbo(arquivo: File | undefined) {
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => {
      const imagem = new Image()
      imagem.onload = () => {
        const limite = 400
        const escala = Math.min(1, limite / Math.max(imagem.width, imagem.height))
        const quadro = document.createElement('canvas')
        quadro.width = imagem.width * escala; quadro.height = imagem.height * escala
        quadro.getContext('2d')?.drawImage(imagem, 0, 0, quadro.width, quadro.height)
        setCarimboUrl(quadro.toDataURL('image/png'))
      }
      imagem.src = String(leitor.result)
    }
    leitor.readAsDataURL(arquivo)
  }

  async function salvarCarimbo() {
    setErro(''); setSalvandoCarimbo(true)
    const { error } = await supabase.rpc('atualizar_meu_carimbo', { p_carimbo_url: carimboUrl || null })
    setSalvandoCarimbo(false)
    if (error) { setErro(`Não foi possível salvar a assinatura: ${error.message}`); return }
    setPerfil(atual => atual ? { ...atual, carimbo_url: carimboUrl || null } : atual)
  }

  if (carregando) return <main className="min-h-screen grid place-items-center bg-surface text-white">Carregando…</main>

  if (!session || !perfil) {
    return <main className="min-h-screen grid place-items-center bg-surface px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-card p-8 space-y-4">
        <h1 className="text-center text-xl font-bold text-white">ADM PRO</h1>
        <p className="text-center text-sm text-gray-400">Acesso web seguro</p>
        <label className="block text-sm text-gray-200">E-mail<input className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-white" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label className="block text-sm text-gray-200">Senha<input className="mt-1 w-full rounded-md border border-surface-border bg-surface px-3 py-2 text-white" type="password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
        {erro && <p className="rounded-md bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}
        <button className="w-full rounded-md bg-blue-600 py-2 font-medium text-white disabled:opacity-60" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  }

  const navegar = (destino: 'inicio' | 'financeiro' | 'ap' | 'notas' | 'fornecedores' | 'lotes' | 'rh' | 'almox' | 'estoque' | 'entradas' | 'saidas' | 'supervisor' | 'pessoal' | 'central') => { setPagina(destino); setMenuAberto(false) }
  const colaboradoresFiltrados = colaboradoresWeb.filter(item => {
    const correspondeBusca = `${item.nome} ${item.funcao ?? ''} ${item.setor ?? ''}`.toLowerCase().includes(buscaColaborador.toLowerCase())
    return correspondeBusca && (filtroStatusRh === 'todos' || item.status === filtroStatusRh)
  })
  const resumoStatusRh = {
    ativos: colaboradoresWeb.filter(item => item.status === 'ativo').length,
    ferias: colaboradoresWeb.filter(item => item.status === 'ferias').length,
    afastados: colaboradoresWeb.filter(item => item.status === 'afastado').length,
  }
  const lancamentosFiltrados = lancamentos.filter(item => {
    const correspondeBusca = `${item.descricao} ${item.status} ${item.data}`.toLowerCase().includes(buscaLancamento.toLowerCase())
    return correspondeBusca && (filtroTipoFinanceiro === 'todos' || item.tipo === filtroTipoFinanceiro)
  })
  const resumoFinanceiro = {
    receitas: lancamentos.filter(item => item.tipo === 'receita' && item.status !== 'cancelado').reduce((total, item) => total + Number(item.valor), 0),
    despesas: lancamentos.filter(item => item.tipo === 'despesa' && item.status !== 'cancelado').reduce((total, item) => total + Number(item.valor), 0),
    pendentes: lancamentos.filter(item => item.status === 'pendente').length,
  }
  const produtosFiltrados = produtosWeb.filter(item => `${item.codigo} ${item.nome} ${item.unidade ?? ''}`.toLowerCase().includes(buscaProduto.toLowerCase()))
  const produtosAbaixoMinimo = produtosWeb.filter(item => Number(item.estoque_atual) <= Number(item.estoque_minimo)).length

  return <div className="flex h-screen overflow-hidden bg-background text-white">
    {menuAberto && <button aria-label="Fechar menu" className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setMenuAberto(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-30 flex w-[200px] shrink-0 flex-col border-r border-surface-border bg-[#1f2d46] px-3 py-4 transition-transform md:relative md:translate-x-0 ${menuAberto ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-7 flex items-center gap-2.5 px-1"><div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500"><Building2 size={16} /></div><div className="min-w-0"><p className="text-xs font-bold">ADM PRO</p><p className="truncate text-[10px] text-gray-400">{perfil.perfil === 'admin' ? 'Gestão da obra' : nomesPerfil[perfil.perfil] ?? 'Portal web'}</p></div></div>
      <nav className="flex-1 space-y-1">
        {perfil.perfil === 'master' && <button className="flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm"><Building2 size={16} />Painel Administrador</button>}
        {perfil.perfil === 'supervisor' && <button className={pagina === 'supervisor' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('supervisor')}><LayoutDashboard size={16} />Visão geral</button>}
        {perfil.perfil === 'setor_pessoal' && <button className={pagina === 'pessoal' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('pessoal')}><UsersRound size={16} />Solicitações</button>}
        {perfil.perfil === 'central' && <button className={pagina === 'central' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('central')}><Building2 size={16} />Painel Central</button>}
        {['admin', 'gestor'].includes(perfil.perfil) && <button className={pagina === 'inicio' ? 'flex w-full items-center gap-3 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('inicio')}><LayoutDashboard size={16} />Início</button>}
        <div className="my-3 border-t border-surface-border" />
        {perfil.perfil === 'admin' && <><p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Recursos Humanos</p><button className={pagina === 'rh' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('rh')}><UsersRound size={15} />Colaboradores</button></>}
        {['admin', 'gestor', 'almoxarife'].includes(perfil.perfil) && <><div className="my-3 border-t border-surface-border" /><p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Almoxarifado</p><button className={pagina === 'almox' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('almox')}><LayoutDashboard size={15} />Painel inicial</button>{perfil.perfil !== 'gestor' && <><button className={pagina === 'entradas' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('entradas')}><PackagePlus size={15} />Entradas</button><button className={pagina === 'saidas' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('saidas')}><PackageMinus size={15} />Saídas</button></>}<button className={pagina === 'estoque' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('estoque')}><Boxes size={15} />Estoque</button></>}
        <div className="my-3 border-t border-surface-border" />
        <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">Financeiro</p>
        {perfil.perfil === 'gestor' && <><button className={pagina === 'ap' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('ap')}><Wallet size={15} />Autorizações de pagamento</button><button className={pagina === 'notas' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('notas')}><ClipboardList size={15} />Notas fiscais</button></>}
        {perfil.perfil === 'admin' && <><button className={pagina === 'ap' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('ap')}><Wallet size={15} />Autorizações de pagamento</button><button className={pagina === 'notas' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('notas')}><ClipboardList size={15} />Notas fiscais</button><button className={pagina === 'lotes' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('lotes')}><ArrowLeftRight size={15} />Lotes enviados</button><button className={pagina === 'fornecedores' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('fornecedores')}><UsersRound size={15} />Fornecedores</button></>}
        {perfil.perfil === 'admin' && <button className={pagina === 'financeiro' ? 'flex w-full items-center gap-3 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium shadow-glow-sm' : 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-surface-hover'} onClick={() => navegar('financeiro')}><Wallet size={15} />Lançamentos</button>}
      </nav>
      <div className="border-t border-surface-border pt-4"><div className="flex items-center gap-2.5 px-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-400">{perfil.nome.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-gray-200">{perfil.nome}</p><p className="truncate text-[11px] text-gray-500">{nomesPerfil[perfil.perfil] ?? perfil.perfil}</p></div><button title="Sair" className="rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-400" onClick={() => void supabase.auth.signOut()}><LogOut size={14} /></button></div></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><header className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border bg-[#1f2d46] px-3 md:px-5"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-gray-300 hover:bg-surface-hover md:hidden" aria-label="Abrir menu" onClick={() => setMenuAberto(aberto => !aberto)}>{menuAberto ? <X size={20} /> : <Menu size={20} />}</button><span className="hidden text-xs text-gray-500 md:block">ADM PRO</span></div><div className="flex items-center gap-3"><div className="hidden w-52 items-center gap-2 rounded-lg border border-[#40506d] bg-[#263550] px-3 py-1.5 text-xs text-gray-400 md:flex"><Search size={13} />Buscar…</div><button className="relative rounded-lg p-2 text-gray-300 hover:bg-surface-hover" aria-label="Notificações"><Bell size={15} /><span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-400" /></button><span className="hidden max-w-48 truncate text-xs text-gray-300 lg:block">{perfil.email}</span></div></header><main className="flex-1 overflow-y-auto bg-[#222321] p-4 md:p-5">
      {erro && <p className="mt-6 rounded-md bg-red-950/50 p-3 text-sm text-red-300">{erro}</p>}
      {perfil.perfil === 'supervisor' && <section className="mx-auto mt-6 max-w-7xl"><div className="rounded-2xl border border-surface-border bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Itens para sua aprovação</h2><p className="mt-1 text-sm text-gray-400">Autorizações e notas fiscais das suas obras que aguardam a primeira liberação.</p></div><span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-sm text-amber-300">{itensSupervisorPendentes.length} pendente(s)</span></div><div className="mt-4 divide-y divide-surface-border">{itensSupervisorPendentes.length === 0 ? <p className="py-5 text-sm text-gray-400">Não há itens aguardando sua aprovação.</p> : itensSupervisorPendentes.map(item => <article key={`${item.tipo}-${item.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{item.nome}</p><p className="mt-1 text-sm text-gray-400">{item.referencia}{item.valor !== null ? ` · ${Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</p></div><button className="w-fit rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium disabled:opacity-60" disabled={itemCentralProcessando === `${item.tipo}-${item.id}`} onClick={() => void aprovarItemPendente(item)}>{itemCentralProcessando === `${item.tipo}-${item.id}` ? 'Aprovando…' : 'Aprovar'}</button></article>)}</div></div></section>}
      {perfil.perfil === 'central' && <section className="mx-auto mt-6 max-w-7xl"><div className="rounded-2xl border border-surface-border bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Itens aguardando aprovação</h2><p className="mt-1 text-sm text-gray-400">Itens já aprovados pelo Supervisor e prontos para decisão do Escritório Central.</p></div><span className="rounded-full bg-amber-500/15 px-3 py-1.5 text-sm text-amber-300">{itensCentralPendentes.length} pendente(s)</span></div><div className="mt-4 divide-y divide-surface-border">{itensCentralPendentes.length === 0 ? <p className="py-5 text-sm text-gray-400">Não há itens aguardando aprovação.</p> : itensCentralPendentes.map(item => <article key={`${item.tipo}-${item.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{item.nome}</p><p className="mt-1 text-sm text-gray-400">{item.referencia}{item.valor !== null ? ` · ${Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</p></div><button className="w-fit rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium disabled:opacity-60" disabled={itemCentralProcessando === `${item.tipo}-${item.id}`} onClick={() => void aprovarItemCentral(item)}>{itemCentralProcessando === `${item.tipo}-${item.id}` ? 'Aprovando…' : 'Aprovar'}</button></article>)}</div></div></section>}
      {perfil.perfil === 'setor_pessoal' && <section className="mx-auto mt-6 max-w-7xl"><div className="rounded-2xl border border-surface-border bg-surface p-5"><h2 className="font-semibold">Responder solicitações pendentes</h2><p className="mt-1 text-sm text-gray-400">Anexe os documentos de retorno antes de concluir a resposta.</p><div className="mt-4 space-y-3">{solicitacoesPessoal.filter(item => item.status === 'pendente').length === 0 ? <p className="text-sm text-gray-400">Não há solicitações aguardando resposta.</p> : solicitacoesPessoal.filter(item => item.status === 'pendente').map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{item.colaborador_nome}</p><p className="mt-1 truncate text-sm text-gray-400">{tiposSolicitacao[item.tipo] ?? item.tipo} · {item.obra_nome}</p></div><button className="w-fit rounded-lg border border-brand-500/40 px-3 py-2 text-sm text-brand-300 hover:bg-brand-500/10" onClick={() => { setSolicitacaoRespondendoId(aberto => aberto === item.id ? null : item.id); setRespostaPessoal(''); setAnexosResposta([]) }}>{solicitacaoRespondendoId === item.id ? 'Cancelar' : 'Responder'}</button></div>{solicitacaoRespondendoId === item.id && <form onSubmit={evento => void responderSolicitacaoPessoal(evento, item)} className="mt-4 grid gap-3 border-t border-surface-border pt-4"><label className="text-sm text-gray-300">Observações<textarea className="mt-1 min-h-24 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-white" value={respostaPessoal} onChange={e => setRespostaPessoal(e.target.value)} placeholder="Informe os documentos e orientações para a obra." /></label><label className="text-sm text-gray-300">Documentos de retorno<input className="mt-1 block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" type="file" multiple onChange={e => setAnexosResposta(Array.from(e.target.files ?? []))} required /></label>{anexosResposta.length > 0 && <p className="text-xs text-gray-400">{anexosResposta.map(arquivo => arquivo.name).join(', ')}</p>}<div><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoRespostaPessoal}>{salvandoRespostaPessoal ? 'Enviando…' : 'Enviar resposta'}</button></div></form>}</article>)}</div></div></section>}
      {perfil.perfil === 'master' && <section className="mx-auto mt-6 max-w-7xl"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-400">Gerencie os acessos do sistema a partir deste painel.</p><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoUsuarioMaster(aberto => !aberto)}>{novoUsuarioMaster ? 'Cancelar cadastro' : '+ Novo usuário'}</button></div>{novoUsuarioMaster && <form onSubmit={salvarUsuarioMaster} className="mt-4 grid gap-3 rounded-2xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Nome completo<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formUsuarioMaster.nome} onChange={e => setFormUsuarioMaster({ ...formUsuarioMaster, nome: e.target.value })} required /></label><label className="text-sm text-gray-300">E-mail<input type="email" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formUsuarioMaster.email} onChange={e => setFormUsuarioMaster({ ...formUsuarioMaster, email: e.target.value })} required /></label><label className="text-sm text-gray-300">Senha inicial<input type="password" minLength={6} className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formUsuarioMaster.senha} onChange={e => setFormUsuarioMaster({ ...formUsuarioMaster, senha: e.target.value })} required /></label><label className="text-sm text-gray-300">Perfil<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formUsuarioMaster.perfil} onChange={e => setFormUsuarioMaster({ ...formUsuarioMaster, perfil: e.target.value })}><option value="admin">Administrador</option><option value="gestor">Gestor</option><option value="almoxarife">Almoxarife</option><option value="supervisor">Supervisor</option><option value="central">Escritório Central</option><option value="setor_pessoal">Setor Pessoal</option></select></label><label className="text-sm text-gray-300">Obra<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formUsuarioMaster.empresa_id} onChange={e => setFormUsuarioMaster({ ...formUsuarioMaster, empresa_id: e.target.value })} required><option value="">Selecione a obra</option>{obrasMaster.map(obra => <option key={obra.id} value={obra.id}>{obra.titulo_obra || obra.nome}</option>)}</select></label><div className="md:col-span-2"><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoUsuarioMaster}>{salvandoUsuarioMaster ? 'Criando…' : 'Criar usuário'}</button></div></form>}</section>}
      {perfil.perfil === 'master' && resumoMaster && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ADMINISTRAÇÃO GERAL</p><h2 className="mt-1 text-2xl font-bold">Painel Administrador</h2><p className="mt-1 text-sm text-gray-400">Visão consolidada da estrutura da empresa e dos acessos do sistema.</p></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-brand-300"><Building2 size={16} /><p className="text-xs font-bold uppercase tracking-wide">Obras</p></div><p className="mt-5 text-4xl font-bold">{resumoMaster.obras}</p><p className="mt-1 text-sm text-gray-400">empreendimentos cadastrados</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-emerald-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Usuários ativos</p></div><p className="mt-5 text-4xl font-bold text-emerald-300">{resumoMaster.usuarios}</p><p className="mt-1 text-sm text-gray-400">com acesso ao sistema</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-purple-300"><LayoutDashboard size={16} /><p className="text-xs font-bold uppercase tracking-wide">Supervisores</p></div><p className="mt-5 text-4xl font-bold text-purple-300">{resumoMaster.supervisores}</p><p className="mt-1 text-sm text-gray-400">responsáveis por obras</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-amber-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Administradores</p></div><p className="mt-5 text-4xl font-bold text-amber-300">{resumoMaster.administradores}</p><p className="mt-1 text-sm text-gray-400">gestão operacional</p></div></div><div className="mt-6 grid gap-5 lg:grid-cols-3"><section className="rounded-2xl border border-surface-border bg-surface p-5 lg:col-span-2"><h3 className="font-semibold">Estrutura operacional</h3><p className="mt-1 text-sm text-gray-400">Acesso organizado pelos mesmos núcleos do aplicativo desktop.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Escritório Central</p><p className="mt-1 text-sm text-gray-400">Aprovação e acompanhamento de lotes.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Setor Pessoal</p><p className="mt-1 text-sm text-gray-400">Fila de solicitações trabalhistas.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Supervisores</p><p className="mt-1 text-sm text-gray-400">Gestão agrupada por obras vinculadas.</p></div><div className="rounded-xl bg-surface-hover p-4"><p className="font-medium">Administração da obra</p><p className="mt-1 text-sm text-gray-400">RH, financeiro e almoxarifado.</p></div></div></section><section className="rounded-2xl border border-surface-border bg-surface p-5"><h3 className="font-semibold">Próxima conferência</h3><p className="mt-3 text-sm leading-6 text-gray-400">Revise os acessos ativos e os vínculos de supervisores às obras antes de liberar novos usuários.</p><div className="mt-6 rounded-xl border border-brand-500/25 bg-brand-500/10 p-3 text-sm text-brand-200">A gestão completa de usuários e obras continua sendo migrada para as telas web.</div></section></div></section>}
      {perfil.perfil === 'master' && resumoMaster && <section className="mx-auto -mt-5 max-w-7xl pb-6"><div className="grid gap-5 lg:grid-cols-2"><section className="overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex items-center justify-between border-b border-surface-border p-5"><div><h3 className="font-semibold">Obras cadastradas</h3><p className="mt-1 text-sm text-gray-400">Visão rápida dos empreendimentos.</p></div><span className="text-sm text-gray-400">{obrasMaster.length} total</span></div><div className="divide-y divide-surface-border">{obrasMaster.slice(0, 6).map(obra => <div key={obra.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{obra.titulo_obra || obra.nome}</p><p className="mt-1 truncate text-xs text-gray-400">{obra.nome}</p></div><span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs text-gray-300">{obra.estado || 'Sem UF'}</span></div>)}{obrasMaster.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhuma obra cadastrada.</p>}</div></section><section className="overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex items-center justify-between border-b border-surface-border p-5"><div><h3 className="font-semibold">Usuários do sistema</h3><p className="mt-1 text-sm text-gray-400">Contas e perfis cadastrados.</p></div><span className="text-sm text-gray-400">{usuariosMaster.length} total</span></div><div className="divide-y divide-surface-border">{usuariosMaster.slice(0, 6).map(usuario => <div key={usuario.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium">{usuario.nome}</p><p className="mt-1 truncate text-xs text-gray-400">{usuario.email} · {nomesPerfil[usuario.perfil] ?? usuario.perfil}</p></div><span className={usuario.ativo ? 'rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-gray-500/15 px-2.5 py-1 text-xs text-gray-400'}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span></div>)}{usuariosMaster.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhum usuário cadastrado.</p>}</div></section></div></section>}
      {perfil.perfil === 'supervisor' && pagina === 'supervisor' && resumoSupervisor && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">VISÃO GERAL</p><h2 className="mt-1 text-2xl font-bold">Suas obras</h2><p className="mt-1 text-sm text-gray-400">Acompanhamento consolidado das obras sob sua gestão.</p></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-emerald-300"><Building2 size={16} /><p className="text-xs font-bold uppercase tracking-wide">Sua gestão</p></div><p className="mt-5 text-3xl font-bold">{resumoSupervisor.obras.length}</p><p className="mt-1 text-sm text-gray-400">obras · {resumoSupervisor.colaboradores} colaboradores</p></div><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-brand-300"><ArrowLeftRight size={16} /><p className="text-xs font-bold uppercase tracking-wide">Movimentação do mês</p></div><p className="mt-5 text-2xl font-bold text-brand-300">{resumoSupervisor.admissoes} / {resumoSupervisor.desligamentos}</p><p className="mt-1 text-sm text-gray-400">admissões / desligamentos</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-amber-300"><Wallet size={16} /><p className="text-xs font-bold uppercase tracking-wide">Despesas no mês</p></div><p className="mt-5 text-2xl font-bold text-amber-300">{resumoSupervisor.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-1 text-sm text-gray-400">lançamentos não cancelados</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><div className="flex items-center gap-2 text-purple-300"><UsersRound size={16} /><p className="text-xs font-bold uppercase tracking-wide">Equipe ativa</p></div><p className="mt-5 text-3xl font-bold text-purple-300">{resumoSupervisor.colaboradores}</p><p className="mt-1 text-sm text-gray-400">idade média: {resumoSupervisor.idadeMedia ? `${resumoSupervisor.idadeMedia} anos` : '—'}</p></div></div><div className="mt-6 grid gap-5 2xl:grid-cols-3"><section className="rounded-2xl border border-surface-border bg-surface p-5 2xl:col-span-2"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Obras acompanhadas</h3><p className="mt-1 text-sm text-gray-400">Organizadas por estado, como no painel desktop.</p></div><span className="rounded-lg bg-surface-hover px-3 py-1.5 text-sm text-gray-300">{resumoSupervisor.obras.length} obra(s)</span></div><div className="mt-4 divide-y divide-surface-border">{resumoSupervisor.obras.length === 0 ? <p className="py-6 text-sm text-gray-400">Nenhuma obra vinculada a este supervisor.</p> : resumoSupervisor.obras.map(obra => <div key={obra.id} className="flex items-center justify-between gap-4 py-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300"><MapPin size={16} /></span><div className="min-w-0"><p className="truncate font-medium">{obra.titulo_obra || obra.nome}</p><p className="truncate text-xs text-gray-400">{obra.nome}{obra.estado ? ` · ${obra.estado}` : ''}</p></div></div><span className="shrink-0 rounded-full bg-surface-hover px-2.5 py-1 text-xs text-gray-300">{obra.estado || 'Sem estado'}</span></div>)}</div></section><section className="rounded-2xl border border-surface-border bg-surface p-5"><h3 className="font-semibold">Pendências para aprovação</h3><p className="mt-2 text-sm text-gray-400">Itens de lote aguardando decisão do supervisor.</p><p className="mt-7 text-5xl font-bold text-amber-300">{resumoSupervisor.pendencias}</p><p className="mt-2 text-sm text-gray-400">autorizações e notas fiscais</p></section></div></section>}
      {perfil.perfil === 'setor_pessoal' && pagina === 'pessoal' && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">DEPARTAMENTO PESSOAL</p><h2 className="mt-1 text-2xl font-bold">Solicitações das obras</h2><p className="mt-1 text-sm text-gray-400">Admissões, desligamentos e movimentações recebidas de todas as obras.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-300">Aguardando resposta</p><p className="mt-4 text-3xl font-bold text-amber-300">{solicitacoesPessoal.filter(item => item.status === 'pendente').length}</p></div><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-300">Respondidas</p><p className="mt-4 text-3xl font-bold text-brand-300">{solicitacoesPessoal.filter(item => item.status === 'respondido').length}</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Concluídas</p><p className="mt-4 text-3xl font-bold text-emerald-300">{solicitacoesPessoal.filter(item => item.status === 'concluido').length}</p></div><div className="rounded-2xl border border-purple-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-purple-300">Obras envolvidas</p><p className="mt-4 text-3xl font-bold text-purple-300">{new Set(solicitacoesPessoal.map(item => item.empresa_id)).size}</p></div></div><section className="mt-6 overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="flex flex-col gap-2 border-b border-surface-border p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Fila de trabalho</h3><p className="mt-1 text-sm text-gray-400">Solicitações recentes, com prioridade para as pendentes.</p></div><span className="text-sm text-gray-400">{solicitacoesPessoal.length} registro(s)</span></div><div className="divide-y divide-surface-border">{solicitacoesPessoal.length === 0 ? <p className="p-6 text-sm text-gray-400">Nenhuma solicitação recebida até o momento.</p> : solicitacoesPessoal.slice().sort((a, b) => (a.status === 'pendente' ? -1 : 1) - (b.status === 'pendente' ? -1 : 1) || b.solicitado_em.localeCompare(a.solicitado_em)).map(item => <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-medium">{item.colaborador_nome}</p><p className="mt-1 truncate text-sm text-gray-400">{tiposSolicitacao[item.tipo] ?? item.tipo} · {item.obra_nome} · enviado por {item.solicitado_por}</p></div><div className="flex shrink-0 items-center gap-3"><span className={item.status === 'pendente' ? 'rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300' : item.status === 'respondido' ? 'rounded-full bg-brand-500/15 px-3 py-1 text-xs font-medium text-brand-300' : 'rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300'}>{item.status === 'pendente' ? 'Pendente' : item.status === 'respondido' ? 'Respondido' : 'Concluído'}</span><span className="text-xs text-gray-500">{new Date(item.solicitado_em).toLocaleDateString('pt-BR')}</span></div></article>)}</div></section></section>}
      {perfil.perfil === 'central' && pagina === 'central' && <section className="mx-auto max-w-7xl py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ESCRITÓRIO CENTRAL</p><h2 className="mt-1 text-2xl font-bold">Supervisores e obras</h2><p className="mt-1 text-sm text-gray-400">Acompanhe a fila de aprovação por responsável, mantendo a hierarquia do painel desktop.</p></div><div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-brand-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-brand-300">Supervisores ativos</p><p className="mt-4 text-3xl font-bold text-brand-300">{resumoCentral.length}</p></div><div className="rounded-2xl border border-emerald-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Obras acompanhadas</p><p className="mt-4 text-3xl font-bold text-emerald-300">{resumoCentral.reduce((total, item) => total + item.obras.length, 0)}</p></div><div className="rounded-2xl border border-amber-500/35 bg-surface p-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-300">Pendências centrais</p><p className="mt-4 text-3xl font-bold text-amber-300">{resumoCentral.reduce((total, item) => total + item.pendencias, 0)}</p></div></div><section className="mt-6 overflow-hidden rounded-2xl border border-surface-border bg-surface"><div className="border-b border-surface-border p-5"><h3 className="font-semibold">Fluxo por supervisor</h3><p className="mt-1 text-sm text-gray-400">Seleção de obras e itens aguardando aprovação do Escritório.</p></div><div className="divide-y divide-surface-border">{resumoCentral.length === 0 ? <p className="p-6 text-sm text-gray-400">Nenhum supervisor ativo cadastrado.</p> : resumoCentral.map(supervisor => <article key={supervisor.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{supervisor.nome}</p><p className="mt-1 text-sm text-gray-400">{supervisor.email}</p></div><span className={supervisor.pendencias ? 'w-fit rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300' : 'w-fit rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300'}>{supervisor.pendencias ? `${supervisor.pendencias} pendência(s)` : 'Sem pendências'}</span></div><div className="mt-4 flex flex-wrap gap-2">{supervisor.obras.length === 0 ? <span className="text-sm text-gray-500">Nenhuma obra vinculada.</span> : supervisor.obras.map(obra => <span key={obra.id} className="rounded-lg bg-surface-hover px-3 py-1.5 text-sm text-gray-300">{obra.nome}</span>)}</div></article>)}</div></section></section>}
      {pagina === 'inicio' && <section className="mx-auto max-w-[1180px] pb-8 pt-1">{!resumo ? <div className="rounded-xl border border-surface-border bg-surface p-6 text-sm text-gray-300">Não foi possível carregar os indicadores da obra. Recarregue a página ou verifique as permissões deste usuário.</div> : <><div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><h2 className="text-xl font-bold text-white">Início</h2><span className="mt-1 inline-flex rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-300">{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span></div><div className="flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"><CalendarDays size={14} />{new Date().toLocaleDateString('pt-BR', { month: 'long' })}<ChevronDown size={14} /></button><button className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"><CalendarDays size={14} />{new Date().getFullYear()}<ChevronDown size={14} /></button><button className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium"><RefreshCw size={14} />Atualizar</button></div></div><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-200"><UsersRound size={15} className="text-brand-400" />Recursos Humanos</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><article className="min-h-[134px] rounded-xl border border-brand-500/40 bg-[#1f2d46] p-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white"><UsersRound size={16} /></span><p className="mt-4 text-sm font-semibold">Colaboradores ativos</p><p className="mt-1 text-2xl font-bold">{resumo.ativos}</p><p className="mt-1 text-xs text-gray-400">Nenhum afastamento</p></article><article className="min-h-[134px] rounded-xl border border-emerald-500/40 bg-[#193c34] p-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500 text-white"><Wallet size={16} /></span><p className="mt-4 text-sm font-semibold">Custo total da folha</p><p className="mt-1 text-2xl font-bold text-emerald-400">{resumo.custoFolha.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-1 text-xs text-gray-400">Folha mensal</p></article><article className="min-h-[134px] rounded-xl border border-amber-500/40 bg-[#3a2e17] p-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500 text-white"><UsersRound size={16} /></span><p className="mt-4 text-sm font-semibold">Média de idade</p><p className="mt-1 text-2xl font-bold text-amber-300">{resumo.mediaIdade ? `${resumo.mediaIdade} anos` : '—'}</p><p className="mt-1 text-xs text-gray-400">Colaboradores ativos</p></article><article className="min-h-[134px] rounded-xl border border-purple-500/40 bg-[#34283d] p-4"><span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500 text-white"><CalendarDays size={16} /></span><p className="mt-4 text-sm font-semibold">Aniversariantes do mês</p><p className="mt-1 text-2xl font-bold text-purple-300">{resumo.aniversariantes.length}</p><p className="mt-1 truncate text-xs text-gray-400">{resumo.aniversariantes[0]?.nome ?? 'Nenhum aniversariante'}</p></article></div><div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,2.1fr)_minmax(300px,1fr)]"><section className="overflow-hidden rounded-xl border border-surface-border bg-[#1f2d46]"><div className="flex items-center gap-2 border-b border-surface-border px-4 py-3 text-sm font-semibold"><UsersRound size={15} className="text-brand-400" />Colaboradores por função</div><div className="space-y-3 p-4">{resumo.porFuncao.length === 0 ? <p className="text-sm text-gray-400">Sem funções cadastradas.</p> : resumo.porFuncao.slice(0, 8).map(item => <div key={item.funcao}><div className="flex justify-between gap-3 text-xs"><strong className="truncate text-gray-100">{item.funcao}</strong><span className="shrink-0 text-brand-300">{item.quantidade} · {item.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#33425f]"><div className="h-full rounded-full bg-[#2f80ed]" style={{ width: `${Math.max(4, (item.quantidade / Math.max(resumo.ativos, 1)) * 100)}%` }} /></div></div>)}</div></section><section className="overflow-hidden rounded-xl border border-surface-border bg-[#1f2d46]"><div className="flex items-center gap-2 border-b border-surface-border px-4 py-3 text-sm font-semibold"><CalendarDays size={15} className="text-purple-300" />Aniversariantes do mês</div><div className="space-y-3 p-4">{resumo.aniversariantes.length === 0 ? <p className="text-sm text-gray-400">Nenhum aniversariante neste mês.</p> : resumo.aniversariantes.slice(0, 6).map(item => <div key={`${item.nome}-${item.nascimento}`} className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-500/20 text-xs text-purple-300">{item.nascimento.slice(8, 10)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.nome}</p><p className="truncate text-xs text-gray-400">{item.funcao ?? '—'}</p></div></div>)}</div></section></div></>}</section>}
      {pagina === 'financeiro' && <section className="mt-7">
        <div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Lançamentos</h2><p className="mt-1 text-sm text-gray-400">Controle de receitas, despesas e compromissos da obra.</p></div>{perfil.perfil === 'admin' && <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoLancamento(aberto => !aberto)}>{novoLancamento ? 'Cancelar' : '+ Novo lançamento'}</button>}</div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Receitas</p><p className="mt-2 text-xl font-bold text-emerald-300">{resumoFinanceiro.receitas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><div className="rounded-xl border border-red-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-red-300">Despesas</p><p className="mt-2 text-xl font-bold text-red-300">{resumoFinanceiro.despesas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Pendentes</p><p className="mt-2 text-2xl font-bold text-amber-300">{resumoFinanceiro.pendentes}</p></div></div>
        {novoLancamento && <form onSubmit={salvarLancamento} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Descrição<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.descricao} onChange={e => setFormLancamento({ ...formLancamento, descricao: e.target.value })} required /></label><label className="text-sm text-gray-300">Tipo<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.tipo} onChange={e => setFormLancamento({ ...formLancamento, tipo: e.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></label><label className="text-sm text-gray-300">Valor<input min="0.01" step="0.01" className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="number" value={formLancamento.valor} onChange={e => setFormLancamento({ ...formLancamento, valor: e.target.value })} required /></label><label className="text-sm text-gray-300">Data<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data} onChange={e => setFormLancamento({ ...formLancamento, data: e.target.value })} required /></label><label className="text-sm text-gray-300">Vencimento<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formLancamento.data_venc} onChange={e => setFormLancamento({ ...formLancamento, data_venc: e.target.value })} /></label><label className="text-sm text-gray-300">Categoria<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.categoria_id} onChange={e => setFormLancamento({ ...formLancamento, categoria_id: e.target.value })} required><option value="">Selecione</option>{categoriasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Conta<select className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formLancamento.conta_id} onChange={e => setFormLancamento({ ...formLancamento, conta_id: e.target.value })} required><option value="">Selecione</option>{contasWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoLancamento}>{salvandoLancamento ? 'Salvando…' : 'Salvar lançamento'}</button></div></form>}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row"><input className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar lançamento…" value={buscaLancamento} onChange={e => setBuscaLancamento(e.target.value)} /><select aria-label="Filtrar tipo de lançamento" className="rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-gray-200" value={filtroTipoFinanceiro} onChange={e => setFiltroTipoFinanceiro(e.target.value)}><option value="todos">Receitas e despesas</option><option value="receita">Receitas</option><option value="despesa">Despesas</option></select></div><div className="space-y-3 md:hidden">{lancamentosFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum lançamento encontrado.</p> : lancamentosFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.descricao}</p><p className="mt-1 text-sm text-gray-400">{item.data} · {item.status}</p></div><strong className={item.tipo === 'receita' ? 'shrink-0 text-emerald-400' : 'shrink-0 text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Data</th><th className="p-3">Descrição</th><th className="p-3">Situação</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{lancamentosFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={4}>Nenhum lançamento encontrado.</td></tr> : lancamentosFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-400">{item.data}</td><td className="p-3">{item.descricao}</td><td className="p-3"><span className="rounded bg-surface px-2 py-1 text-xs">{item.status}</span></td><td className={item.tipo === 'receita' ? 'p-3 text-right font-medium text-emerald-400' : 'p-3 text-right font-medium text-red-300'}>{item.tipo === 'receita' ? '+' : '-'} {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></div>
      </section>}
      {pagina === 'rh' && <section className="mt-7">
        <div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-400">RECURSOS HUMANOS</p><h2 className="mt-1 text-2xl font-bold">Colaboradores</h2><p className="mt-1 text-sm text-gray-400">Cadastro, situação e custo da equipe da obra.</p></div><div className="flex items-center gap-3"><span className="rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-300">{colaboradoresWeb.length} cadastrados</span>{perfil.perfil === 'admin' && <button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium hover:bg-brand-500" onClick={() => setNovoColaborador(aberto => !aberto)}>{novoColaborador ? 'Cancelar' : '+ Novo colaborador'}</button>}</div></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Ativos</p><p className="mt-2 text-2xl font-bold text-emerald-300">{resumoStatusRh.ativos}</p></div><div className="rounded-xl border border-brand-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Em férias</p><p className="mt-2 text-2xl font-bold text-brand-300">{resumoStatusRh.ferias}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Afastados</p><p className="mt-2 text-2xl font-bold text-amber-300">{resumoStatusRh.afastados}</p></div></div><div className="mb-4 flex flex-col gap-3 sm:flex-row"><input className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar por nome, função ou setor…" value={buscaColaborador} onChange={e => setBuscaColaborador(e.target.value)} /><select aria-label="Filtrar situação" className="rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-gray-200" value={filtroStatusRh} onChange={e => setFiltroStatusRh(e.target.value)}><option value="todos">Todas as situações</option><option value="ativo">Ativos</option><option value="ferias">Férias</option><option value="afastado">Afastados</option><option value="desligado">Desligados</option></select></div>
        {novoColaborador && <form onSubmit={salvarColaborador} className="mb-5 grid gap-3 rounded-lg border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Nome completo<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.nome} onChange={e => setFormColaborador({ ...formColaborador, nome: e.target.value })} required /></label><label className="text-sm text-gray-300">Função<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.funcao} onChange={e => setFormColaborador({ ...formColaborador, funcao: e.target.value })} /></label><label className="text-sm text-gray-300">Setor<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" value={formColaborador.setor} onChange={e => setFormColaborador({ ...formColaborador, setor: e.target.value })} /></label><label className="text-sm text-gray-300">Data de admissão<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" type="date" value={formColaborador.data_admissao} onChange={e => setFormColaborador({ ...formColaborador, data_admissao: e.target.value })} /></label><label className="text-sm text-gray-300">Salário base<input className="mt-1 w-full rounded-md border border-surface-border bg-surface-card px-3 py-2 text-white" min="0" step="0.01" type="number" value={formColaborador.salario_base} onChange={e => setFormColaborador({ ...formColaborador, salario_base: e.target.value })} /></label><div className="md:col-span-2"><button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium disabled:opacity-60" disabled={salvandoColaborador}>{salvandoColaborador ? 'Salvando…' : 'Cadastrar colaborador'}</button></div></form>}
        <div className="space-y-3 md:hidden">{colaboradoresFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum colaborador encontrado.</p> : colaboradoresFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.nome}</p><p className="mt-1 text-sm text-gray-400">{item.funcao ?? 'Função não informada'}</p></div><span className={item.status === 'ativo' ? 'rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300' : 'rounded-full bg-gray-500/10 px-2.5 py-1 text-xs text-gray-300'}>{item.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-3 text-sm"><div><p className="text-xs text-gray-500">Setor</p><p className="mt-1 text-gray-200">{item.setor ?? '—'}</p></div><div><p className="text-xs text-gray-500">Salário base</p><p className="mt-1 font-medium text-gray-200">{Number(item.salario_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Nome</th><th className="p-3">Função</th><th className="p-3">Setor</th><th className="p-3">Status</th><th className="p-3 text-right">Salário base</th></tr></thead><tbody>{colaboradoresFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={5}>Nenhum colaborador encontrado.</td></tr> : colaboradoresFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.nome}</td><td className="p-3 text-gray-300">{item.funcao ?? '—'}</td><td className="p-3 text-gray-300">{item.setor ?? '—'}</td><td className="p-3"><span className={item.status === 'ativo' ? 'rounded bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300' : 'rounded bg-gray-500/10 px-2 py-1 text-xs text-gray-400'}>{item.status}</span></td><td className="p-3 text-right">{Number(item.salario_base).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></div>
      </section>}
      {pagina === 'estoque' && <section className="mx-auto mt-7 max-w-7xl"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">ALMOXARIFADO</p><h2 className="mt-1 text-2xl font-bold">Estoque</h2><p className="mt-1 text-sm text-gray-400">Consulta rápida de produtos e alertas de reposição.</p></div><div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-brand-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-300">Itens cadastrados</p><p className="mt-2 text-2xl font-bold text-brand-300">{produtosWeb.length}</p></div><div className="rounded-xl border border-amber-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Abaixo do mínimo</p><p className="mt-2 text-2xl font-bold text-amber-300">{produtosAbaixoMinimo}</p></div><div className="rounded-xl border border-emerald-500/30 bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Em nível regular</p><p className="mt-2 text-2xl font-bold text-emerald-300">{produtosWeb.length - produtosAbaixoMinimo}</p></div></div><input className="mb-4 w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-sm text-white sm:max-w-md" placeholder="Buscar código ou produto…" value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)} /><div className="space-y-3 md:hidden">{produtosFiltrados.length === 0 ? <p className="rounded-xl border border-surface-border bg-surface p-5 text-sm text-gray-400">Nenhum produto encontrado.</p> : produtosFiltrados.map(item => <article key={item.id} className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{item.nome}</p><p className="mt-1 text-xs text-gray-500">Código: {item.codigo}</p></div><span className={Number(item.estoque_atual) <= Number(item.estoque_minimo) ? 'rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-300' : 'rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300'}>{item.estoque_atual} {item.unidade ?? ''}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-3 text-sm"><div><p className="text-xs text-gray-500">Estoque mínimo</p><p className="mt-1 text-gray-200">{item.estoque_minimo} {item.unidade ?? ''}</p></div><div><p className="text-xs text-gray-500">Valor unitário</p><p className="mt-1 font-medium text-gray-200">{Number(item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div></div></article>)}</div><div className="hidden overflow-x-auto rounded-xl border border-surface-border md:block"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface text-gray-400"><tr><th className="p-3">Código</th><th className="p-3">Produto</th><th className="p-3">Estoque</th><th className="p-3 text-right">Valor unitário</th></tr></thead><tbody>{produtosFiltrados.length === 0 ? <tr><td className="p-5 text-gray-400" colSpan={4}>Nenhum produto encontrado.</td></tr> : produtosFiltrados.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-400">{item.codigo}</td><td className="p-3 font-medium">{item.nome}</td><td className={Number(item.estoque_atual) <= Number(item.estoque_minimo) ? 'p-3 text-amber-300' : 'p-3'}>{item.estoque_atual} {item.unidade ?? ''}</td><td className="p-3 text-right">{Number(item.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></section>}
      {pagina === 'almox' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-400">ALMOXARIFADO</p><h2 className="mt-1 text-2xl font-bold">Painel inicial</h2><p className="mt-1 text-sm text-gray-400">Resumo de materiais e movimentações recentes da obra.</p></div>{perfil.perfil !== 'gestor' && <div className="flex gap-2"><button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500" onClick={() => navegar('entradas')}><span className="inline-flex items-center gap-1.5"><PackagePlus size={15} />Nova entrada</span></button><button className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium hover:bg-amber-500" onClick={() => navegar('saidas')}><span className="inline-flex items-center gap-1.5"><PackageMinus size={15} />Nova saída</span></button></div>}</div><div className="grid gap-4 md:grid-cols-3"><article className="rounded-xl border border-red-500/35 bg-[#342326] p-4"><p className="text-sm font-semibold text-red-300">Estoque zerado</p><p className="mt-4 text-3xl font-bold">{produtosWeb.filter(item => Number(item.estoque_atual) <= 0).length}</p><p className="mt-1 text-xs text-gray-400">materiais que precisam de reposição</p></article><article className="rounded-xl border border-amber-500/35 bg-[#352c1f] p-4"><p className="text-sm font-semibold text-amber-300">Estoque acabando</p><p className="mt-4 text-3xl font-bold">{produtosWeb.filter(item => Number(item.estoque_atual) > 0 && Number(item.estoque_atual) <= Number(item.estoque_minimo)).length}</p><p className="mt-1 text-xs text-gray-400">itens abaixo do mínimo definido</p></article><article className="rounded-xl border border-emerald-500/35 bg-[#1d352b] p-4"><p className="text-sm font-semibold text-emerald-300">Valor total do estoque</p><p className="mt-4 text-2xl font-bold text-emerald-300">{produtosWeb.reduce((total, item) => total + Number(item.estoque_atual) * Number(item.valor_unitario), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-1 text-xs text-gray-400">posição atual dos materiais</p></article></div><div className="mt-5 grid gap-4 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border border-surface-border bg-[#1f2d46]"><h3 className="border-b border-surface-border px-4 py-3 text-sm font-semibold text-emerald-300">Últimas entradas</h3><div className="divide-y divide-surface-border">{entradasWeb.slice(0, 6).map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.fornecedor_nome}</p><p className="text-xs text-gray-400">{item.data}{item.numero_nota ? ` · NF ${item.numero_nota}` : ''}</p></div><span className="shrink-0 text-sm text-emerald-300">{Number(item.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>)}{entradasWeb.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhuma entrada registrada.</p>}</div></section><section className="overflow-hidden rounded-xl border border-surface-border bg-[#1f2d46]"><h3 className="border-b border-surface-border px-4 py-3 text-sm font-semibold text-amber-300">Últimas saídas</h3><div className="divide-y divide-surface-border">{saidasWeb.slice(0, 6).map(item => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.produto_nome}</p><p className="text-xs text-gray-400">{item.retirado_por_nome}{item.setor ? ` · ${item.setor}` : ''}</p></div><span className="shrink-0 text-sm text-amber-300">{item.quantidade}</span></div>)}{saidasWeb.length === 0 && <p className="p-5 text-sm text-gray-400">Nenhuma saída registrada.</p>}</div></section></div></section>}
      {pagina === 'entradas' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-brand-400">ALMOXARIFADO</p><h2 className="mt-1 text-2xl font-bold">Entradas</h2><p className="mt-1 text-sm text-gray-400">Recebimentos de materiais e ferramentas.</p></div><button className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium hover:bg-emerald-500" onClick={() => setNovaEntrada(aberto => !aberto)}>{novaEntrada ? 'Cancelar' : '+ Nova entrada'}</button></div>{novaEntrada && <form onSubmit={salvarEntrada} className="mb-5 grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300">Material<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.produto_id} onChange={e => setFormEntrada({ ...formEntrada, produto_id: e.target.value })} required><option value="">Selecione</option>{produtosWeb.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Fornecedor<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.fornecedor_nome} onChange={e => setFormEntrada({ ...formEntrada, fornecedor_nome: e.target.value })} /></label><label className="text-sm text-gray-300">Quantidade<input min="0.01" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.quantidade} onChange={e => setFormEntrada({ ...formEntrada, quantidade: e.target.value })} required /></label><label className="text-sm text-gray-300">Valor unitário<input min="0" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.valor_unitario} onChange={e => setFormEntrada({ ...formEntrada, valor_unitario: e.target.value })} required /></label><label className="text-sm text-gray-300">Número da nota<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.numero_nota} onChange={e => setFormEntrada({ ...formEntrada, numero_nota: e.target.value })} /></label><label className="text-sm text-gray-300">Data<input type="date" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formEntrada.data} onChange={e => setFormEntrada({ ...formEntrada, data: e.target.value })} required /></label><div className="md:col-span-2"><button className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoEntrada}>{salvandoEntrada ? 'Salvando…' : 'Registrar entrada'}</button></div></form>}<div className="overflow-x-auto rounded-xl border border-surface-border bg-surface"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-surface-card text-gray-400"><tr><th className="p-3">Data</th><th className="p-3">Fornecedor</th><th className="p-3">Nota</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{entradasWeb.length === 0 ? <tr><td colSpan={4} className="p-6 text-gray-400">Nenhuma entrada registrada.</td></tr> : entradasWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-300">{item.data}</td><td className="p-3 font-medium">{item.fornecedor_nome}</td><td className="p-3 text-gray-400">{item.numero_nota ?? '—'}</td><td className="p-3 text-right text-emerald-300">{Number(item.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td></tr>)}</tbody></table></div></section>}
      {pagina === 'saidas' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-brand-400">ALMOXARIFADO</p><h2 className="mt-1 text-2xl font-bold">Saídas</h2><p className="mt-1 text-sm text-gray-400">Baixas de materiais retirados da obra.</p></div><button className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium hover:bg-amber-500" onClick={() => setNovaSaida(aberto => !aberto)}>{novaSaida ? 'Cancelar' : '+ Nova saída'}</button></div>{novaSaida && <form onSubmit={salvarSaida} className="mb-5 grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300">Material<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formSaida.produto_id} onChange={e => setFormSaida({ ...formSaida, produto_id: e.target.value })} required><option value="">Selecione</option>{produtosWeb.map(item => <option key={item.id} value={item.id}>{item.codigo} — {item.nome} ({item.estoque_atual} {item.unidade ?? ''})</option>)}</select></label><label className="text-sm text-gray-300">Retirado por<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formSaida.retirado_por_nome} onChange={e => setFormSaida({ ...formSaida, retirado_por_nome: e.target.value })} required /></label><label className="text-sm text-gray-300">Quantidade<input min="0.01" step="0.01" type="number" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formSaida.quantidade} onChange={e => setFormSaida({ ...formSaida, quantidade: e.target.value })} required /></label><label className="text-sm text-gray-300">Setor<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formSaida.setor} onChange={e => setFormSaida({ ...formSaida, setor: e.target.value })} /></label><label className="text-sm text-gray-300">Data<input type="date" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formSaida.data} onChange={e => setFormSaida({ ...formSaida, data: e.target.value })} required /></label><div className="md:col-span-2"><button className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoSaida}>{salvandoSaida ? 'Salvando…' : 'Registrar saída'}</button></div></form>}<div className="overflow-x-auto rounded-xl border border-surface-border bg-surface"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-surface-card text-gray-400"><tr><th className="p-3">Data</th><th className="p-3">Material</th><th className="p-3">Retirado por</th><th className="p-3 text-right">Quantidade</th></tr></thead><tbody>{saidasWeb.length === 0 ? <tr><td colSpan={4} className="p-6 text-gray-400">Nenhuma saída registrada.</td></tr> : saidasWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 text-gray-300">{item.data}</td><td className="p-3 font-medium">{item.produto_nome}<span className="ml-2 text-xs text-gray-500">{item.produto_codigo}</span></td><td className="p-3 text-gray-300">{item.retirado_por_nome}{item.setor ? ` · ${item.setor}` : ''}</td><td className="p-3 text-right text-amber-300">{item.quantidade}</td></tr>)}</tbody></table></div></section>}
      {pagina === 'ap' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Autorizações de pagamento</h2><p className="mt-1 text-sm text-gray-400">Revise e autorize os pagamentos da obra.</p></div><div className="overflow-x-auto rounded-xl border border-surface-border bg-surface"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface-card text-gray-400"><tr><th className="p-3">Beneficiário</th><th className="p-3">Descrição</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Valor</th><th className="p-3"></th></tr></thead><tbody>{autorizacoesWeb.length === 0 ? <tr><td colSpan={5} className="p-6 text-gray-400">Nenhuma autorização encontrada.</td></tr> : autorizacoesWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.beneficiario_nome}</td><td className="p-3 text-gray-300">{item.descricao ?? '—'}</td><td className="p-3 text-gray-400">{item.vencimento ?? '—'}</td><td className="p-3 text-right text-amber-300">{Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="p-3 text-right">{item.aprovado_por ? <span className="text-xs text-emerald-300">Autorizada</span> : <button className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium disabled:opacity-60" disabled={itemFinanceiroProcessando === `ap-${item.id}`} onClick={() => void aprovarItemFinanceiro('ap', item.id)}>{itemFinanceiroProcessando === `ap-${item.id}` ? 'Autorizando…' : 'Autorizar'}</button>}</td></tr>)}</tbody></table></div></section>}
      {pagina === 'notas' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Notas fiscais</h2><p className="mt-1 text-sm text-gray-400">Revise e autorize as notas fiscais da obra.</p></div><div className="overflow-x-auto rounded-xl border border-surface-border bg-surface"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface-card text-gray-400"><tr><th className="p-3">Fornecedor</th><th className="p-3">NF</th><th className="p-3">Data</th><th className="p-3 text-right">Valor</th><th className="p-3"></th></tr></thead><tbody>{notasFiscaisWeb.length === 0 ? <tr><td colSpan={5} className="p-6 text-gray-400">Nenhuma nota fiscal encontrada.</td></tr> : notasFiscaisWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.fornecedor_nome}</td><td className="p-3 text-gray-300">{item.numero_nf ?? '—'}</td><td className="p-3 text-gray-400">{item.data}</td><td className="p-3 text-right text-amber-300">{Number(item.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td className="p-3 text-right">{item.aprovado_por ? <span className="text-xs text-emerald-300">Autorizada</span> : <button className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium disabled:opacity-60" disabled={itemFinanceiroProcessando === `nf-${item.id}`} onClick={() => void aprovarItemFinanceiro('nf', item.id)}>{itemFinanceiroProcessando === `nf-${item.id}` ? 'Autorizando…' : 'Autorizar'}</button>}</td></tr>)}</tbody></table></div></section>}
      {['ap', 'notas'].includes(pagina) && <section className="mx-auto max-w-[1180px] pb-7"><div className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">Documentos anexados</h3><p className="mt-1 text-sm text-gray-400">Visualize, baixe ou imprima os arquivos armazenados com segurança no Supabase.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Tipo de documento" className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" value={documentoFinanceiroTipo} onChange={e => { const tipo = e.target.value as 'ap' | 'nf'; setDocumentoFinanceiroTipo(tipo); setDocumentoFinanceiroId(''); setAnexosFinanceiros([]) }}><option value="ap">Autorização de pagamento</option><option value="nf">Nota fiscal</option></select><select aria-label="Documento financeiro" className="max-w-72 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" value={documentoFinanceiroId} onChange={e => { setDocumentoFinanceiroId(e.target.value); void carregarAnexosFinanceiros(documentoFinanceiroTipo, e.target.value) }}><option value="">Selecione o documento</option>{(documentoFinanceiroTipo === 'ap' ? autorizacoesWeb : notasFiscaisWeb).map(item => <option key={item.id} value={item.id}>{documentoFinanceiroTipo === 'ap' ? `${(item as AutorizacaoWeb).beneficiario_nome} — ${(item as AutorizacaoWeb).valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : `${(item as NotaFiscalWeb).fornecedor_nome} — NF ${(item as NotaFiscalWeb).numero_nf ?? '—'}`}</option>)}</select></div></div>{documentoFinanceiroId && <><div className="mt-4 divide-y divide-surface-border rounded-lg border border-surface-border">{carregandoAnexosFinanceiros ? <p className="p-4 text-sm text-gray-400">Carregando anexos…</p> : anexosFinanceiros.length === 0 ? <p className="p-4 text-sm text-gray-400">Nenhum arquivo anexado a este documento.</p> : anexosFinanceiros.map((anexo, indice) => <div key={anexo.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="min-w-0 truncate text-sm">{caminhoStorage(anexo.caminho).split('/').at(-1) ?? `Documento ${indice + 1}`}</p><div className="flex shrink-0 gap-2"><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void visualizarArquivo(anexo.caminho)}>Abrir</button><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void baixarArquivo(anexo.caminho)}>Baixar</button><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void imprimirArquivo(anexo.caminho)}>Imprimir</button></div></div>)}</div>{['admin', 'master'].includes(perfil.perfil) && <form onSubmit={enviarAnexosFinanceiros} className="mt-4 border-t border-surface-border pt-4"><label className="block text-sm text-gray-300">Anexar documentos<input className="mt-2 block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" type="file" multiple onChange={e => setNovosAnexosFinanceiros(Array.from(e.target.files ?? []))} required /></label>{novosAnexosFinanceiros.length > 0 && <p className="mt-2 text-xs text-gray-400">{novosAnexosFinanceiros.map(arquivo => arquivo.name).join(', ')}</p>}<button className="mt-3 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={enviandoAnexosFinanceiros}>{enviandoAnexosFinanceiros ? 'Enviando…' : 'Enviar anexos'}</button></form>}</>}</div></section>}
      {(pagina === 'supervisor' || pagina === 'central') && <section className="mx-auto max-w-7xl pb-7"><div className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">Documentos dos itens em análise</h3><p className="mt-1 text-sm text-gray-400">Abra, baixe ou imprima os anexos antes de registrar sua aprovação.</p></div><div className="flex flex-wrap gap-2"><select aria-label="Tipo de documento" className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" value={documentoFinanceiroTipo} onChange={e => { const tipo = e.target.value as 'ap' | 'nf'; setDocumentoFinanceiroTipo(tipo); setDocumentoFinanceiroId(''); setAnexosFinanceiros([]) }}><option value="ap">Autorização de pagamento</option><option value="nf">Nota fiscal</option></select><select aria-label="Documento financeiro" className="max-w-72 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" value={documentoFinanceiroId} onChange={e => { setDocumentoFinanceiroId(e.target.value); void carregarAnexosFinanceiros(documentoFinanceiroTipo, e.target.value) }}><option value="">Selecione o documento</option>{(documentoFinanceiroTipo === 'ap' ? autorizacoesWeb : notasFiscaisWeb).map(item => <option key={item.id} value={item.id}>{documentoFinanceiroTipo === 'ap' ? (item as AutorizacaoWeb).beneficiario_nome : `${(item as NotaFiscalWeb).fornecedor_nome} — NF ${(item as NotaFiscalWeb).numero_nf ?? '—'}`}</option>)}</select></div></div>{documentoFinanceiroId && <div className="mt-4 divide-y divide-surface-border rounded-lg border border-surface-border">{carregandoAnexosFinanceiros ? <p className="p-4 text-sm text-gray-400">Carregando anexos…</p> : anexosFinanceiros.length === 0 ? <p className="p-4 text-sm text-gray-400">Nenhum arquivo anexado a este documento.</p> : anexosFinanceiros.map((anexo, indice) => <div key={anexo.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="min-w-0 truncate text-sm">{caminhoStorage(anexo.caminho).split('/').at(-1) ?? `Documento ${indice + 1}`}</p><div className="flex shrink-0 gap-2"><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void visualizarArquivo(anexo.caminho)}>Abrir</button><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void baixarArquivo(anexo.caminho)}>Baixar</button><button className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-gray-200 hover:bg-surface-hover" onClick={() => void imprimirArquivo(anexo.caminho)}>Imprimir</button></div></div>)}</div>}</div></section>}
      {pagina === 'ap' && perfil.perfil === 'admin' && <section className="mx-auto max-w-[1180px] pb-7"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface p-4"><div><p className="font-semibold">Nova autorização de pagamento</p><p className="mt-1 text-sm text-gray-400">O lançamento financeiro é criado junto com a autorização.</p></div><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium" onClick={() => setNovaAp(aberto => !aberto)}>{novaAp ? 'Cancelar' : '+ Nova AP'}</button></div>{novaAp && <form onSubmit={salvarAp} className="mt-4 grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300">Fornecedor<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formAp.fornecedor_id} onChange={e => setFormAp({ ...formAp, fornecedor_id: e.target.value })} required><option value="">Selecione</option>{fornecedoresWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Vencimento<input type="date" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formAp.vencimento} onChange={e => setFormAp({ ...formAp, vencimento: e.target.value })} required /></label><label className="text-sm text-gray-300 md:col-span-2">Descrição<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formAp.descricao} onChange={e => setFormAp({ ...formAp, descricao: e.target.value })} required /></label><label className="text-sm text-gray-300">Valor<input type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formAp.valor} onChange={e => setFormAp({ ...formAp, valor: e.target.value })} required /></label><label className="text-sm text-gray-300">Observações<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formAp.observacoes} onChange={e => setFormAp({ ...formAp, observacoes: e.target.value })} /></label><div className="md:col-span-2"><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoAp}>{salvandoAp ? 'Criando…' : 'Criar autorização'}</button></div></form>}</section>}
      {pagina === 'notas' && perfil.perfil === 'admin' && <section className="mx-auto max-w-[1180px] pb-7"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface p-4"><div><p className="font-semibold">Nova nota fiscal</p><p className="mt-1 text-sm text-gray-400">O boleto e o lançamento financeiro são criados juntos.</p></div><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium" onClick={() => setNovaNf(aberto => !aberto)}>{novaNf ? 'Cancelar' : '+ Nova nota'}</button></div>{novaNf && <form onSubmit={salvarNf} className="mt-4 grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300">Fornecedor<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.fornecedor_id} onChange={e => setFormNf({ ...formNf, fornecedor_id: e.target.value })} required><option value="">Selecione</option>{fornecedoresWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label className="text-sm text-gray-300">Número NF<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.numero_nf} onChange={e => setFormNf({ ...formNf, numero_nf: e.target.value })} /></label><label className="text-sm text-gray-300">Número do pedido<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.numero_pedido} onChange={e => setFormNf({ ...formNf, numero_pedido: e.target.value })} /></label><label className="text-sm text-gray-300">Data de emissão<input type="date" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.data} onChange={e => setFormNf({ ...formNf, data: e.target.value })} required /></label><label className="text-sm text-gray-300">Valor<input type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.valor} onChange={e => setFormNf({ ...formNf, valor: e.target.value })} required /></label><label className="text-sm text-gray-300">Vencimento<input type="date" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formNf.vencimento} onChange={e => setFormNf({ ...formNf, vencimento: e.target.value })} required /></label><div className="md:col-span-2"><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoNf}>{salvandoNf ? 'Criando…' : 'Criar nota fiscal'}</button></div></form>}</section>}
      {pagina === 'fornecedores' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Fornecedores</h2><p className="mt-1 text-sm text-gray-400">Cadastros usados nas autorizações, notas fiscais e entradas.</p></div><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium" onClick={() => setNovoFornecedor(aberto => !aberto)}>{novoFornecedor ? 'Cancelar' : '+ Novo fornecedor'}</button></div>{novoFornecedor && <form onSubmit={salvarFornecedor} className="mb-5 grid gap-3 rounded-xl border border-surface-border bg-surface p-4 md:grid-cols-2"><label className="text-sm text-gray-300 md:col-span-2">Nome/Razão social<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.nome} onChange={e => setFormFornecedor({ ...formFornecedor, nome: e.target.value })} required /></label><label className="text-sm text-gray-300">Tipo<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.tipo_pessoa} onChange={e => setFormFornecedor({ ...formFornecedor, tipo_pessoa: e.target.value })}><option value="pj">Pessoa jurídica</option><option value="pf">Pessoa física</option></select></label><label className="text-sm text-gray-300">{formFornecedor.tipo_pessoa === 'pj' ? 'CNPJ' : 'CPF'}<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.tipo_pessoa === 'pj' ? formFornecedor.cnpj : formFornecedor.cpf} onChange={e => setFormFornecedor(formFornecedor.tipo_pessoa === 'pj' ? { ...formFornecedor, cnpj: e.target.value } : { ...formFornecedor, cpf: e.target.value })} /></label><label className="text-sm text-gray-300">E-mail<input type="email" className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.email} onChange={e => setFormFornecedor({ ...formFornecedor, email: e.target.value })} /></label><label className="text-sm text-gray-300">Telefone<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.telefone} onChange={e => setFormFornecedor({ ...formFornecedor, telefone: e.target.value })} /></label><label className="text-sm text-gray-300">Categoria<input className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.categoria} onChange={e => setFormFornecedor({ ...formFornecedor, categoria: e.target.value })} /></label><label className="text-sm text-gray-300">Forma de pagamento<select className="mt-1 w-full rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-white" value={formFornecedor.forma_pagamento} onChange={e => setFormFornecedor({ ...formFornecedor, forma_pagamento: e.target.value })}><option value="boleto">Boleto</option><option value="conta">Conta / PIX</option></select></label><div className="md:col-span-2"><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoFornecedor}>{salvandoFornecedor ? 'Salvando…' : 'Cadastrar fornecedor'}</button></div></form>}<div className="overflow-x-auto rounded-xl border border-surface-border bg-surface"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-surface-card text-gray-400"><tr><th className="p-3">Nome</th><th className="p-3">Documento</th><th className="p-3">Contato</th><th className="p-3">Categoria</th></tr></thead><tbody>{fornecedoresWeb.length === 0 ? <tr><td colSpan={4} className="p-6 text-gray-400">Nenhum fornecedor cadastrado.</td></tr> : fornecedoresWeb.map(item => <tr key={item.id} className="border-t border-surface-border"><td className="p-3 font-medium">{item.nome}</td><td className="p-3 text-gray-300">{item.cnpj ?? item.cpf ?? '—'}</td><td className="p-3 text-gray-300">{item.email ?? item.telefone ?? '—'}</td><td className="p-3 text-gray-400">{item.categoria ?? '—'}</td></tr>)}</tbody></table></div></section>}
      {pagina === 'lotes' && <section className="mx-auto max-w-[1180px] py-2 md:py-4"><div className="mb-6"><p className="text-sm font-semibold text-brand-400">FINANCEIRO</p><h2 className="mt-1 text-2xl font-bold">Lotes financeiros</h2><p className="mt-1 text-sm text-gray-400">Agrupe itens autorizados e envie-os para a aprovação do Supervisor.</p></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]"><section className="rounded-xl border border-surface-border bg-surface p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Itens disponíveis</h3><p className="mt-1 text-sm text-gray-400">Apenas APs e NFs autorizadas que ainda não estão em lote.</p></div><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={processandoLote || itensLoteSelecionados.size === 0} onClick={() => void criarLoteFinanceiro()}>{processandoLote ? 'Criando…' : `Criar lote (${itensLoteSelecionados.size})`}</button></div><div className="mt-4 divide-y divide-surface-border rounded-lg border border-surface-border">{[...autorizacoesWeb.filter(item => !!item.aprovado_por && item.lote_id === null).map(item => ({ chave: `ap-${item.id}`, tipo: 'AP', nome: item.beneficiario_nome, detalhe: item.descricao ?? 'Autorização de pagamento', valor: item.valor })), ...notasFiscaisWeb.filter(item => !!item.aprovado_por && item.lote_id === null).map(item => ({ chave: `nf-${item.id}`, tipo: 'NF', nome: item.fornecedor_nome, detalhe: `NF ${item.numero_nf ?? '—'}`, valor: item.valor_total }))].map(item => <label key={item.chave} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-surface-hover"><input type="checkbox" className="h-4 w-4 accent-blue-600" checked={itensLoteSelecionados.has(item.chave)} onChange={() => alternarItemLote(item.chave)} /><span className="min-w-0 flex-1"><span className="mr-2 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">{item.tipo}</span><strong className="text-sm">{item.nome}</strong><span className="block truncate text-xs text-gray-400">{item.detalhe}</span></span><span className="shrink-0 text-sm text-amber-300">{Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></label>)}{autorizacoesWeb.filter(item => !!item.aprovado_por && item.lote_id === null).length + notasFiscaisWeb.filter(item => !!item.aprovado_por && item.lote_id === null).length === 0 && <p className="p-5 text-sm text-gray-400">Não há itens autorizados disponíveis para lote.</p>}</div></section><section className="rounded-xl border border-surface-border bg-surface p-4"><h3 className="font-semibold">Lotes criados</h3><p className="mt-1 text-sm text-gray-400">Envie os lotes abertos ao Supervisor.</p><div className="mt-4 divide-y divide-surface-border">{lotesWeb.length === 0 ? <p className="py-5 text-sm text-gray-400">Nenhum lote criado.</p> : lotesWeb.map(lote => <article key={lote.id} className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{lote.titulo}</p><p className="mt-1 text-xs text-gray-400">{lote.enviado_em ? `Enviado em ${lote.enviado_em.slice(0, 10)}` : 'Aguardando envio'} </p></div>{lote.enviado_em ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-300">Enviado</span> : <button className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium disabled:opacity-60" disabled={processandoLote} onClick={() => void enviarLoteFinanceiro(lote.id)}>{processandoLote ? 'Enviando…' : 'Enviar ao Supervisor'}</button>}</div></article>)}</div></section></div></section>}
      {perfil.perfil === 'supervisor' && pagina === 'supervisor' && <section className="mx-auto max-w-7xl pb-7"><div className="rounded-xl border border-surface-border bg-surface p-4"><div><h3 className="font-semibold">Assinatura do Supervisor</h3><p className="mt-1 text-sm text-gray-400">Esta assinatura identifica suas aprovações; a data, hora e usuário ficam registrados no Supabase.</p></div><div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center"><div className="grid h-24 w-48 place-items-center rounded-lg border border-dashed border-surface-border bg-surface-card">{carimboUrl ? <img src={carimboUrl} alt="Assinatura cadastrada" className="h-full w-full object-contain p-2" /> : <span className="text-xs text-gray-500">Nenhuma assinatura cadastrada</span>}</div><div><input className="block w-full text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white" type="file" accept="image/*" onChange={e => selecionarCarimbo(e.target.files?.[0])} /><div className="mt-3 flex gap-2"><button className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium disabled:opacity-60" disabled={salvandoCarimbo} onClick={() => void salvarCarimbo()}>{salvandoCarimbo ? 'Salvando…' : 'Salvar assinatura'}</button>{carimboUrl && <button className="rounded-lg border border-surface-border px-4 py-2.5 text-sm text-gray-200" onClick={() => setCarimboUrl('')}>Remover</button>}</div></div></div></div></section>}
      {pagina === 'ap' && perfil.perfil === 'admin' && <section className="mx-auto max-w-[1180px] pb-7"><div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-surface p-4"><span className="text-sm text-gray-300">Editar autorização existente</span><select className="min-w-60 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" defaultValue="" onChange={e => { const item = autorizacoesWeb.find(ap => ap.id === Number(e.target.value)); if (!item) return; setEditandoApId(item.id); setFormAp({ fornecedor_id: String(item.beneficiario_id), descricao: item.descricao ?? '', valor: String(item.valor), vencimento: item.vencimento ?? new Date().toISOString().slice(0, 10), observacoes: '' }); setNovaAp(true) }}><option value="">Selecione uma AP</option>{autorizacoesWeb.filter(item => item.lote_id === null).map(item => <option key={item.id} value={item.id}>{item.beneficiario_nome} — {Number(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</option>)}</select></div></section>}
      {pagina === 'notas' && perfil.perfil === 'admin' && <section className="mx-auto max-w-[1180px] pb-7"><div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-surface p-4"><span className="text-sm text-gray-300">Editar nota fiscal existente</span><select className="min-w-60 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" defaultValue="" onChange={e => { const item = notasFiscaisWeb.find(nota => nota.id === Number(e.target.value)); if (!item) return; setEditandoNfId(item.id); setFormNf({ fornecedor_id: item.fornecedor_id ? String(item.fornecedor_id) : '', numero_nf: item.numero_nf ?? '', numero_pedido: '', valor: String(item.valor_total), vencimento: item.data || new Date().toISOString().slice(0, 10), data: item.data || new Date().toISOString().slice(0, 10) }); setNovaNf(true) }}><option value="">Selecione uma NF</option>{notasFiscaisWeb.filter(item => item.lote_id === null).map(item => <option key={item.id} value={item.id}>{item.fornecedor_nome} — NF {item.numero_nf ?? '—'}</option>)}</select></div></section>}
      {pagina === 'fornecedores' && <section className="mx-auto max-w-[1180px] pb-7"><div className="flex flex-wrap items-center gap-3 rounded-xl border border-surface-border bg-surface p-4"><span className="text-sm text-gray-300">Editar fornecedor</span><select className="min-w-60 rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-sm text-white" defaultValue="" onChange={e => { const item = fornecedoresWeb.find(fornecedor => fornecedor.id === Number(e.target.value)); if (!item) return; setEditandoFornecedorId(item.id); setFormFornecedor({ nome: item.nome, tipo_pessoa: item.tipo_pessoa, cnpj: item.cnpj ?? '', cpf: item.cpf ?? '', email: item.email ?? '', telefone: item.telefone ?? '', categoria: item.categoria ?? '', forma_pagamento: item.forma_pagamento }); setNovoFornecedor(true) }}><option value="">Selecione um fornecedor</option>{fornecedoresWeb.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div></section>}
      {perfil.perfil === 'supervisor' && pagina === 'supervisor' && documentoFinanceiroId && anexosFinanceiros.length > 0 && <section className="mx-auto max-w-7xl pb-7"><div className="rounded-xl border border-brand-500/35 bg-surface p-4"><h3 className="font-semibold">Aplicar assinatura ao PDF</h3><p className="mt-1 text-sm text-gray-400">A assinatura é gravada em uma cópia do PDF no Storage; o arquivo original permanece preservado.</p><div className="mt-4 space-y-2">{anexosFinanceiros.map(anexo => <div key={anexo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-card p-3"><span className="min-w-0 truncate text-sm">{caminhoStorage(anexo.caminho).split('/').at(-1) ?? 'Documento'}</span><button className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium disabled:opacity-60" disabled={!carimboUrl || !caminhoStorage(anexo.caminho).toLowerCase().endsWith('.pdf')} onClick={() => void assinarPdfNoStorage(anexo.caminho)}>{!carimboUrl ? 'Cadastre a assinatura' : 'Assinar PDF'}</button></div>)}</div></div></section>}
    </main></div>
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<PortalWeb />)
