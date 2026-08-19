import { useEffect, useState } from 'react'
import { apiWeb } from '../api-web'
import { usePeriodoPersistido } from './usePeriodoPersistido'

interface Props {
  // ALTERADO: antes só existia um "empresaIds" — agora são dois
  // conjuntos, porque "Sua Gestão" (quantas obras/colaboradores no
  // total) deve mostrar SEMPRE o total de tudo que a pessoa
  // administra, enquanto Turnover/Despesas/gráfico devem seguir só a
  // obra que está selecionada no momento (pro Supervisor, que não
  // troca de obra, os dois conjuntos são sempre os mesmos).
  empresaIdsAgregado:    number[]
  empresaIdsSelecionado: number[]
  nomeObra:   string
  // NOVO: só usado pra decidir se mostra o resumo de RH específico
  // da obra (ver ResumoObraSupervisor abaixo) — só faz sentido pro
  // Supervisor quando ele está numa obra específica, igual o
  // programa já mostra (Painel do Supervisor → obra individual).
  ehSupervisor: boolean
}

interface ResumoRHObra {
  totalAtivos: number
  custoFolha: number
  mediaIdade: number | null
  aniversariantes: { nome: string; funcao: string | null; nascimento: string }[]
  porStatus: { status: string; quantidade: number }[]
}

interface ResumoAgregado {
  obras: { id: number; nome: string }[]
  totalColaboradores: number
  idadeMedia: number | null
}

interface ResumoSelecionado {
  admissoes: number
  desligamentos: number
  totalAutorizacoes: number
  totalNotasFiscais: number
}

interface PontoMes { mes: string; admissoes: number; desligamentos: number }

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function nomeMesCurto(mes: string) {
  const [ano, m] = mes.split('-')
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[Number(m) - 1]}/${ano.slice(2)}`
}

// Gráfico de barras simples (admissões x desligamentos), no mesmo
// espírito visual do protótipo aprovado — SVG desenhado à mão, sem
// depender de uma biblioteca de gráficos.
function GraficoAdmissoesDesligamentos({ pontos }: { pontos: PontoMes[] }) {
  const maiorValor = Math.max(1, ...pontos.flatMap(p => [p.admissoes, p.desligamentos]))
  const largura = 300, altura = 130, baseY = altura - 18
  const larguraGrupo = largura / pontos.length
  const larguraBarra = Math.min(16, larguraGrupo / 3.2)

  return (
    <svg viewBox={`0 0 ${largura} ${altura + 16}`} className="w-full h-auto overflow-visible">
      {pontos.map((p, i) => {
        const cx = larguraGrupo * i + larguraGrupo / 2
        const alturaAdmissoes = (p.admissoes / maiorValor) * (baseY - 10)
        const alturaDesligamentos = (p.desligamentos / maiorValor) * (baseY - 10)
        return (
          <g key={p.mes}>
            <rect x={cx - larguraBarra - 2} y={baseY - alturaAdmissoes} width={larguraBarra} height={alturaAdmissoes} rx={3} fill="#22c55e" />
            <rect x={cx + 2} y={baseY - alturaDesligamentos} width={larguraBarra} height={alturaDesligamentos} rx={3} fill="#ef4444" />
            <text x={cx} y={altura + 12} textAnchor="middle" fontSize="9" fill="#8996ac">{nomeMesCurto(p.mes)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function MobilePainel({ empresaIdsAgregado, empresaIdsSelecionado, nomeObra, ehSupervisor }: Props) {
  const hoje = new Date()
  // ALTERADO: padrão agora é o MÊS ATUAL inteiro (ex: 01/08 até
  // 31/08) — antes era "01/01 até hoje", período bem maior que o
  // esperado ao logar pela primeira vez.
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fimMes     = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  // ALTERADO: agora lembra a última data escolhida, mesmo depois de
  // atualizar a página — antes sempre voltava pro padrão de novo.
  const { dataInicio, setDataInicio, dataFim, setDataFim } = usePeriodoPersistido(
    'mobile-painel-periodo',
    inicioMes.toISOString().slice(0, 10),
    fimMes.toISOString().slice(0, 10)
  )

  const [agregado, setAgregado]     = useState<ResumoAgregado | null>(null)
  const [selecionado, setSelecionado] = useState<ResumoSelecionado | null>(null)
  const [totalFolhas, setTotalFolhas] = useState(0)
  const [grafico, setGrafico]       = useState<PontoMes[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // NOVO: resumo de RH da obra específica (Colaboradores ativos,
  // Custo de Salários, Média de idade, Aniversariantes do mês) —
  // igual o Supervisor já vê no programa ao entrar numa obra. Só faz
  // sentido quando ele está numa obra ESPECÍFICA (não em "todas as
  // obras" nem num Estado inteiro) — por isso confere ehSupervisor +
  // exatamente 1 obra selecionada.
  const [resumoObra, setResumoObra] = useState<ResumoRHObra | null>(null)
  const obraUnicaId = ehSupervisor && empresaIdsSelecionado.length === 1 ? empresaIdsSelecionado[0] : null
  // NOVO: popup do card "Custo de Salários" — o texto completo (mais
  // de uma informação) não cabia direito dentro do card pequeno.
  const [popupCustoAberto, setPopupCustoAberto] = useState(false)

  useEffect(() => {
    if (!obraUnicaId) { setResumoObra(null); return }
    apiWeb.colaboradores.resumoRH({ empresa_id: obraUnicaId, dataInicio, dataFim })
      .then(setResumoObra).catch(() => setResumoObra(null))
  }, [obraUnicaId, dataInicio, dataFim])

  // Os dois conjuntos de obra costumam ser diferentes só pro Gestor
  // com mais de uma obra — evita repetir a MESMA busca duas vezes
  // quando já são as mesmas obras (Supervisor, ou Gestor de 1 obra
  // só).
  const mesmoConjunto = empresaIdsAgregado.join(',') === empresaIdsSelecionado.join(',')

  useEffect(() => {
    if (empresaIdsAgregado.length === 0) { setCarregando(false); return }
    setCarregando(true)
    setErro(null)
    Promise.all([
      apiWeb.supervisor.painelInicio({ empresa_ids: empresaIdsAgregado, dataInicio, dataFim }),
      mesmoConjunto
        ? null
        : apiWeb.supervisor.painelInicio({ empresa_ids: empresaIdsSelecionado, dataInicio, dataFim }),
      apiWeb.supervisor.graficosObras({ empresa_ids: empresaIdsSelecionado, meses: 6 }),
      // NOVO: total das folhas de pagamento salvas dentro do período,
      // só da obra selecionada — entra na Despesa Compras Acumulada.
      apiWeb.folhaPagamento.totalPorPeriodo({ empresa_ids: empresaIdsSelecionado, dataInicio, dataFim }),
    ])
      .then(([rAgregado, rSelecionado, g, folhas]) => {
        setAgregado(rAgregado)
        setSelecionado(rSelecionado ?? rAgregado)
        setGrafico(g.admissoesDesligamentos)
        setTotalFolhas(folhas)
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar o painel.'))
      .finally(() => setCarregando(false))
  }, [empresaIdsAgregado.join(','), empresaIdsSelecionado.join(','), dataInicio, dataFim])

  const totalAdmissoes = grafico.reduce((s, p) => s + p.admissoes, 0)
  const totalDesligamentos = grafico.reduce((s, p) => s + p.desligamentos, 0)

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
        <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Painel de Resumo</h1>
        <p className="text-[12.5px] text-gray-500 mt-0.5 mb-3">{nomeObra}</p>

        <div className="flex items-center gap-2 bg-surface border border-surface-border rounded-xl px-2.5 py-2">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide shrink-0">Período</span>
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

      <main className="px-4 pt-4 max-w-[480px] mx-auto">
        {erro && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 mb-3">{erro}</p>
        )}

        {carregando ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface border border-surface-border animate-pulse" />)}
          </div>
        ) : agregado && selecionado && (
          <>
            {/* NOVO: resumo de RH da obra específica — igual o
                Supervisor já vê no programa (Painel do Supervisor →
                obra individual), aparece ANTES do resto, só quando
                ele está numa obra específica (não em "todas as
                obras" nem num Estado inteiro). */}
            {resumoObra && (
              <>
                <h2 className="text-[11.5px] font-extrabold uppercase tracking-wide text-gray-500 mx-1 mb-2.5">Resumo da Obra</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Colaboradores ativos</p>
                    <p className="text-lg font-extrabold text-white leading-tight break-words">{resumoObra.totalAtivos}</p>
                    {/* NOVO: mesmo sub-texto que o card do ADM já tem */}
                    <p className="text-[10px] text-gray-500 mt-1 truncate">
                      {(() => {
                        const afastados = resumoObra.porStatus.find(s => s.status === 'afastado')?.quantidade ?? 0
                        const emFerias   = resumoObra.porStatus.find(s => s.status === 'ferias')?.quantidade ?? 0
                        return afastados || emFerias
                          ? `${afastados} afastado(s) · ${emFerias} em férias`
                          : 'Nenhum afastamento'
                      })()}
                    </p>
                  </div>
                  <button
                    onClick={() => setPopupCustoAberto(true)}
                    className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 text-left hover:brightness-110 transition-[filter]"
                  >
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Custo de Salários</p>
                    <p className="text-lg font-extrabold text-emerald-400 leading-tight truncate">{formatMoeda(resumoObra.custoFolha)}</p>
                    <p className="text-[10px] text-gray-500 mt-1">Toque para ver detalhes</p>
                  </button>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Média de idade</p>
                    <p className="text-lg font-extrabold text-amber-400 leading-tight break-words">{resumoObra.mediaIdade ? `${resumoObra.mediaIdade} anos` : '—'}</p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3.5">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Aniversariantes do mês</p>
                    <p className="text-lg font-extrabold text-white leading-tight break-words">{resumoObra.aniversariantes.length}</p>
                  </div>
                </div>
                {resumoObra.aniversariantes.length > 0 && (
                  <div className="bg-surface border border-surface-border rounded-2xl px-4 py-3 mb-4">
                    <p className="text-[11px] font-bold text-purple-300 uppercase tracking-wide mb-2">Aniversariantes</p>
                    <div className="space-y-1">
                      {resumoObra.aniversariantes.map(a => (
                        <p key={a.nome} className="text-xs text-gray-300 m-0">
                          <span className="text-purple-300 font-bold">{a.nascimento.slice(8, 10)}</span> — {a.nome}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Caixa 1 — Sua Gestão (sempre o total de tudo que administra) */}
            <div className="relative bg-surface border border-surface-border rounded-[18px] p-[18px] mb-3 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-green-500" />
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center bg-green-500/15 text-[15px]">👥</div>
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-gray-300">Sua Gestão</span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="m-0 mb-1 text-[13.5px] text-gray-300"><b className="text-white font-bold">{agregado.obras.length}</b> obra{agregado.obras.length !== 1 && 's'}</p>
                  <p className="m-0 text-[13.5px] text-gray-300"><b className="text-white font-bold">{agregado.totalColaboradores}</b> colaboradores</p>
                </div>
                {agregado.idadeMedia !== null && (
                  <div className="text-right">
                    <div className="font-mono text-[34px] font-extrabold leading-none">{agregado.idadeMedia}</div>
                    <div className="text-[9.5px] text-gray-500 uppercase tracking-wide mt-1">idade média</div>
                  </div>
                )}
              </div>
            </div>

            {/* Caixa 2 — Turnover (segue a obra selecionada) */}
            <div className="relative bg-surface border border-surface-border rounded-[18px] p-[18px] mb-3 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-brand-500" />
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center bg-brand-500/15 text-[15px]">🔁</div>
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-gray-300">Turnover</span>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="m-0 mb-1 text-[13.5px] text-gray-300"><b className="text-white font-bold">{selecionado.admissoes}</b> admissões</p>
                  <p className="m-0 text-[13.5px] text-gray-300"><b className="text-white font-bold">{selecionado.desligamentos}</b> desligamentos</p>
                </div>
                <div className="font-mono text-[28px] font-extrabold text-brand-400">
                  {selecionado.desligamentos > 0 && agregado.totalColaboradores > 0
                    ? `${Math.round((selecionado.desligamentos / agregado.totalColaboradores) * 100)}%`
                    : '—'}
                </div>
              </div>
            </div>

            {/* Caixa 3 — Despesa Compras Acumulada (segue a obra
                selecionada) — agora inclui a Folha de Pagamento salva
                dentro do período, não só AP/Nota Fiscal. */}
            <div className="relative bg-surface border border-surface-border rounded-[18px] p-[18px] mb-4 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center bg-amber-500/15 text-[15px]">💰</div>
                <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-gray-300">Despesa no Período</span>
              </div>
              <p className="text-xs text-gray-400 m-0 mb-0.5">Autorizações: <b className="text-gray-200 font-semibold">{formatMoeda(selecionado.totalAutorizacoes)}</b></p>
              <p className="text-xs text-gray-400 m-0 mb-0.5">Notas Fiscais: <b className="text-gray-200 font-semibold">{formatMoeda(selecionado.totalNotasFiscais)}</b></p>
              <p className="text-xs text-gray-400 m-0">Folha de Pagamento: <b className="text-gray-200 font-semibold">{formatMoeda(totalFolhas)}</b></p>
              <p className="font-mono text-2xl font-extrabold text-amber-400 mt-1.5">
                {formatMoeda(selecionado.totalAutorizacoes + selecionado.totalNotasFiscais + totalFolhas)}
              </p>
            </div>

            <h2 className="text-[11.5px] font-extrabold uppercase tracking-wide text-gray-500 mx-1 mb-2.5 mt-2">Visão geral — últimos 6 meses</h2>

            <div className="bg-surface border border-surface-border rounded-2xl p-3.5 mb-3">
              <div className="flex items-center gap-1.5 mb-2 text-[11.5px] font-extrabold uppercase tracking-wide text-gray-300">
                ✅ Admissões e Desligamentos
              </div>
              <div className="flex gap-3 mb-2">
                <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Admissões</span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Desligamentos</span>
              </div>
              <GraficoAdmissoesDesligamentos pontos={grafico} />
              <div className="flex gap-2 mt-2.5">
                <div className="flex-1 bg-surface-hover rounded-[10px] px-2.5 py-2">
                  <p className="m-0 mb-0.5 text-[9.5px] text-gray-500">Total Admissões</p>
                  <b className="font-mono text-base font-extrabold text-white">{totalAdmissoes}</b>
                </div>
                <div className="flex-1 bg-surface-hover rounded-[10px] px-2.5 py-2">
                  <p className="m-0 mb-0.5 text-[9.5px] text-gray-500">Total Desligamentos</p>
                  <b className="font-mono text-base font-extrabold text-white">{totalDesligamentos}</b>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* NOVO: popup do "Custo de Salários" — informação completa,
          sem precisar espremer tudo dentro do card pequeno. */}
      {popupCustoAberto && resumoObra && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
          onClick={() => setPopupCustoAberto(false)}
        >
          <div
            className="bg-surface border border-surface-border rounded-2xl p-5 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-gray-100 mb-3">💰 Custo de Salários</p>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Salários — colaboradores ativos</p>
                <p className="font-mono text-xl font-extrabold text-emerald-400">{formatMoeda(resumoObra.custoFolha)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Folha de Pagamento no período</p>
                <p className="font-mono text-xl font-extrabold text-emerald-400">{formatMoeda(totalFolhas)}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{dataInicio.split('-').reverse().join('/')} até {dataFim.split('-').reverse().join('/')}</p>
              </div>
            </div>
            <button
              onClick={() => setPopupCustoAberto(false)}
              className="w-full bg-surface-hover border border-surface-border text-gray-200 text-sm font-bold rounded-xl py-2.5 mt-5"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
