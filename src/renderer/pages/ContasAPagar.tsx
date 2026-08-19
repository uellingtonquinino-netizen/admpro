import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { useCurrency }          from '@hooks/useCurrency'
import { useDebounce }          from '@hooks/useDebounce'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import PageHeader               from '@components/layout/PageHeader'
import Button                   from '@components/ui/Button'
import Badge                    from '@components/ui/Badge'
import Input                    from '@components/ui/Input'
import Select                   from '@components/ui/Select'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import PagamentoParcialModal    from '@components/lancamentos/PagamentoParcialModal'
import { formatDate }           from '@utils/format'
import { Search, CheckCircle2, SplitSquareHorizontal, Undo2, Wallet } from 'lucide-react'

interface ContaAPagar {
  id:               number
  descricao:        string
  valor:            number
  data:             string
  data_venc:        string
  status:            string
  data_pgto:         string | null
  fornecedor_nome:   string | null
  situacao:          'a_vencer' | 'vencido' | 'pago'
  origem:            'ap' | 'nf' | 'outro'
}

const SITUACAO_LABEL: Record<string, string> = {
  a_vencer: 'A vencer', vencido: 'Vencido', pago: 'Pago',
}
const SITUACAO_COLOR: Record<string, 'yellow' | 'red' | 'green'> = {
  a_vencer: 'yellow', vencido: 'red', pago: 'green',
}
const ORIGEM_LABEL: Record<string, string> = {
  ap: 'AP', nf: 'Nota Fiscal', outro: 'Lançamento',
}

// NOVO: reúne as despesas geradas por AP's e Notas Fiscais (e outros
// lançamentos) num único lugar para controle de pagamento — dar baixa
// ou pagar parcialmente, gerando uma nova parcela com o restante.
export default function ContasAPagar() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [itens, setItens]         = useState<ContaAPagar[]>([])
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [situacao, setSituacao]   = useState('')
  const [parcial, setParcial]     = useState<ContaAPagar | null>(null)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.contasAPagar.listar({
      empresa_id: empresaId,
      situacao:   situacao || undefined,
      busca:      buscaDebounced || undefined,
    })
      .then(setItens)
      .finally(() => setLoading(false))
  }, [empresaId, situacao, buscaDebounced])

  useEffect(() => { carregar() }, [carregar])

  async function handleDarBaixa(c: ContaAPagar) {
    const ok = await confirm({
      title:   'Dar baixa',
      message: `Marcar "${c.descricao}" (${format(c.valor)}) como pago?`,
    })
    if (!ok) return
    try {
      await window.api.contasAPagar.darBaixa({ id: c.id })
      toast.success('Baixa registrada.')
      carregar()
    } catch {
      toast.error('Erro ao dar baixa.')
    }
  }

  async function handleReabrir(c: ContaAPagar) {
    const ok = await confirm({
      title:   'Reabrir conta',
      message: `Desfazer a baixa de "${c.descricao}"? Ela volta a ficar pendente.`,
    })
    if (!ok) return
    try {
      await window.api.contasAPagar.reabrir(c.id)
      toast.success('Conta reaberta.')
      carregar()
    } catch {
      toast.error('Erro ao reabrir.')
    }
  }

  const totalAVencer = itens.filter(i => i.situacao === 'a_vencer').reduce((s, i) => s + i.valor, 0)
  const totalVencido = itens.filter(i => i.situacao === 'vencido').reduce((s, i) => s + i.valor, 0)

  return (
    <div>
      <PageHeader title="Contas a Pagar" subtitle="Despesas de APs, Notas Fiscais e lançamentos" />

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-xs text-gray-300 mb-1">A vencer</p>
          <p className="text-xl font-bold text-amber-400">{format(totalAVencer)}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-xs text-gray-300 mb-1">Vencido</p>
          <p className="text-xl font-bold text-red-400">{format(totalVencido)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por descrição ou valor…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px]"
        />
        <Select
          value={situacao}
          onChange={e => setSituacao(e.target.value)}
          options={[
            { value: '', label: 'Todas as situações' },
            { value: 'a_vencer', label: 'A vencer' },
            { value: 'vencido', label: 'Vencido' },
            { value: 'pago', label: 'Pago' },
          ]}
          className="w-48"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : itens.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta encontrada"
          description="Ajuste os filtros acima, ou emita uma AP / lance uma Nota Fiscal para ver as despesas aqui."
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Descrição', 'Origem', 'Fornecedor', 'Vencimento', 'Valor', 'Situação', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map(c => (
                <tr key={c.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-200">{c.descricao}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{ORIGEM_LABEL[c.origem]}</td>
                  <td className="px-4 py-3 text-gray-400">{c.fornecedor_nome ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(c.data_venc)}</td>
                  <td className="px-4 py-3 text-gray-200">{format(c.valor)}</td>
                  <td className="px-4 py-3">
                    <Badge color={SITUACAO_COLOR[c.situacao]}>{SITUACAO_LABEL[c.situacao]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {c.situacao === 'pago' ? (
                        <button
                          onClick={() => handleReabrir(c)}
                          title="Reabrir"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                        >
                          <Undo2 size={14} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setParcial(c)}
                            title="Pagamento parcial"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          >
                            <SplitSquareHorizontal size={14} />
                          </button>
                          <button
                            onClick={() => handleDarBaixa(c)}
                            title="Dar baixa (pago)"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {parcial && (
        <PagamentoParcialModal
          lancamento={parcial}
          onClose={() => setParcial(null)}
          onSaved={() => { setParcial(null); carregar() }}
          onConfirmar={p => window.api.contasAPagar.pagarParcial(p)}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
