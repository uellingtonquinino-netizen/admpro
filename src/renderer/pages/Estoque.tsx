import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import Button                from '@components/ui/Button'
import FiltroPeriodo         from '@components/ui/FiltroPeriodo'
import { SkeletonTable }     from '@components/ui/Skeleton'
import EmptyState            from '@components/ui/EmptyState'
import MovimentacaoModal     from '@components/almoxarifado/MovimentacaoModal'
import RelatorioModal        from '@components/almoxarifado/RelatorioModal'
import { formatDate }        from '@utils/format'
import { FileText, ArrowLeftRight, Boxes } from 'lucide-react'

interface ProdutoMovimento {
  id:             number
  codigo:         string
  nome:           string
  descricao:      string | null
  unidade:        string | null
  estoque_atual:  number
  ultima_entrada: string | null
  ultima_saida:   string | null
}

// NOVO: página Estoque — lista os produtos com a última entrada,
// última saída e o saldo atual, com filtro de período e relatórios.
export default function Estoque() {
  const empresaId = useEmpresaStore(s => s.empresaId)

  const [itens, setItens]       = useState<ProdutoMovimento[]>([])
  const [loading, setLoading]   = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]       = useState('')
  const [movimentando, setMovimentando] = useState<ProdutoMovimento | null>(null)
  const [relatorioOpen, setRelatorioOpen] = useState(false)

  const carregar = useCallback((inicio = dataInicio, fim = dataFim) => {
    if (!empresaId) return
    setLoading(true)
    window.api.produtos.listarComMovimentacao({
      empresa_id: empresaId,
      dataInicio: inicio || undefined,
      dataFim:    fim || undefined,
    })
      .then(setItens)
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Estoque</h1>
          <p className="text-sm text-gray-400 mt-0.5">Última movimentação e saldo por material/ferramenta</p>
        </div>
        <Button variant="outline" icon={<FileText size={15} />} onClick={() => setRelatorioOpen(true)}>
          Gerar Relatório
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onBuscar={(inicio, fim) => { setDataInicio(inicio); setDataFim(fim); carregar(inicio, fim) }}
        />
        {(dataInicio || dataFim) && (
          <Button variant="ghost" size="sm" onClick={() => { setDataInicio(''); setDataFim(''); carregar('', '') }}>
            Limpar período
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : itens.length === 0 ? (
        <EmptyState icon={Boxes} title="Nenhum material/ferramenta cadastrado" description="Cadastre materiais e ferramentas no Painel Inicial do Almoxarifado." />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Código', 'Descrição', 'Última entrada', 'Última saída', 'Saldo atual', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map(p => (
                <tr key={p.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-400">{p.codigo}</td>
                  <td className="px-4 py-3 text-gray-200">{p.descricao || p.nome}</td>
                  <td className="px-4 py-3 text-emerald-400">{p.ultima_entrada ? formatDate(p.ultima_entrada) : '—'}</td>
                  <td className="px-4 py-3 text-red-400">{p.ultima_saida ? formatDate(p.ultima_saida) : '—'}</td>
                  <td className="px-4 py-3 text-gray-200 font-medium">{p.estoque_atual}{p.unidade ? ` ${p.unidade}` : ''}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setMovimentando(p)}
                      title="Ver movimentação"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                    >
                      <ArrowLeftRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movimentando && (
        <MovimentacaoModal produto={movimentando} onClose={() => setMovimentando(null)} />
      )}

      {relatorioOpen && (
        <RelatorioModal onClose={() => setRelatorioOpen(false)} />
      )}
    </div>
  )
}
