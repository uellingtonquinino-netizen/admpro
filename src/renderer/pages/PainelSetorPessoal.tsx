import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { useBuscaStore } from '@store/busca.store'
import { toast }         from '@components/ui/ToastContainer'
import Button             from '@components/ui/Button'
import Badge              from '@components/ui/Badge'
import { bateComBusca }  from '../utils/busca'
import {
  Building2, ArrowLeft, ChevronRight, FileSignature, Paperclip, Send, User, CheckCircle2, Clock,
} from 'lucide-react'

interface SolicitacaoResumo {
  id:                number
  empresa_id:        number
  obra_id:           number
  obra_nome:         string
  colaborador_id:    number
  colaborador_nome:  string
  tipo:              'admissao' | 'desligamento' | 'alteracao_salarial' | 'outro'
  status:            'pendente' | 'respondido' | 'concluido'
  solicitado_por:    string
  solicitado_em:     string
  respondido_por:    string | null
  respondido_em:     string | null
}

interface Anexo { id: number; caminho: string; nome: string; origem: string; ordem: number }

interface SolicitacaoDetalhe extends SolicitacaoResumo {
  observacoes:           string | null
  resposta_observacoes:  string | null
  colaborador:           Record<string, unknown>
  anexos_adm:            Anexo[]
  anexos_setor_pessoal:  Anexo[]
}

const TIPO_LABEL: Record<string, string> = {
  admissao:            'Admissão',
  desligamento:        'Desligamento',
  alteracao_salarial:  'Alteração salarial',
  outro:               'Movimentação',
}

function badgeStatus(status: string) {
  if (status === 'pendente')   return <Badge color="yellow">Pendente</Badge>
  if (status === 'respondido') return <Badge color="blue">Respondido — aguardando o ADM baixar</Badge>
  return <Badge color="green">Concluído</Badge>
}

function nomeArquivo(caminho: string): string {
  return caminho.split(/[\\/]/).pop() ?? caminho
}

type View = 'obras' | 'lista' | 'detalhe'

export default function PainelSetorPessoal() {
  const usuario  = useAuthStore(s => s.usuario)
  const location = useLocation()

  const buscaQuery    = useBuscaStore(s => s.query)
  const setBuscaQuery = useBuscaStore(s => s.setQuery)

  const [view, setView] = useState<View>('obras')
  const [obraAtual, setObraAtual] = useState<{ id: number; nome: string } | null>(null)
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoResumo[]>([])
  const [loading, setLoading] = useState(true)

  const [detalheId, setDetalheId] = useState<number | null>(null)
  const [detalhe, setDetalhe]     = useState<SolicitacaoDetalhe | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  const [respostaObs, setRespostaObs] = useState('')
  const [respostaAnexos, setRespostaAnexos] = useState<{ nome: string; caminho: string; arquivo?: File }[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    setView('obras')
    setObraAtual(null)
    setDetalheId(null)
    setBuscaQuery('')
    return () => setBuscaQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  function carregar() {
    setLoading(true)
    window.api.solicitacoesPessoal.listarTodas()
      .then(setSolicitacoes)
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (detalheId == null) { setDetalhe(null); return }
    setLoadingDetalhe(true)
    setRespostaObs('')
    setRespostaAnexos([])
    window.api.solicitacoesPessoal.buscarPorId(detalheId)
      .then(setDetalhe)
      .finally(() => setLoadingDetalhe(false))
  }, [detalheId])

  // ── Agrupamento por obra ──────────────────────────────────
  const porObra = useMemo(() => {
    const mapa = new Map<number, { id: number; nome: string; itens: SolicitacaoResumo[] }>()
    for (const s of solicitacoes) {
      if (!mapa.has(s.obra_id)) mapa.set(s.obra_id, { id: s.obra_id, nome: s.obra_nome, itens: [] })
      mapa.get(s.obra_id)!.itens.push(s)
    }
    return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [solicitacoes])

  const obrasFiltrado = useMemo(
    () => porObra.filter(o => bateComBusca(buscaQuery, [o.nome])),
    [porObra, buscaQuery],
  )

  const itensDaObra = useMemo(
    () => obraAtual ? solicitacoes.filter(s => s.obra_id === obraAtual.id).sort((a, b) => b.solicitado_em.localeCompare(a.solicitado_em)) : [],
    [solicitacoes, obraAtual],
  )
  const itensDaObraFiltrado = useMemo(
    () => itensDaObra.filter(s => bateComBusca(buscaQuery, [s.colaborador_nome, TIPO_LABEL[s.tipo]])),
    [itensDaObra, buscaQuery],
  )

  function abrirObra(o: { id: number; nome: string }) {
    setObraAtual(o)
    setView('lista')
  }

  function abrirSolicitacao(id: number) {
    setDetalheId(id)
    setView('detalhe')
  }

  function handleSelecionarAnexos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    const novos = arquivos.map(f => {
      const caminhoLocal = (f as unknown as { path?: string }).path
      return { nome: f.name, caminho: caminhoLocal ?? f.name, arquivo: caminhoLocal ? undefined : f }
    })
    setRespostaAnexos(prev => [...prev, ...novos])
    e.target.value = ''
  }

  async function handleResponder() {
    if (!detalhe || !usuario) return
    if (respostaAnexos.length === 0) {
      toast.error('Anexe ao menos um documento antes de responder.')
      return
    }
    setEnviando(true)
    try {
      // NOVO: rodando na web, resolve cada File pra um caminho de
      // verdade antes de mandar — no desktop `.path` já resolve
      // isso sozinho.
      const anexosProntos = window.api.documentos.prepararAnexoWeb
        ? await Promise.all(respostaAnexos.map(async a => a.arquivo
            ? { nome: a.nome, caminho: await window.api.documentos.prepararAnexoWeb!({ empresa_id: detalhe.empresa_id, pasta_id: 'solicitacoes-temp', arquivo: a.arquivo }) }
            : { nome: a.nome, caminho: a.caminho }))
        : respostaAnexos

      await window.api.solicitacoesPessoal.responder({
        id:                    detalhe.id,
        respondido_por:        usuario.nome,
        resposta_observacoes:  respostaObs || null,
        anexos:                anexosProntos,
      })
      toast.success('Resposta enviada — o ADM já pode baixar os documentos.')
      carregar()
      setDetalheId(detalhe.id) // recarrega o detalhe com o status novo
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao responder a solicitação.')
    } finally {
      setEnviando(false)
    }
  }

  const c = detalhe?.colaborador as Record<string, unknown> | undefined

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {view !== 'obras' && (
        <button
          onClick={() => {
            if (view === 'detalhe') { setView('lista'); setDetalheId(null) }
            else { setView('obras'); setObraAtual(null) }
          }}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Voltar
        </button>
      )}

      {view === 'obras' && (
        <>
          <div className="flex items-center gap-2 mb-1">
            <FileSignature size={20} className="text-brand-400" />
            <h1 className="text-lg font-bold text-white">Setor Pessoal</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Solicitações de admissão, desligamento, alteração salarial e outras movimentações, de todas as obras.
          </p>

          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 shimmer rounded-xl" />)}</div>
          ) : porObra.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma solicitação recebida ainda.</p>
          ) : obrasFiltrado.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
          ) : (
            <div className="space-y-3">
              {obrasFiltrado.map(o => {
                const pendentes = o.itens.filter(i => i.status === 'pendente').length
                return (
                  <button
                    key={o.id}
                    onClick={() => abrirObra(o)}
                    className="w-full flex items-center gap-4 p-4 bg-surface border border-surface-border rounded-xl hover:border-brand-500/50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-brand-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{o.nome}</p>
                      <p className="text-xs text-gray-500">{o.itens.length} solicitação(ões) no total</p>
                    </div>
                    {pendentes > 0 && <Badge color="yellow">{pendentes} pendente(s)</Badge>}
                    <ChevronRight size={16} className="text-gray-600 shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {view === 'lista' && obraAtual && (
        <>
          <h1 className="text-lg font-bold text-white mb-1">{obraAtual.nome}</h1>
          <p className="text-sm text-gray-500 mb-6">Solicitações dessa obra ao Setor Pessoal.</p>

          {itensDaObra.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma solicitação dessa obra ainda.</p>
          ) : itensDaObraFiltrado.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
          ) : (
            <div className="space-y-2">
              {itensDaObraFiltrado.map(s => (
                <button
                  key={s.id}
                  onClick={() => abrirSolicitacao(s.id)}
                  className="w-full flex items-center gap-4 p-3.5 bg-surface border border-surface-border rounded-xl hover:border-brand-500/50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
                    <User size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{s.colaborador_nome}</p>
                    <p className="text-xs text-gray-500">
                      {TIPO_LABEL[s.tipo] ?? s.tipo} · solicitado por {s.solicitado_por} em {new Date(s.solicitado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {badgeStatus(s.status)}
                  <ChevronRight size={16} className="text-gray-600 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {view === 'detalhe' && (
        loadingDetalhe || !detalhe ? (
          <div className="h-60 shimmer rounded-xl" />
        ) : (
          <>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-bold text-white">{detalhe.colaborador_nome}</h1>
              {badgeStatus(detalhe.status)}
            </div>
            <p className="text-sm text-gray-500 mb-6">
              {TIPO_LABEL[detalhe.tipo] ?? detalhe.tipo} · {detalhe.obra_nome} · solicitado por {detalhe.solicitado_por} em {new Date(detalhe.solicitado_em).toLocaleDateString('pt-BR')}
            </p>

            {/* Resumo do colaborador */}
            <div className="bg-surface border border-surface-border rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 mb-2">DADOS DO COLABORADOR</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-gray-500">Função</p><p className="text-gray-200">{(c?.funcao as string) || '—'}</p></div>
                <div><p className="text-xs text-gray-500">Admissão</p><p className="text-gray-200">{(c?.data_admissao as string) || '—'}</p></div>
                <div><p className="text-xs text-gray-500">CPF</p><p className="text-gray-200">{(c?.cpf as string) || '—'}</p></div>
                <div><p className="text-xs text-gray-500">Salário</p><p className="text-gray-200">{c?.salario_base ? `R$ ${Number(c.salario_base).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p></div>
                <div><p className="text-xs text-gray-500">Status</p><p className="text-gray-200">{(c?.status as string) || '—'}</p></div>
                <div><p className="text-xs text-gray-500">Data de demissão</p><p className="text-gray-200">{(c?.data_demissao as string) || '—'}</p></div>
              </div>
            </div>

            {/* Observações e anexos do ADM */}
            <div className="bg-surface border border-surface-border rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-400 mb-2">SOLICITAÇÃO DO ADM</p>
              <p className="text-sm text-gray-300 mb-3">{detalhe.observacoes || 'Sem observações.'}</p>
              {detalhe.anexos_adm.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum anexo enviado junto com o pedido.</p>
              ) : (
                <div className="space-y-1.5">
                  {detalhe.anexos_adm.map(a => (
                    <button
                      key={a.id}
                      onClick={() => window.api.documentos.abrirArquivo(a.caminho)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300 hover:text-white transition-colors text-left"
                    >
                      <Paperclip size={13} className="shrink-0" /> {a.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Resposta já enviada, se houver */}
            {detalhe.status !== 'pendente' && (
              <div className="bg-surface border border-surface-border rounded-xl p-4 mb-4">
                <p className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" /> RESPOSTA ENVIADA
                  {detalhe.respondido_por && <span className="text-gray-500 font-normal">— {detalhe.respondido_por} em {detalhe.respondido_em ? new Date(detalhe.respondido_em).toLocaleDateString('pt-BR') : ''}</span>}
                </p>
                {detalhe.resposta_observacoes && <p className="text-sm text-gray-300 mb-3">{detalhe.resposta_observacoes}</p>}
                <div className="space-y-1.5">
                  {detalhe.anexos_setor_pessoal.map(a => (
                    <button
                      key={a.id}
                      onClick={() => window.api.documentos.abrirArquivo(a.caminho)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300 hover:text-white transition-colors text-left"
                    >
                      <Paperclip size={13} className="shrink-0" /> {a.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Formulário de resposta — só enquanto pendente */}
            {detalhe.status === 'pendente' && (
              <div className="bg-surface border border-surface-border rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-400 mb-3 flex items-center gap-1.5">
                  <Clock size={13} /> RESPONDER E DEVOLVER PRO ADM
                </p>
                <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-surface-border rounded-lg text-sm text-gray-400 hover:border-brand-500/50 hover:text-brand-400 cursor-pointer transition-colors mb-3">
                  <Paperclip size={14} /> Anexar documento(s) prontos
                  <input type="file" multiple className="hidden" onChange={handleSelecionarAnexos} />
                </label>
                {respostaAnexos.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {respostaAnexos.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300">
                        <Paperclip size={13} className="shrink-0" /> {a.nome}
                        <button
                          onClick={() => setRespostaAnexos(prev => prev.filter((_, idx) => idx !== i))}
                          className="ml-auto text-gray-500 hover:text-red-400"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  className="input resize-none w-full mb-3"
                  rows={3}
                  placeholder="Observações pro ADM (opcional)"
                  value={respostaObs}
                  onChange={e => setRespostaObs(e.target.value.toUpperCase())}
                />
                <Button icon={<Send size={14} />} onClick={handleResponder} loading={enviando}>
                  Responder e Enviar de Volta
                </Button>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
