import { useEffect, useState, useMemo } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import PageHeader          from '@components/layout/PageHeader'
import {
  construirArvoreComExecucao, percentualGeralObra, percentualPrevistoNaData,
  type EapItemBanco,
} from '@utils/obraEapCalculo'
import { TrendingUp, FolderTree } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

interface AtividadeComData {
  data: string
  eap_item_id: number
  percentual_incremento: number
}

function formatDataBR(iso: string): string {
  return iso.split('-').reverse().join('/')
}

// NOVO: Painel de Acompanhamento — percentual físico geral da obra,
// avanço por Fase, e a Curva S (previsto x realizado) ao longo do
// tempo. O "previsto" só existe pros itens que já têm data de início
// e fim planejadas cadastradas na EAP — itens sem essas datas não
// entram nessa conta (mas continuam contando no "realizado" normal).
// ALTERADO: aceita empresaId por fora agora — o Supervisor usa esse
// mesmo componente embutido no painel dele (PainelSupervisor.tsx),
// mostrando a obra que ele está vendo naquele momento, não a "obra
// ativa" do store global (que só existe pro ADM/Gestor).
interface Props {
  empresaId?:        number
  mostrarCabecalho?: boolean
}
export default function PainelObra({ empresaId: empresaIdProp, mostrarCabecalho = true }: Props = {}) {
  const empresaIdStore = useEmpresaStore(s => s.empresaId)
  const empresaId = empresaIdProp ?? empresaIdStore

  const [itens, setItens] = useState<EapItemBanco[]>([])
  const [acumulados, setAcumulados] = useState<Record<number, number>>({})
  const [atividades, setAtividades] = useState<AtividadeComData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId) return
    setLoading(true)
    Promise.all([
      window.api.obraEap.listar(empresaId),
      window.api.obraDiario.percentuaisAcumulados(empresaId),
      window.api.obraDiario.todasAtividades(empresaId),
    ]).then(([itensCarregados, acumuladosCarregados, atividadesCarregadas]) => {
      setItens(itensCarregados)
      setAcumulados(acumuladosCarregados)
      setAtividades(atividadesCarregadas)
    }).finally(() => setLoading(false))
  }, [empresaId])

  const arvore = useMemo(() => construirArvoreComExecucao(itens, acumulados), [itens, acumulados])
  const percentualGeral = useMemo(() => percentualGeralObra(arvore), [arvore])
  const valorTotalObra = useMemo(() => arvore.reduce((s, f) => s + f.valor_orcado, 0), [arvore])

  // Itens-folha (sem filho) — únicos que entram nas contas de peso,
  // tanto do previsto quanto do realizado.
  const itensFolha = useMemo(() => {
    const temFilho = new Set(itens.filter(i => i.parent_id !== null).map(i => i.parent_id!))
    return itens.filter(i => !temFilho.has(i.id))
  }, [itens])

  const quantidadeComPlanejamento = useMemo(
    () => itensFolha.filter(i => i.data_inicio_prevista && i.data_fim_prevista).length,
    [itensFolha]
  )

  // Curva S — pontos semanais entre a data mais antiga e mais nova
  // envolvidas (tanto do planejamento quanto dos lançamentos reais),
  // com as duas linhas (previsto/realizado) calculadas na MESMA data,
  // pra dar pra comparar de verdade.
  const curva = useMemo(() => {
    if (valorTotalObra === 0) return []

    const datasRelevantes: Date[] = []
    for (const item of itensFolha) {
      if (item.data_inicio_prevista) datasRelevantes.push(new Date(`${item.data_inicio_prevista}T00:00:00`))
      if (item.data_fim_prevista) datasRelevantes.push(new Date(`${item.data_fim_prevista}T00:00:00`))
    }
    for (const a of atividades) datasRelevantes.push(new Date(`${a.data}T00:00:00`))
    if (datasRelevantes.length === 0) return []

    const dataMin = new Date(Math.min(...datasRelevantes.map(d => d.getTime())))
    const dataMaxCalculada = new Date(Math.max(...datasRelevantes.map(d => d.getTime())))
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const dataMax = dataMaxCalculada > hoje ? dataMaxCalculada : hoje

    const atividadesOrdenadas = [...atividades].sort((a, b) => a.data.localeCompare(b.data))
    const valorPorItem = new Map(itens.map(i => [i.id, i.valor_orcado]))

    function realizadoAteData(dataAlvo: Date): number {
      let soma = 0
      for (const a of atividadesOrdenadas) {
        if (new Date(`${a.data}T00:00:00`) > dataAlvo) break
        soma += (a.percentual_incremento * (valorPorItem.get(a.eap_item_id) ?? 0)) / valorTotalObra
      }
      return Math.min(100, soma)
    }

    const pontos: { data: string; previsto: number | null; realizado: number }[] = []
    const cursor = new Date(dataMin)
    // Pontos semanais + garante que a data de hoje/última entra no gráfico
    while (cursor <= dataMax) {
      pontos.push({
        data: formatDataBR(cursor.toISOString().slice(0, 10)),
        previsto: quantidadeComPlanejamento > 0 ? Number(percentualPrevistoNaData(itensFolha, valorTotalObra, cursor).toFixed(1)) : null,
        realizado: Number(realizadoAteData(cursor).toFixed(1)),
      })
      cursor.setDate(cursor.getDate() + 7)
    }
    // último ponto exatamente em dataMax, pra não cortar a curva no meio da semana
    pontos.push({
      data: formatDataBR(dataMax.toISOString().slice(0, 10)),
      previsto: quantidadeComPlanejamento > 0 ? Number(percentualPrevistoNaData(itensFolha, valorTotalObra, dataMax).toFixed(1)) : null,
      realizado: Number(realizadoAteData(dataMax).toFixed(1)),
    })
    return pontos
  }, [atividades, itens, itensFolha, valorTotalObra, quantidadeComPlanejamento])

  return (
    <div>
      {mostrarCabecalho && (
        <PageHeader title="Painel de Acompanhamento" subtitle="Avanço físico da obra, por Fase e ao longo do tempo" />
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 shimmer rounded-xl" />)}
        </div>
      ) : itens.length === 0 ? (
        <div className="py-16 text-center bg-surface border border-surface-border rounded-xl">
          <FolderTree size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">Essa obra ainda não tem uma Estrutura (EAP) cadastrada.</p>
        </div>
      ) : (
        <>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-5 mb-6 text-center">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Avanço físico geral da obra</p>
            <p className="text-4xl font-bold text-emerald-400">{percentualGeral.toFixed(1)}%</p>
          </div>

          <p className="text-sm font-semibold text-gray-200 mb-3">Avanço por Fase</p>
          <div className="bg-surface border border-surface-border rounded-xl p-5 mb-6 space-y-4">
            {arvore.map(fase => (
              <div key={fase.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-gray-200">{fase.nome}</p>
                  <p className="text-sm font-mono text-emerald-400">{fase.percentualExecutado.toFixed(1)}%</p>
                </div>
                <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, fase.percentualExecutado)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-brand-400" />
            <p className="text-sm font-semibold text-gray-200">Curva S — Previsto x Realizado</p>
          </div>
          <div className="bg-surface border border-surface-border rounded-xl p-5">
            {curva.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Nenhum lançamento no Diário de Obra nem data planejada na EAP ainda.</p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={curva} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#8996ac' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#8996ac' }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: '#1a2332', border: '1px solid #2a3441', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => (v === null ? ['—', ''] : [`${v}%`, ''])}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="previsto" name="Previsto" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                    <Line type="monotone" dataKey="realizado" name="Realizado" stroke="#22c55e" strokeWidth={2} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {quantidadeComPlanejamento === 0 ? (
              <p className="text-[11px] text-amber-500 mt-3">
                ⚠ Nenhum item da EAP tem data planejada ainda — mostrando só o Realizado. Cadastre início/fim previstos nos itens (Estrutura da Obra) pra ver o Previsto também.
              </p>
            ) : quantidadeComPlanejamento < itensFolha.length ? (
              <p className="text-[11px] text-gray-500 mt-3">
                {quantidadeComPlanejamento} de {itensFolha.length} itens têm data planejada — o Previsto considera só esses.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
