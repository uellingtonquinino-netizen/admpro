import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { useBuscaStore } from '@store/busca.store'
import { useCurrency }   from '@hooks/useCurrency'
import { useConfirm }    from '@hooks/useConfirm'
import { toast }         from '@components/ui/ToastContainer'
import Badge             from '@components/ui/Badge'
import ConfirmDialog      from '@components/ui/ConfirmDialog'
import { gerarHtmlAP }   from '../documentos/ap'
import { gerarCapaLote, ApCapaItem } from '../documentos/capaLote'
import { aplicarCarimbosAP } from '../utils/carimbosAp'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'
import { bateComBusca } from '../utils/busca'
import PainelEstoqueObra from '@components/almoxarifado/PainelEstoqueObra'
import {
  Building2, Users, Wallet, FileWarning, ChevronRight, ArrowLeft,
  FileText, Receipt, CheckCircle2, Printer, FolderOutput, Trash2, Boxes,
} from 'lucide-react'

interface ObraResumo {
  empresa_id:      number
  empresa_nome:    string
  logo_url:        string | null
  colaboradores:   number
  gastos_mes:      number
  lotes_pendentes: number
}

interface Lote {
  id:              number
  titulo:          string
  data_inicio:     string
  data_fim:        string
  total_itens:     number
  itens_aprovados: number
  pendente:        boolean
}

interface ApItem {
  id: number; beneficiario_tipo: 'fornecedor' | 'colaborador'; beneficiario_id: number
  beneficiario_nome: string; valor_total: number; qtd_boletos: number
  aprovado_por: string | null; aprovado_supervisor_por: string | null
}
interface NfItem {
  id: number; fornecedor_nome: string; numero_nf: string | null; valor_total: number
  qtd_boletos: number; aprovado_por: string | null; aprovado_supervisor_por: string | null
  nota_pdf_path: string | null; boletos_pdf_path: string | null
}

type View = 'obras' | 'lotes' | 'lote'

// NOVO: painel do Supervisor — acompanha várias obras ao mesmo tempo.
// Mostra um card por obra (colaboradores, gastos do mês, lotes
// pendentes), ao clicar entra na lista de lotes daquela obra, e ao
// abrir um lote vê as AP's e Notas Fiscais dentro dele — autorizando
// do mesmo jeito que o Gestor já faz, só que a assinatura registrada
// é a do Supervisor.
export default function PainelSupervisor() {
  const usuario  = useAuthStore(s => s.usuario)
  const location = useLocation()
  const navigate  = useNavigate()
  const { format } = useCurrency()

  const [view, setView]   = useState<View>('obras')
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [loadingObras, setLoadingObras] = useState(true)

  const [obraAtual, setObraAtual] = useState<ObraResumo | null>(null)
  const [estadoOrigem, setEstadoOrigem] = useState<string | null>(null)
  const [lotes, setLotes]         = useState<Lote[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)

  const [loteAtual, setLoteAtual] = useState<Lote | null>(null)
  const [loteDetalhe, setLoteDetalhe] = useState<{ autorizacoes: ApItem[]; notas_fiscais: NfItem[] } | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [processandoId, setProcessandoId] = useState<number | null>(null)
  const { confirm, dialogProps } = useConfirm()
  const [gerandoExport, setGerandoExport] = useState(false)
  const [gerandoCapa, setGerandoCapa]     = useState(false)

  // NOVO: a busca do topo (Navbar) não se aplica a colaborador/
  // fornecedor pra esse perfil — ela escreve nesse store compartilhado,
  // e aqui filtramos a lista que está na tela (obras/lotes/itens do
  // lote). Some sozinha ao sair do painel, pra não deixar filtro
  // "grudado" numa próxima visita.
  const buscaQuery    = useBuscaStore(s => s.query)
  const setBuscaQuery = useBuscaStore(s => s.setQuery)
  useEffect(() => { return () => setBuscaQuery('') }, [setBuscaQuery])

  const obrasFiltrado = useMemo(
    () => obras.filter(o => bateComBusca(buscaQuery, [o.empresa_nome])),
    [obras, buscaQuery],
  )
  const lotesFiltrado = useMemo(
    () => lotes.filter(l => bateComBusca(buscaQuery, [l.titulo])),
    [lotes, buscaQuery],
  )
  const autorizacoesFiltrado = useMemo(
    () => (loteDetalhe?.autorizacoes ?? []).filter(a => bateComBusca(buscaQuery, [a.beneficiario_nome])),
    [loteDetalhe, buscaQuery],
  )
  const notasFiltrado = useMemo(
    () => (loteDetalhe?.notas_fiscais ?? []).filter(n => bateComBusca(buscaQuery, [n.fornecedor_nome, n.numero_nf])),
    [loteDetalhe, buscaQuery],
  )

  // NOVO: se chegou aqui clicando numa notificação de "lote novo",
  // pula direto pro lote — sem precisar navegar obra por obra.
  useEffect(() => {
    const loteId = (location.state as { loteId?: number } | null)?.loteId
    if (!loteId) return
    setView('lote')
    setLoadingDetalhe(true)
    window.api.lotes.buscarPorId(loteId).then(async (detalhe: any) => {
      if (!detalhe) return
      setLoteAtual({
        id: detalhe.id, titulo: detalhe.titulo, data_inicio: detalhe.data_inicio, data_fim: detalhe.data_fim,
        total_itens: 0, itens_aprovados: 0, pendente: true,
      })
      setLoteDetalhe(detalhe)
      const empresa = await window.api.empresas.buscarPorId(detalhe.empresa_id)
      setObraAtual({
        empresa_id: detalhe.empresa_id, empresa_nome: empresa?.nome ?? '', logo_url: empresa?.logo_url ?? null,
        colaboradores: 0, gastos_mes: 0, lotes_pendentes: 0,
      })
    }).finally(() => setLoadingDetalhe(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const obraIds = usuario?.obras_supervisor ?? []
    if (obraIds.length === 0) { setLoadingObras(false); return }
    window.api.lotes.resumoObras(obraIds)
      .then(setObras)
      .finally(() => setLoadingObras(false))
  }, [usuario])

  // NOVO: se chegou aqui clicando numa obra na grade do estado
  // (Painel de Resumo), pula direto pra tela de lotes dela — sem
  // precisar escolher a obra de novo na lista. Guarda também de qual
  // estado ela veio, pra "Voltar às obras" levar de volta pra grade
  // daquele estado, não pra lista simples.
  // CORRIGIDO: sem limpar o location.state depois de usá-lo, esse
  // efeito reabria a mesma obra toda vez que a lista de obras era
  // recarregada (ex: ao clicar em "Voltar às obras", que já
  // recarrega a lista) — parecia que o botão de voltar não fazia
  // nada, porque a tela já voltava a pular pra obra na hora.
  useEffect(() => {
    const state = location.state as { obraEmpresaId?: number; estadoOrigem?: string } | null
    if (state?.estadoOrigem) setEstadoOrigem(state.estadoOrigem)
    const obraEmpresaId = state?.obraEmpresaId
    if (!obraEmpresaId || obras.length === 0) return
    const obra = obras.find(o => o.empresa_id === obraEmpresaId)
    if (obra) abrirObra(obra)
    navigate(location.pathname, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras])

  // CORRIGIDO: voltar pra tela de obras estava só trocando a tela,
  // sem buscar os dados de novo — depois de aprovar um lote inteiro,
  // o card da obra continuava mostrando a contagem antiga de "lotes
  // pendentes" até a página ser recarregada na mão.
  // ALTERADO: se a obra veio da grade de um estado (Painel de
  // Resumo → clicar num estado → clicar numa obra), "Voltar às
  // obras" leva de volta pra grade daquele estado — só cai na lista
  // simples de todas as obras se não tiver essa origem.
  function voltarObras() {
    if (estadoOrigem) {
      navigate(`/supervisor/estado/${encodeURIComponent(estadoOrigem)}`)
      return
    }
    setView('obras')
    setLoadingObras(true)
    const obraIds = usuario?.obras_supervisor ?? []
    window.api.lotes.resumoObras(obraIds)
      .then(setObras)
      .finally(() => setLoadingObras(false))
  }

  function abrirObra(obra: ObraResumo) {
    setObraAtual(obra)
    setView('lotes')
    setLoadingLotes(true)
    window.api.lotes.listarPorObra(obra.empresa_id)
      .then(setLotes)
      .finally(() => setLoadingLotes(false))
  }

  function abrirLote(lote: Lote) {
    setLoteAtual(lote)
    setView('lote')
    setLoadingDetalhe(true)
    window.api.lotes.buscarPorId(lote.id)
      .then(setLoteDetalhe)
      .finally(() => setLoadingDetalhe(false))
  }

  function recarregarLote() {
    if (!loteAtual) return
    window.api.lotes.buscarPorId(loteAtual.id).then(setLoteDetalhe)
    if (obraAtual) window.api.lotes.listarPorObra(obraAtual.empresa_id).then(setLotes)
  }

  // ── Autorizar uma AP dentro do lote — mesma vaga de assinatura da
  // AP, só que quem assina é o Supervisor. Regera o PDF já com o
  // carimbo, igual o Gestor já faz.
  async function autorizarAp(item: ApItem) {
    if (!usuario) return
    setProcessandoId(item.id)
    try {
      const { aprovado_em } = await window.api.ap.aprovar({
        id: item.id, aprovado_por: usuario.nome, aprovado_perfil: 'supervisor', usuario_id: usuario.id,
      })

      const completa = await window.api.ap.buscarPorId(item.id)
      const empresaAtual = await window.api.empresas.buscarPorId(obraAtual!.empresa_id)

      let documento = ''
      let banco: string | null = null, agencia: string | null = null
      let conta: string | null = null, contaDigito: string | null = null
      let ehBoleto = false
      if (completa.beneficiario_tipo === 'fornecedor') {
        const f = await window.api.fornecedores.buscarPorId(completa.beneficiario_id)
        documento = f.cnpj ? `CNPJ: ${formatCNPJ(f.cnpj)}` : `CPF: ${formatCPF(f.cpf) || '—'}`
        ehBoleto = f.forma_pagamento === 'boleto'
        banco = f.banco ?? null; agencia = f.agencia ?? null
        conta = f.conta ?? null; contaDigito = f.conta_digito ?? null
      } else {
        const c = await window.api.colaboradores.buscarPorId(completa.beneficiario_id)
        documento = `CPF: ${formatCPF(c.cpf) || '—'}`
        banco = c.banco ?? null; agencia = c.agencia ?? null
        conta = c.conta ?? null; contaDigito = c.conta_digito ?? null
      }

      const html = gerarHtmlAP({
        centroCusto:      empresaAtual.razao_social || empresaAtual.nome,
        logoUrl:          empresaAtual.logo_url,
        beneficiarioNome: completa.beneficiario_nome,
        documento,
        descricao:        completa.descricao ?? '',
        boletos:          completa.boletos,
        boleto:           ehBoleto,
        banco, agencia, conta, contaDigito,
        observacoes:      completa.observacoes ?? '',
        solicitante:      completa.solicitante ?? '',
        autorizadoPor:    completa.autorizado_por ?? '',
      })

      const resultado = await window.api.documentos.salvarPdfInterno({
        html, nomeArquivo: `AP - ${completa.beneficiario_nome}`, anexos: completa.anexos ?? [], pastaId: `AP_${item.id}`,
      })
      if (resultado.ok) {
        await window.api.ap.salvarCaminhoPdf({ id: item.id, pdf_path: resultado.filePath })
        // Carimbo do Gestor (se já tiver aprovado antes) e do
        // Supervisor (agora) — mesmo tamanho, lado a lado.
        const carimbo = await aplicarCarimbosAP(resultado.filePath, {
          aprovado_por: completa.aprovado_por,
          aprovado_em: completa.aprovado_em,
          aprovado_supervisor_por: usuario.nome,
          aprovado_supervisor_em: aprovado_em,
        })
        if (!carimbo.ok) toast.error(carimbo.erros.join(' '))
      }

      toast.success('AP autorizada.')
      recarregarLote()
    } catch {
      toast.error('Erro ao autorizar a AP.')
    } finally {
      setProcessandoId(null)
    }
  }

  // ── Autorizar uma Nota Fiscal dentro do lote — mesma lógica que a
  // tela de Notas Fiscais já usa.
  async function autorizarNf(item: NfItem) {
    if (!usuario) return
    setProcessandoId(item.id)
    try {
      const { aprovado_em } = await window.api.notasFiscais.aprovar({
        id: item.id, aprovado_por: usuario.nome, aprovado_perfil: 'supervisor', usuario_id: usuario.id,
      })
      if (item.nota_pdf_path) {
        await window.api.documentos.carimbarPrimeiraPagina({
          caminhoPdf: item.nota_pdf_path, aprovadoPor: usuario.nome, aprovadoEm: aprovado_em,
          carimboBase64: usuario.carimbo_url ?? null,
          posicao: 'inferior-direito', tamanho: 'pequeno',
        })
      }
      toast.success('Nota Fiscal autorizada.')
      recarregarLote()
    } catch {
      toast.error('Erro ao autorizar a nota fiscal.')
    } finally {
      setProcessandoId(null)
    }
  }

  // NOVO: exclui uma AP direto da tela do lote — sem precisar voltar
  // pra tela de Autorização de Pagamento do ADM só pra isso.
  async function excluirAp(item: ApItem) {
    const ok = await confirm({
      title:   'Excluir Autorização de Pagamento',
      danger:  true,
      message: `Deseja excluir a AP de "${item.beneficiario_nome}"? A despesa lançada no Financeiro também será removida.`,
    })
    if (!ok) return
    setProcessandoId(item.id)
    try {
      await window.api.ap.excluir(item.id)
      toast.success('AP excluída.')
      recarregarLote()
    } catch {
      toast.error('Erro ao excluir a AP.')
    } finally {
      setProcessandoId(null)
    }
  }

  // NOVO: mesma ideia, pra Nota Fiscal.
  async function excluirNf(item: NfItem) {
    const ok = await confirm({
      title:   'Excluir Nota Fiscal',
      danger:  true,
      message: `Deseja excluir a NF de "${item.fornecedor_nome}"? A despesa lançada no Financeiro também será removida.`,
    })
    if (!ok) return
    setProcessandoId(item.id)
    try {
      await window.api.notasFiscais.excluir(item.id)
      toast.success('Nota Fiscal excluída.')
      recarregarLote()
    } catch {
      toast.error('Erro ao excluir a nota fiscal.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function visualizarAp(item: ApItem) {
    setProcessandoId(item.id)
    try {
      const completa = await window.api.ap.buscarPorId(item.id)
      if (completa.pdf_path) {
        await window.api.documentos.abrirArquivo(completa.pdf_path)
      } else {
        toast.error('Essa AP ainda não tem um PDF pronto pra visualizar.')
      }
    } finally {
      setProcessandoId(null)
    }
  }

  async function visualizarNf(caminho: string | null) {
    if (!caminho) { toast.error('Nenhum arquivo anexado.'); return }
    await window.api.documentos.abrirArquivo(caminho)
  }

  // NOVO: exporta os PDFs de tudo que está no lote (AP's e Notas
  // Fiscais) pra uma pasta escolhida na hora — mesma ideia do "Gerar
  // Lote" que já existe na tela de Autorização de Pagamento.
  // NOVO: gera a "capa" do lote — uma lista em forma de planilha com
  // todas as AP's (número, data, nome/razão social, dados bancários,
  // descrição, vencimento e valor), com o total geral no final.
  async function handleGerarCapa() {
    if (!loteAtual) return
    setGerandoCapa(true)
    try {
      const dados = await window.api.lotes.apsParaCapa(loteAtual.id)
      if (dados.length === 0) { toast.error('Nenhuma AP nesse lote ainda.'); return }

      const itens: ApCapaItem[] = dados.map((d: any, i: number) => ({
        numero: i + 1,
        data_emissao: d.created_at,
        nome_razao_social: d.beneficiario_nome,
        documento: d.cnpj ? formatCNPJ(d.cnpj) : (d.cpf ? formatCPF(d.cpf) : ''),
        banco: d.forma_pagamento === 'boleto' ? 'Boleto' : (d.banco ?? ''),
        agencia: d.agencia ?? '',
        operacao: d.operacao ?? '',
        conta: d.conta ? `${d.conta}${d.conta_digito ? '-' + d.conta_digito : ''}` : '',
        descricao: d.descricao ?? '',
        vencimento: d.primeiro_vencimento,
        valor_total: d.valor_total,
      }))

      const html = gerarCapaLote(
        { nome: obraAtual?.empresa_nome ?? '', logo_url: obraAtual?.logo_url }, loteAtual.titulo, itens, format,
      )
      const resultado = await window.api.documentos.imprimir({ html, nomeArquivo: `Capa - ${loteAtual.titulo}`, landscape: true })
      if (!resultado.ok && !resultado.canceled) toast.error('Erro ao gerar a capa do lote.')
    } catch {
      toast.error('Erro ao gerar a capa do lote.')
    } finally {
      setGerandoCapa(false)
    }
  }

  async function handleExportarLote() {
    if (!loteDetalhe) return
    setGerandoExport(true)
    try {
      const arquivos: { origem: string; nomeArquivo: string }[] = []

      for (const a of loteDetalhe.autorizacoes) {
        const completa = await window.api.ap.buscarPorId(a.id)
        if (completa.pdf_path) {
          arquivos.push({ origem: completa.pdf_path, nomeArquivo: `AP ${a.id} - ${a.beneficiario_nome}` })
        }
      }
      for (const n of loteDetalhe.notas_fiscais) {
        if (n.nota_pdf_path) arquivos.push({ origem: n.nota_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Nota` })
        if (n.boletos_pdf_path) arquivos.push({ origem: n.boletos_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Boletos` })
      }

      if (arquivos.length === 0) {
        toast.error('Nenhum PDF disponível nesse lote ainda.')
        return
      }

      const resultado = await window.api.documentos.gerarLote(arquivos)
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao exportar o lote.'); return }
      toast.success(`${resultado.copiados} de ${resultado.total} arquivo(s) copiados para a pasta.`)
    } catch {
      toast.error('Erro ao exportar o lote.')
    } finally {
      setGerandoExport(false)
    }
  }

  // ── Tela 1: obras ──────────────────────────────────────
  if (view === 'obras') {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Painel Supervisor</h1>
          <p className="text-sm text-gray-400 mt-0.5">Acompanhamento das obras sob sua supervisão</p>
        </div>

        {loadingObras ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-28 shimmer rounded-xl" />)}
          </div>
        ) : obras.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma obra vinculada ao seu usuário ainda. Peça para o ADM te associar a uma obra.</p>
        ) : obrasFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-3">
            {obrasFiltrado.map(o => (
              <button
                key={o.empresa_id}
                onClick={() => abrirObra(o)}
                className="w-full flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                  <Building2 size={20} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{o.empresa_nome}</p>
                  <div className="flex items-center gap-5 mt-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Users size={13} /> {o.colaboradores} colaborador{o.colaboradores !== 1 && 'es'}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Wallet size={13} /> {format(o.gastos_mes)} no mês
                    </span>
                    {o.lotes_pendentes > 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                        <FileWarning size={13} /> {o.lotes_pendentes} lote{o.lotes_pendentes !== 1 && 's'} pendente{o.lotes_pendentes !== 1 && 's'}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Tela 2: lotes de uma obra ──────────────────────────
  if (view === 'lotes') {
    return (
      <div>
        <button onClick={voltarObras} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar às obras
        </button>
        <h1 className="text-xl font-semibold text-white mb-1">{obraAtual?.empresa_nome}</h1>

        {/* Caixa 1 — Programação Financeira (já existia) */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Wallet size={15} className="text-brand-400" />
            </div>
            <p className="text-sm font-semibold text-white">Programação Financeira</p>
          </div>

          {loadingLotes ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 shimmer rounded-xl" />)}</div>
          ) : lotes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum lote enviado por essa obra ainda.</p>
          ) : lotesFiltrado.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
          ) : (
            <div className="space-y-2">
              {lotesFiltrado.map(l => (
                <button
                  key={l.id}
                  onClick={() => abrirLote(l)}
                  className="w-full flex items-center justify-between bg-surface-hover border border-surface-border rounded-xl px-4 py-3.5 hover:border-brand-500/50 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{l.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{l.itens_aprovados} de {l.total_itens} itens autorizados</p>
                  </div>
                  {l.pendente ? <Badge color="yellow">Pendente</Badge> : <Badge color="green">Concluído</Badge>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Caixa 2 — Estoque (NOVO): mesmo painel do Almoxarife da
            obra, só leitura — 3 caixas de resumo + lista de materiais */}
        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Boxes size={15} className="text-brand-400" />
            </div>
            <p className="text-sm font-semibold text-white">Estoque</p>
          </div>
          {obraAtual && <PainelEstoqueObra empresaId={obraAtual.empresa_id} />}
        </div>
      </div>
    )
  }

  // ── Tela 3: detalhe do lote (AP's e NF's) ──────────────
  return (
    <div>
      <button onClick={() => setView('lotes')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
        <ArrowLeft size={14} /> Voltar aos lotes
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">{loteAtual?.titulo}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGerarCapa}
            disabled={gerandoCapa || !loteDetalhe}
            className="flex items-center gap-1.5 text-sm text-gray-300 border border-surface-border rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            <FileText size={14} /> {gerandoCapa ? 'Gerando…' : 'Gerar Capa (AP\'s)'}
          </button>
          <button
            onClick={handleExportarLote}
            disabled={gerandoExport || !loteDetalhe}
            className="flex items-center gap-1.5 text-sm text-gray-300 border border-surface-border rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            <FolderOutput size={14} /> {gerandoExport ? 'Exportando…' : 'Exportar Lote'}
          </button>
        </div>
      </div>

      {loadingDetalhe || !loteDetalhe ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 shimmer rounded-xl" />)}</div>
      ) : (
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">Autorizações de Pagamento</p>
            {loteDetalhe.autorizacoes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma AP nesse lote.</p>
            ) : autorizacoesFiltrado.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
            ) : (
              <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
                {autorizacoesFiltrado.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{a.beneficiario_nome}</p>
                      <p className="text-xs text-gray-500">{format(a.valor_total)} · {a.qtd_boletos} parcela{a.qtd_boletos !== 1 && 's'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.aprovado_supervisor_por ? (
                        <Badge color="green">Aprovado</Badge>
                      ) : (
                        <Badge color="yellow">Pendente</Badge>
                      )}
                      <button onClick={() => visualizarAp(a)} disabled={processandoId === a.id} title="Visualizar"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40">
                        <Printer size={13} />
                      </button>
                      {!a.aprovado_supervisor_por && (
                        <button onClick={() => autorizarAp(a)} disabled={processandoId === a.id} title="Autorizar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                          <CheckCircle2 size={13} />
                        </button>
                      )}
                      <button onClick={() => excluirAp(a)} disabled={processandoId === a.id} title="Excluir"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">Notas Fiscais</p>
            {loteDetalhe.notas_fiscais.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma nota fiscal nesse lote.</p>
            ) : notasFiltrado.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
            ) : (
              <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
                {notasFiltrado.map(n => (
                  <div key={n.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{n.fornecedor_nome} <span className="text-xs text-gray-500">NF {n.numero_nf ?? '—'}</span></p>
                      <p className="text-xs text-gray-500">{format(n.valor_total)} · {n.qtd_boletos} boleto{n.qtd_boletos !== 1 && 's'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {n.aprovado_supervisor_por ? (
                        <Badge color="green">Aprovado</Badge>
                      ) : (
                        <Badge color="yellow">Pendente</Badge>
                      )}
                      <button onClick={() => visualizarNf(n.nota_pdf_path)} disabled={!n.nota_pdf_path} title="Ver Nota"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <FileText size={13} />
                      </button>
                      <button onClick={() => visualizarNf(n.boletos_pdf_path)} disabled={!n.boletos_pdf_path} title="Ver Boleto(s)"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <Receipt size={13} />
                      </button>
                      {!n.aprovado_supervisor_por && (
                        <button onClick={() => autorizarNf(n)} disabled={processandoId === n.id} title="Autorizar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                          <CheckCircle2 size={13} />
                        </button>
                      )}
                      <button onClick={() => excluirNf(n)} disabled={processandoId === n.id} title="Excluir"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
