import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }   from '@store/empresa.store'
import { useCurrency }       from '@hooks/useCurrency'
import { useDebounce }       from '@hooks/useDebounce'
import { useConfirm }        from '@hooks/useConfirm'
import { toast }             from '@components/ui/ToastContainer'
import PageHeader            from '@components/layout/PageHeader'
import Button                from '@components/ui/Button'
import Input                 from '@components/ui/Input'
import ConfirmDialog         from '@components/ui/ConfirmDialog'
import { SkeletonTable }     from '@components/ui/Skeleton'
import EmptyState            from '@components/ui/EmptyState'
import NovaEntradaModal      from '@components/almoxarifado/NovaEntradaModal'
import { formatDate }        from '@utils/format'
import { Search, Plus, Trash2, PackagePlus } from 'lucide-react'

interface Entrada {
  id:              number
  numero_nota:     string | null
  numero_pedido:   string | null
  data:            string
  fornecedor_nome: string
  valor_desconto:  number
  valor_acrescimo: number
  valor_total:     number
}

// NOVO: lista as entradas de nota do Almoxarifado, com opção de
// lançar uma nova (soma ao estoque automaticamente).
export default function AlmoxarifadoEntradas() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [entradas, setEntradas] = useState<Entrada[]>([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')
  const [novaOpen, setNovaOpen] = useState(false)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.almoxarifadoEntradas.listar({ empresa_id: empresaId, busca: buscaDebounced || undefined })
      .then(setEntradas)
      .finally(() => setLoading(false))
  }, [empresaId, buscaDebounced])

  useEffect(() => { carregar() }, [carregar])

  async function handleExcluir(e: Entrada) {
    const ok = await confirm({
      title:   'Excluir entrada',
      message: `Deseja excluir a entrada da nota "${e.numero_nota ?? '—'}" de ${e.fornecedor_nome}? O estoque somado por ela será desfeito.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.almoxarifadoEntradas.excluir(e.id)
      toast.success('Entrada excluída — estoque ajustado.')
      carregar()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  return (
    <div>
      <PageHeader title="Entradas" subtitle="Notas de entrada do Almoxarifado">
        <Button icon={<Plus size={15} />} onClick={() => setNovaOpen(true)}>
          Nova Entrada
        </Button>
      </PageHeader>

      <Input
        icon={<Search size={14} />}
        placeholder="Buscar por nota, pedido ou fornecedor…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="mb-4"
      />

      {loading ? (
        <SkeletonTable rows={6} />
      ) : entradas.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="Nenhuma entrada registrada"
          description={busca ? 'Ajuste a busca acima.' : 'Clique em "Nova Entrada" para lançar a primeira nota.'}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Nota', 'Pedido', 'Fornecedor', 'Data', 'Valor total', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entradas.map(e => (
                <tr key={e.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-200">{e.numero_nota ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{e.numero_pedido ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-200">{e.fornecedor_nome}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(e.data)}</td>
                  <td className="px-4 py-3 text-gray-200">{format(e.valor_total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleExcluir(e)}
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

      {novaOpen && (
        <NovaEntradaModal
          onClose={() => setNovaOpen(false)}
          onSaved={() => { setNovaOpen(false); carregar() }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
