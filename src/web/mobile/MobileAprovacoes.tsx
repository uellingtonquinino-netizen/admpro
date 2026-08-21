import { useEffect, useState } from 'react'
import { apiWeb } from '../api-web'
import { usePeriodoPersistido } from './usePeriodoPersistido'

interface Props {
  empresaIds: number[]
  ehSupervisor: boolean
}

interface ApPendente {
  id: number
  beneficiario_nome: string
  descricao: string | null
  valor: number
  created_at: string
  // NOVO: usada no filtro por período (data de emissão do
  // documento) — pode não vir preenchida em registros antigos, nesse
  // caso o filtro cai pra created_at, igual o desktop já faz.
  data_emissao: string | null
  pdf_path: string | null
  lote_id: number | null
}

interface NotaPendente {
  id: number
  fornecedor_nome: string
  numero_nf: string | null
  nota_pdf_path: string | null
  boletos_pdf_path: string | null
  data: string
  lote_id: number | null
}

// NOVO: Autorização de Pagamento em Lote — vários beneficiários numa
// AP só, com só 1 documento pra ver/aprovar (não abre item por item
// aqui, o documento já mostra a tabela inteira).
interface ApLotePendente {
  id: number
  titulo: string | null
  descricao: string | null
  data_emissao: string
  pdf_path: string | null
  quantidade_itens: number
  valor_total: number
}

interface LoteInfo { id: number; titulo: string }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatData(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

// NOVO: lista tudo que espera a aprovação do usuário logado (Gestor
// aprova o 1º nível; Supervisor aprova o que já foi enviado em lote)
// — visualizar o documento antes de aprovar, e aprovar com um toque.
export default function MobileAprovacoes({ empresaIds, ehSupervisor }: Props) {
  const [aps, setAps] = useState<ApPendente[]>([])
  const [notas, setNotas] = useState<NotaPendente[]>([])
  const [apsLote, setApsLote] = useState<ApLotePendente[]>([])
  const [lotes, setLotes] = useState<LoteInfo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<number | null>(null)
  const [abrindo, setAbrindo] = useState<string | null>(null)
  // NOVO: filtro por período, por DATA DE EMISSÃO do documento (não
  // a data de criação do registro) — igual o desktop. Lembra a
  // última data escolhida, mesmo depois de atualizar a página.
  const { dataInicio, setDataInicio, dataFim, setDataFim } = usePeriodoPersistido(
    'mobile-aprovacoes-periodo', '', ''
  )
  // NOVO: qual lote está "aberto" agora — null = mostrando a lista de
  // lotes (igual o programa); com um id, mostra as APs/Notas daquele
  // lote específico.
  const [loteAbertoId, setLoteAbertoId] = useState<number | null>(null)

  function carregar() {
    if (empresaIds.length === 0) { setCarregando(false); return }
    setCarregando(true)
    setErro(null)
    apiWeb.aprovacoes.pendentes({ empresa_ids: empresaIds, ehSupervisor })
      .then(r => { setAps(r.aps as ApPendente[]); setNotas(r.notas as NotaPendente[]); setApsLote((r.apsLote ?? []) as ApLotePendente[]); setLotes((r.lotes ?? []) as LoteInfo[]) })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar aprovações.'))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, [empresaIds.join(','), ehSupervisor])
  useEffect(() => { setLoteAbertoId(null) }, [empresaIds.join(',')])
  // NOVO: se o lote que está aberto ficar sem nenhum item pendente
  // (ex: acabou de aprovar o último dele), volta pra lista sozinho —
  // sem isso, ficava numa tela em branco (o lote "sumia" mas
  // continuava "aberto").
  useEffect(() => {
    if (loteAbertoId !== null && !aps.some(a => a.lote_id === loteAbertoId) && !notas.some(n => n.lote_id === loteAbertoId)) {
      setLoteAbertoId(null)
    }
  }, [aps, notas, loteAbertoId])

  async function handleVer(caminho: string | null, chave: string) {
    if (!caminho) { alert('Esse documento ainda não foi impresso no computador — peça pra gerar o PDF por lá antes de visualizar aqui.'); return }
    setAbrindo(chave)
    try {
      const url = await apiWeb.aprovacoes.urlDocumento(caminho)
      window.open(url, '_blank')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao abrir o documento.')
    } finally {
      setAbrindo(null)
    }
  }

  async function handleAprovarAp(id: number) {
    setProcessando(id)
    try {
      await apiWeb.aprovacoes.aprovarAp(id)
      setAps(lista => lista.filter(a => a.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao aprovar.')
    } finally {
      setProcessando(null)
    }
  }

  async function handleAprovarNota(id: number) {
    setProcessando(id)
    try {
      await apiWeb.aprovacoes.aprovarNota(id)
      setNotas(lista => lista.filter(n => n.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao aprovar.')
    } finally {
      setProcessando(null)
    }
  }

  async function handleAprovarApLote(id: number) {
    setProcessando(id)
    try {
      await apiWeb.aprovacoes.aprovarApLote(id)
      setApsLote(lista => lista.filter(a => a.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao aprovar.')
    } finally {
      setProcessando(null)
    }
  }

  // NOVO: filtra por data de EMISSÃO (fallback pra created_at se não
  // tiver — igual o desktop já faz) — só aplica quando a data está
  // preenchida, senão mostra tudo (comportamento padrão).
  const apsFiltradas = aps.filter(a => {
    const data = (a.data_emissao ?? a.created_at).slice(0, 10)
    return (!dataInicio || data >= dataInicio) && (!dataFim || data <= dataFim)
  })
  const notasFiltradas = notas.filter(n => {
    const data = n.data.slice(0, 10)
    return (!dataInicio || data >= dataInicio) && (!dataFim || data <= dataFim)
  })
  // NOVO: Pagamento em Lote não participa do agrupamento por lote
  // financeiro (é aprovação própria) — sempre lista solta, filtrada
  // pelo mesmo período.
  const apsLoteFiltradas = apsLote.filter(a => {
    const data = a.data_emissao.slice(0, 10)
    return (!dataInicio || data >= dataInicio) && (!dataFim || data <= dataFim)
  })
  const total = apsFiltradas.length + notasFiltradas.length + apsLoteFiltradas.length

  // NOVO: pro Supervisor, agrupa por LOTE — igual o programa (que
  // sempre organiza AP/Nota dentro do lote em que foram enviadas
  // pelo ADM), em vez de tudo solto numa lista só.
  const gruposPorLote = ehSupervisor ? (() => {
    const mapa = new Map<number, { titulo: string; aps: ApPendente[]; notas: NotaPendente[] }>()
    for (const a of apsFiltradas) {
      if (a.lote_id === null) continue
      const titulo = lotes.find(l => l.id === a.lote_id)?.titulo ?? `Lote #${a.lote_id}`
      const grupo = mapa.get(a.lote_id) ?? { titulo, aps: [], notas: [] }
      grupo.aps.push(a)
      mapa.set(a.lote_id, grupo)
    }
    for (const n of notasFiltradas) {
      if (n.lote_id === null) continue
      const titulo = lotes.find(l => l.id === n.lote_id)?.titulo ?? `Lote #${n.lote_id}`
      const grupo = mapa.get(n.lote_id) ?? { titulo, aps: [], notas: [] }
      grupo.notas.push(n)
      mapa.set(n.lote_id, grupo)
    }
    return Array.from(mapa.entries())
      .map(([id, g]) => ({ id, ...g }))
      .sort((x, y) => y.titulo.localeCompare(x.titulo))
  })() : null

  function renderApCard(a: ApPendente) {
    return (
      <div key={`ap-${a.id}`} className="bg-surface border border-surface-border rounded-2xl px-4 py-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-400 bg-brand-500/15 px-2 py-0.5 rounded">AP</span>
          <span className="text-[11px] text-gray-500">{formatData(a.data_emissao ?? a.created_at)}</span>
        </div>
        <p className="text-sm font-semibold text-gray-100 m-0 mb-0.5">{a.beneficiario_nome}</p>
        {a.descricao && <p className="text-xs text-gray-500 m-0 mb-1.5 truncate">{a.descricao}</p>}
        <p className="font-mono text-lg font-extrabold text-white mb-2.5">{formatMoeda(a.valor)}</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleVer(a.pdf_path, `ap-${a.id}`)}
            disabled={abrindo === `ap-${a.id}`}
            className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {abrindo === `ap-${a.id}` ? 'Abrindo…' : '📄 Ver documento'}
          </button>
          <button
            onClick={() => handleAprovarAp(a.id)}
            disabled={processando === a.id}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {processando === a.id ? 'Aprovando…' : '✓ Aprovar'}
          </button>
        </div>
      </div>
    )
  }

  function renderApLoteCard(a: ApLotePendente) {
    return (
      <div key={`aplote-${a.id}`} className="bg-surface border border-purple-500/30 rounded-2xl px-4 py-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded">AP EM LOTE</span>
          <span className="text-[11px] text-gray-500">{formatData(a.data_emissao)}</span>
        </div>
        <p className="text-sm font-semibold text-gray-100 m-0 mb-0.5">{a.titulo || a.descricao || 'Autorização de Pagamento em Lote'}</p>
        <p className="text-xs text-gray-500 m-0 mb-1.5">{a.quantidade_itens} beneficiário{a.quantidade_itens !== 1 && 's'}</p>
        <p className="font-mono text-lg font-extrabold text-white mb-2.5">{formatMoeda(a.valor_total)}</p>
        <div className="flex gap-2">
          <button
            onClick={() => handleVer(a.pdf_path, `aplote-${a.id}`)}
            disabled={abrindo === `aplote-${a.id}`}
            className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {abrindo === `aplote-${a.id}` ? 'Abrindo…' : '📄 Ver documento'}
          </button>
          <button
            onClick={() => handleAprovarApLote(a.id)}
            disabled={processando === a.id}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {processando === a.id ? 'Aprovando…' : '✓ Aprovar'}
          </button>
        </div>
      </div>
    )
  }

  function renderNotaCard(n: NotaPendente) {
    return (
      <div key={`nf-${n.id}`} className="bg-surface border border-surface-border rounded-2xl px-4 py-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">NOTA FISCAL</span>
          <span className="text-[11px] text-gray-500">{formatData(n.data)}</span>
        </div>
        <p className="text-sm font-semibold text-gray-100 m-0 mb-0.5">{n.fornecedor_nome}</p>
        <p className="text-xs text-gray-500 m-0 mb-2.5">NF {n.numero_nf ?? '—'}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleVer(n.nota_pdf_path, `nf-${n.id}-nota`)}
            disabled={abrindo === `nf-${n.id}-nota`}
            className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {abrindo === `nf-${n.id}-nota` ? 'Abrindo…' : '📄 Ver nota'}
          </button>
          {n.boletos_pdf_path && (
            <button
              onClick={() => handleVer(n.boletos_pdf_path, `nf-${n.id}-boleto`)}
              disabled={abrindo === `nf-${n.id}-boleto`}
              className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
            >
              {abrindo === `nf-${n.id}-boleto` ? 'Abrindo…' : '🧾 Ver boleto'}
            </button>
          )}
          <button
            onClick={() => handleAprovarNota(n.id)}
            disabled={processando === n.id}
            className="w-full bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {processando === n.id ? 'Aprovando…' : '✓ Aprovar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
        <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Aprovações</h1>
        <p className="text-[12.5px] text-gray-500 mt-0.5 mb-3">{total} pendente{total !== 1 && 's'} da sua aprovação</p>

        {/* NOVO: filtro por período (data de emissão do documento) */}
        <div className="flex items-center gap-2 bg-surface border border-surface-border rounded-xl px-2.5 py-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0">Período</span>
          <input
            type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
            className="flex-1 min-w-0 bg-surface-hover border border-surface-border rounded-lg text-gray-100 text-[13px] px-2 py-1"
          />
          <span className="text-gray-500 text-xs">até</span>
          <input
            type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
            className="flex-1 min-w-0 bg-surface-hover border border-surface-border rounded-lg text-gray-100 text-[13px] px-2 py-1"
          />
        </div>
      </header>

      <main className="px-4 pt-3 max-w-[480px] mx-auto">
        {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 mb-3">{erro}</p>}

        {carregando ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface border border-surface-border animate-pulse" />)}
          </div>
        ) : gruposPorLote ? (
          gruposPorLote.length === 0 && apsLoteFiltradas.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-16">
              {aps.length + notas.length + apsLote.length === 0 ? 'Nada pendente da sua aprovação agora. 🎉' : 'Nada pendente nesse período.'}
            </p>
          ) : loteAbertoId === null ? (
            // NOVO: lista de lotes primeiro, igual o programa (ADM) —
            // clica num lote pra só então ver as APs/Notas dele.
            // Autorização de Pagamento em Lote fica sempre solta aqui
            // em cima (não participa do agrupamento por lote
            // financeiro).
            <div className="space-y-2">
              {apsLoteFiltradas.map(renderApLoteCard)}
              {gruposPorLote.map(grupo => (
                <button
                  key={grupo.id}
                  onClick={() => setLoteAbertoId(grupo.id)}
                  className="w-full flex items-center justify-between bg-surface border border-surface-border rounded-2xl px-4 py-3.5 hover:border-brand-500/50 transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-100 m-0 truncate">📦 {grupo.titulo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{grupo.aps.length + grupo.notas.length} item{grupo.aps.length + grupo.notas.length !== 1 && 's'} pendente{grupo.aps.length + grupo.notas.length !== 1 && 's'}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded shrink-0 ml-2">Pendente</span>
                </button>
              ))}
            </div>
          ) : (
            // Detalhe do lote clicado
            (() => {
              const grupo = gruposPorLote.find(g => g.id === loteAbertoId)
              if (!grupo) return null
              return (
                <div>
                  <button
                    onClick={() => setLoteAbertoId(null)}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 mb-3 transition-colors"
                  >
                    ← Voltar aos lotes
                  </button>
                  <p className="text-sm font-bold text-gray-200 mb-3">📦 {grupo.titulo}</p>
                  <div className="space-y-2.5">
                    {grupo.aps.map(renderApCard)}
                    {grupo.notas.map(renderNotaCard)}
                  </div>
                </div>
              )
            })()
          )
        ) : total === 0 ? (
          <p className="text-center text-sm text-gray-500 py-16">
            {aps.length + notas.length + apsLote.length === 0 ? 'Nada pendente da sua aprovação agora. 🎉' : 'Nada pendente nesse período.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {apsLoteFiltradas.map(renderApLoteCard)}
            {apsFiltradas.map(renderApCard)}
            {notasFiltradas.map(renderNotaCard)}
          </div>
        )}
      </main>
    </div>
  )
}
