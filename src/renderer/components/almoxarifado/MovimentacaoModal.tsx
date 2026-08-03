import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import Badge                  from '@components/ui/Badge'
import FiltroPeriodo          from '@components/ui/FiltroPeriodo'
import { formatDate }         from '@utils/format'
import { gerarRelatorioMovimentacao } from '../../documentos/relatoriosAlmoxarifado'
import { FileText } from 'lucide-react'

interface Produto { id: number; codigo: string; nome: string }

interface Movimento {
  tipo: 'entrada' | 'saida'
  data: string
  quantidade: number
  pessoa: string | null
  referencia: string | null
}

interface Props {
  produto: Produto
  onClose: () => void
}

// NOVO: mostra o histórico de entradas e saídas de um produto — acessível
// tanto pela lista do Estoque quanto pelo relatório de movimentação.
export default function MovimentacaoModal({ produto, onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [loading, setLoading]       = useState(true)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]       = useState('')
  const [gerando, setGerando]       = useState(false)

  function carregar(inicio = dataInicio, fim = dataFim) {
    setLoading(true)
    window.api.produtos.movimentacao({
      produto_id: produto.id,
      dataInicio: inicio || undefined,
      dataFim:    fim || undefined,
    }).then(setMovimentos).finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  async function handleGerarRelatorio() {
    if (!empresa) return
    setGerando(true)
    try {
      const html = gerarRelatorioMovimentacao(empresa, produto, movimentos)
      await window.api.documentos.imprimir({ html, nomeArquivo: `Movimentação - ${produto.nome}` })
    } catch {
      toast.error('Erro ao gerar o relatório.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Movimentação — ${produto.nome}`} size="lg">
      <div className="flex items-center justify-between mb-4">
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onBuscar={(inicio, fim) => { setDataInicio(inicio); setDataFim(fim); carregar(inicio, fim) }}
        />
        <Button variant="outline" size="sm" icon={<FileText size={14} />} onClick={handleGerarRelatorio} loading={gerando}>
          Gerar Relatório
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Carregando…</p>
      ) : movimentos.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Nenhuma movimentação encontrada.</p>
      ) : (
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border sticky top-0 bg-surface">
                {['Data', 'Tipo', 'Quantidade', 'Fornecedor / Retirado por', 'Nota / Setor'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m, i) => (
                <tr key={i} className="border-b border-surface-border/50">
                  <td className="px-3 py-2 text-gray-400">{formatDate(m.data)}</td>
                  <td className="px-3 py-2">
                    <Badge color={m.tipo === 'entrada' ? 'green' : 'red'}>
                      {m.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-200 font-medium">{m.quantidade}</td>
                  <td className="px-3 py-2 text-gray-300">{m.pessoa ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{m.referencia ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
