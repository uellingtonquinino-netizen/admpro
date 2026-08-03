import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { useCurrency }          from '@hooks/useCurrency'
import { useDebounce }          from '@hooks/useDebounce'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Badge                    from '@components/ui/Badge'
import Input                    from '@components/ui/Input'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import EditarApModal            from './EditarApModal'
import { formatDate }           from '@utils/format'
import { Search, Pencil, Trash2 } from 'lucide-react'

interface ApRegistro {
  id:                 number
  beneficiario_tipo:  'fornecedor' | 'colaborador'
  beneficiario_nome:  string
  descricao:          string | null
  valor_total:        number
  qtd_boletos:        number
  observacoes:        string | null
  solicitante:        string | null
  autorizado_por:     string | null
  created_at:         string
}

interface Props {
  onClose: () => void
}

// ALTERADO: com busca (nome, descrição ou valor), edição — agora com
// vários boletos por AP — e exclusão.
export default function HistoricoAPModal({ onClose }: Props) {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [items, setItems]       = useState<ApRegistro[]>([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')
  const [editando, setEditando] = useState<any | null>(null)
  const [carregandoEdicao, setCarregandoEdicao] = useState(false)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.ap.listar({ empresa_id: empresaId, page: 1, perPage: 100, busca: buscaDebounced || undefined })
      .then((r: { items: ApRegistro[] }) => setItems(r.items))
      .finally(() => setLoading(false))
  }, [empresaId, buscaDebounced])

  useEffect(() => { carregar() }, [carregar])

  async function handleEditar(a: ApRegistro) {
    setCarregandoEdicao(true)
    try {
      const completa = await window.api.ap.buscarPorId(a.id)
      setEditando(completa)
    } catch {
      toast.error('Erro ao carregar a AP.')
    } finally {
      setCarregandoEdicao(false)
    }
  }

  async function handleExcluir(a: ApRegistro) {
    const ok = await confirm({
      title:   'Excluir do histórico',
      message: `Deseja excluir a AP de "${a.beneficiario_nome}" do histórico? A despesa lançada no Financeiro também será removida.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.ap.excluir(a.id)
      toast.success('Registro excluído.')
      carregar()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  return (
    <Modal open onClose={onClose} title="Histórico de Autorizações de Pagamento" size="xl">
      <Input
        icon={<Search size={14} />}
        placeholder="Buscar por nome, valor ou descrição do serviço…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="mb-4"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-10">
          {busca ? 'Nenhum registro encontrado para essa busca.' : 'Nenhuma AP emitida ainda.'}
        </p>
      ) : (
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border sticky top-0 bg-surface">
                {['Beneficiário', 'Tipo', 'Descrição', 'Parcelas', 'Valor total', 'Data', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-3 py-2 text-gray-200">{a.beneficiario_nome}</td>
                  <td className="px-3 py-2">
                    <Badge color={a.beneficiario_tipo === 'fornecedor' ? 'blue' : 'purple'}>
                      {a.beneficiario_tipo === 'fornecedor' ? 'Fornecedor' : 'Colaborador'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-gray-400 max-w-xs truncate">{a.descricao ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-400">{a.qtd_boletos}</td>
                  <td className="px-3 py-2 text-gray-200">{format(a.valor_total)}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(a.created_at.slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleEditar(a)}
                        disabled={carregandoEdicao}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleExcluir(a)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditarApModal
          registro={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); carregar() }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </Modal>
  )
}
