import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { useBuscaStore } from '@store/busca.store'
import { useCurrency }   from '@hooks/useCurrency'
import { toast }         from '@components/ui/ToastContainer'
import Badge             from '@components/ui/Badge'
import { gerarCapaLote, ApCapaItem } from '../documentos/capaLote'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'
import { bateComBusca } from '../utils/busca'
import {
  Building2, Users, Wallet, FileWarning, ChevronRight, ArrowLeft,
  FileText, Receipt, CheckCircle2, Printer, FolderOutput, UserRound,
} from 'lucide-react'

interface SupervisorResumo {
  usuario_id:      number
  nome:            string
  total_obras:     number
  lotes_pendentes: number
}

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
  total_itens:     number
  itens_aprovados: number
  pendente:        boolean
}

interface ApItem {
  id: number
  beneficiario_nome: string; valor_total: number; qtd_boletos: number
  aprovado_supervisor_por: string | null; aprovado_central_por: string | null
}
interface NfItem {
  id: number; fornecedor_nome: string; numero_nf: string | null; valor_total: number
  qtd_boletos: number; aprovado_supervisor_por: string | null; aprovado_central_por: string | null
  nota_pdf_path: string | null; boletos_pdf_path: string | null
}

type View = 'supervisores' | 'obras' | 'lotes' | 'lote'

// NOVO: painel do Escritório Central — um nível acima do Supervisor.
// Não acompanha obra nem supervisor específico, vê todos. Fluxo:
// Supervisores → Obras (daquele supervisor) → Lotes → AP's/Notas.
// Sem carimbo no documento aqui — só status e notificação, como
// pedido (diferente do Supervisor, que carimba o PDF).
export default function PainelCentral() {
  const usuario  = useAuthStore(s => s.usuario)
  const location = useLocation()
  const { format } = useCurrency()

  const [view, setView] = useState<View>('supervisores')

  const [supervisores, setSupervisores] = useState<SupervisorResumo[]>([])
  const [loadingSupervisores, setLoadingSupervisores] = useState(true)
  const [supervisorAtual, setSupervisorAtual] = useState<SupervisorResumo | null>(null)

  const [obras, setObras] = useState<ObraResumo[]>([])
  const [loadingObras, setLoadingObras] = useState(false)
  const [obraAtual, setObraAtual] = useState<ObraResumo | null>(null)

  const [lotes, setLotes] = useState<Lote[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)
  const [loteAtual, setLoteAtual] = useState<Lote | null>(null)

  const [loteDetalhe, setLoteDetalhe] = useState<{ autorizacoes: ApItem[]; notas_fiscais: NfItem[] } | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [processandoId, setProcessandoId] = useState<number | null>(null)
  const [gerandoExport, setGerandoExport] = useState(false)
  const [gerandoCapa, setGerandoCapa]     = useState(false)

  // NOVO: a busca do topo (Navbar) não se aplica a colaborador/
  // fornecedor pra esse perfil — ela escreve nesse store compartilhado,
  // e aqui filtramos a lista que está na tela (supervisores/obras/
  // lotes/itens do lote). Some sozinha ao sair do painel, pra não
  // deixar filtro "grudado" numa próxima visita.
  const buscaQuery    = useBuscaStore(s => s.query)
  const setBuscaQuery = useBuscaStore(s => s.setQuery)
  useEffect(() => { return () => setBuscaQuery('') }, [setBuscaQuery])

  const supervisoresFiltrado = useMemo(
    () => supervisores.filter(s => bateComBusca(buscaQuery, [s.nome])),
    [supervisores, buscaQuery],
  )
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

  // NOVO: se chegou aqui clicando numa notificação (ex: o Supervisor
  // concluiu um lote, ou o Central aprovou algo), pula direto pro
  // lote — sem precisar navegar supervisor por supervisor, obra por
  // obra.
  useEffect(() => {
    const loteId = (location.state as { loteId?: number } | null)?.loteId
    if (!loteId) return
    setView('lote')
    setLoadingDetalhe(true)
    window.api.lotes.buscarPorId(loteId).then(async (detalhe: any) => {
      if (!detalhe) return
      setLoteAtual({
        id: detalhe.id, titulo: detalhe.titulo, total_itens: 0, itens_aprovados: 0, pendente: true,
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
    window.api.lotes.listarSupervisores()
      .then(setSupervisores)
      .finally(() => setLoadingSupervisores(false))
  }, [])

  function voltarSupervisores() {
    setView('supervisores')
    setLoadingSupervisores(true)
    window.api.lotes.listarSupervisores()
      .then(setSupervisores)
      .finally(() => setLoadingSupervisores(false))
  }

  function voltarObras() {
    if (!supervisorAtual) { setView('obras'); return }
    setView('obras')
    setLoadingObras(true)
    window.api.lotes.obrasDoSupervisor(supervisorAtual.usuario_id)
      .then(setObras)
      .finally(() => setLoadingObras(false))
  }

  function abrirSupervisor(sup: SupervisorResumo) {
    setSupervisorAtual(sup)
    setView('obras')
    setLoadingObras(true)
    window.api.lotes.obrasDoSupervisor(sup.usuario_id)
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

  // ── Autorizar (Escritório Central) — sem carimbo, só status e
  // notificação (o backend já cuida de avisar ADM, Gestor e
  // Supervisor).
  async function autorizarAp(item: ApItem) {
    if (!usuario) return
    setProcessandoId(item.id)
    try {
      await window.api.ap.aprovar({ id: item.id, aprovado_por: usuario.nome, aprovado_perfil: 'central' })
      toast.success('AP aprovada pelo Escritório.')
      recarregarLote()
    } catch {
      toast.error('Erro ao aprovar a AP.')
    } finally {
      setProcessandoId(null)
    }
  }

  async function autorizarNf(item: NfItem) {
    if (!usuario) return
    setProcessandoId(item.id)
    try {
      await window.api.notasFiscais.aprovar({ id: item.id, aprovado_por: usuario.nome, aprovado_perfil: 'central' })
      toast.success('Nota Fiscal aprovada pelo Escritório.')
      recarregarLote()
    } catch {
      toast.error('Erro ao aprovar a nota fiscal.')
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

  // NOVO: gera a "capa" do lote — mesma planilha que existe no painel
  // do Supervisor.
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
        if (completa.pdf_path) arquivos.push({ origem: completa.pdf_path, nomeArquivo: `AP ${a.id} - ${a.beneficiario_nome}` })
      }
      for (const n of loteDetalhe.notas_fiscais) {
        if (n.nota_pdf_path) arquivos.push({ origem: n.nota_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Nota` })
        if (n.boletos_pdf_path) arquivos.push({ origem: n.boletos_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Boletos` })
      }
      if (arquivos.length === 0) { toast.error('Nenhum PDF disponível nesse lote ainda.'); return }

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

  // ── Tela 1: Supervisores ────────────────────────────────
  if (view === 'supervisores') {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Escritório Central</h1>
          <p className="text-sm text-gray-400 mt-0.5">Acompanhamento de todos os Supervisores</p>
        </div>

        {loadingSupervisores ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}</div>
        ) : supervisores.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum Supervisor cadastrado ainda.</p>
        ) : supervisoresFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-3">
            {supervisoresFiltrado.map(s => (
              <button
                key={s.usuario_id}
                onClick={() => abrirSupervisor(s)}
                className="w-full flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
                  <UserRound size={20} className="text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{s.nome}</p>
                  <div className="flex items-center gap-5 mt-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Building2 size={13} /> {s.total_obras} obra{s.total_obras !== 1 && 's'}
                    </span>
                    {s.lotes_pendentes > 0 && (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                        <FileWarning size={13} /> {s.lotes_pendentes} lote{s.lotes_pendentes !== 1 && 's'} pendente{s.lotes_pendentes !== 1 && 's'}
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

  // ── Tela 2: Obras do supervisor selecionado ─────────────
  if (view === 'obras') {
    return (
      <div>
        <button onClick={voltarSupervisores} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar aos Supervisores
        </button>
        <h1 className="text-xl font-semibold text-white mb-1">{supervisorAtual?.nome}</h1>
        <p className="text-sm text-gray-400 mb-6">Obras acompanhadas por esse Supervisor</p>

        {loadingObras ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}</div>
        ) : obras.length === 0 ? (
          <p className="text-sm text-gray-500">Esse Supervisor ainda não tem obras vinculadas.</p>
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

  // ── Tela 3: lotes de uma obra ──────────────────────────
  if (view === 'lotes') {
    return (
      <div>
        <button onClick={voltarObras} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar às obras
        </button>
        <h1 className="text-xl font-semibold text-white mb-1">{obraAtual?.empresa_nome}</h1>
        <p className="text-sm text-gray-400 mb-6">Lotes da Programação Financeira</p>

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
                className="w-full flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3.5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-white">{l.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{l.itens_aprovados} de {l.total_itens} itens autorizados pelo Supervisor</p>
                </div>
                {l.pendente ? <Badge color="yellow">Pendente</Badge> : <Badge color="green">Concluído</Badge>}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Tela 4: detalhe do lote (AP's e NF's) ──────────────
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
                      {a.aprovado_central_por ? (
                        <Badge color="green">Aprovado pelo Escritório</Badge>
                      ) : a.aprovado_supervisor_por ? (
                        <Badge color="blue">Liberada pelo Supervisor</Badge>
                      ) : (
                        <Badge color="yellow">Pendente do Supervisor</Badge>
                      )}
                      <button onClick={() => visualizarAp(a)} disabled={processandoId === a.id} title="Visualizar"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40">
                        <Printer size={13} />
                      </button>
                      {!a.aprovado_central_por && (
                        <button onClick={() => autorizarAp(a)} disabled={processandoId === a.id} title="Autorizar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                          <CheckCircle2 size={13} />
                        </button>
                      )}
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
                      {n.aprovado_central_por ? (
                        <Badge color="green">Aprovado pelo Escritório</Badge>
                      ) : n.aprovado_supervisor_por ? (
                        <Badge color="blue">Liberada pelo Supervisor</Badge>
                      ) : (
                        <Badge color="yellow">Pendente do Supervisor</Badge>
                      )}
                      <button onClick={() => visualizarNf(n.nota_pdf_path)} disabled={!n.nota_pdf_path} title="Ver Nota"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <FileText size={13} />
                      </button>
                      <button onClick={() => visualizarNf(n.boletos_pdf_path)} disabled={!n.boletos_pdf_path} title="Ver Boleto(s)"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <Receipt size={13} />
                      </button>
                      {!n.aprovado_central_por && (
                        <button onClick={() => autorizarNf(n)} disabled={processandoId === n.id} title="Autorizar"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40">
                          <CheckCircle2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
