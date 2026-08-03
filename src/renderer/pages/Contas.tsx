import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useCurrency }                       from '@hooks/useCurrency'
import { useConfirm }                        from '@hooks/useConfirm'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import Card                                  from '@components/ui/Card'
import { SkeletonCard }                      from '@components/ui/Skeleton'
import EmptyState                            from '@components/ui/EmptyState'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import ContaModal                            from '@components/contas/ContaModal'
import { clsx }                              from 'clsx'
import {
  Plus,
  Wallet,
  PiggyBank,
  CreditCard,
  Building2,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────
interface Conta {
  id:        number
  nome:      string
  tipo:      string
  saldo:     number
  banco:     string | null
  agencia:   string | null
  numero:    string | null
  ativo:     number
}

const tipoIcon: Record<string, React.ReactNode> = {
  corrente:     <Wallet     size={20} />,
  poupanca:     <PiggyBank  size={20} />,
  cartao:       <CreditCard size={20} />,
  investimento: <Building2  size={20} />,
}

const tipoLabel: Record<string, string> = {
  corrente:     'Conta Corrente',
  poupanca:     'Poupança',
  cartao:       'Cartão',
  investimento: 'Investimento',
}

const tipoBg: Record<string, string> = {
  corrente:     'bg-brand-500/10   text-brand-400',
  poupanca:     'bg-emerald-500/10 text-emerald-400',
  cartao:       'bg-purple-500/10  text-purple-400',
  investimento: 'bg-yellow-500/10  text-yellow-400',
}

export default function Contas() {
  const empresaId              = useEmpresaStore(s => s.empresaId)
  const { format }             = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [contas,    setContas]    = useState<Conta[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing,   setEditing]   = useState<Conta | null>(null)

  // ── Buscar contas ─────────────────────────────────────────
  const fetchContas = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.contas.listar({ empresa_id: empresaId })
      setContas(data)
    } catch {
      toast.error('Erro ao carregar contas.')
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  useEffect(() => { fetchContas() }, [fetchContas])

  // ── Ações ─────────────────────────────────────────────────
  function handleNova() {
    setEditing(null)
    setModalOpen(true)
  }

  function handleEditar(c: Conta) {
    setEditing(c)
    setModalOpen(true)
  }

  async function handleExcluir(c: Conta) {
    const ok = await confirm({
      title:   'Excluir conta',
      message: `Deseja excluir "${c.nome}"? Todos os lançamentos vinculados serão desvinculados.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.contas.excluir(c.id)
      toast.success('Conta excluída.')
      fetchContas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir.'
      toast.error(msg)
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchContas()
  }

  // ── Totalizadores ─────────────────────────────────────────
  const saldoTotal    = contas.reduce((a, c) => a + c.saldo, 0)
  const totalPositivo = contas.filter(c => c.saldo >= 0).reduce((a, c) => a + c.saldo, 0)
  const totalNegativo = contas.filter(c => c.saldo <  0).reduce((a, c) => a + c.saldo, 0)

  return (
    <div>
      {/* Header */}
      <PageHeader title="Contas" subtitle="Gerencie suas contas bancárias">
        <Button icon={<Plus size={15} />} onClick={handleNova}>
          Nova conta
        </Button>
      </PageHeader>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Saldo total',
            value: saldoTotal,
            icon:  Wallet,
            color: saldoTotal >= 0 ? 'text-brand-400' : 'text-red-400',
            bg:    saldoTotal >= 0 ? 'bg-brand-500/10' : 'bg-red-500/10',
          },
          {
            label: 'Total positivo',
            value: totalPositivo,
            icon:  TrendingUp,
            color: 'text-emerald-400',
            bg:    'bg-emerald-500/10',
          },
          {
            label: 'Total negativo',
            value: totalNegativo,
            icon:  TrendingDown,
            color: 'text-red-400',
            bg:    'bg-red-500/10',
          },
        ].map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label}>
              <div className={clsx(
                'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                item.bg
              )}>
                <Icon size={18} className={item.color} />
              </div>
              <p className="text-xs text-gray-400 mb-1">{item.label}</p>
              <p className={clsx('text-xl font-semibold', item.color)}>
                {format(item.value)}
              </p>
            </Card>
          )
        })}
      </div>

      {/* Lista de contas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : contas.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhuma conta cadastrada"
          description="Cadastre sua primeira conta bancária para começar."
          action={{ label: 'Nova conta', onClick: handleNova }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {contas.map(conta => (
            <Card key={conta.id} className="group relative">
              {/* Ações */}
              <div className="absolute top-3 right-3 hidden group-hover:flex gap-1">
                <button
                  onClick={() => handleEditar(conta)}
                  className="p-1.5 text-gray-500 hover:text-brand-400
                             hover:bg-brand-500/10 rounded-lg transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleExcluir(conta)}
                  className="p-1.5 text-gray-500 hover:text-red-400
                             hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Ícone tipo */}
              <div className={clsx(
                'w-11 h-11 rounded-xl flex items-center justify-center mb-4',
                tipoBg[conta.tipo] ?? 'bg-gray-500/10 text-gray-400'
              )}>
                {tipoIcon[conta.tipo] ?? <Wallet size={20} />}
              </div>

              {/* Info */}
              <p className="text-base font-semibold text-white mb-0.5">
                {conta.nome}
              </p>
              <p className="text-xs text-gray-500 mb-4">
                {tipoLabel[conta.tipo] ?? conta.tipo}
                {conta.banco && ` · ${conta.banco}`}
              </p>

              {/* Saldo */}
              <p className={clsx(
                'text-2xl font-bold',
                conta.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}>
                {format(conta.saldo)}
              </p>

              {/* Agência / Número */}
              {(conta.agencia || conta.numero) && (
                <p className="text-xs text-gray-600 mt-2">
                  {conta.agencia && `Ag: ${conta.agencia}`}
                  {conta.agencia && conta.numero && ' · '}
                  {conta.numero && `Cc: ${conta.numero}`}
                </p>
              )}

              {/* Inativo badge */}
              {!conta.ativo && (
                <span className="absolute top-3 left-3 text-xs
                                 bg-gray-700 text-gray-400
                                 px-2 py-0.5 rounded-full">
                  Inativa
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <ContaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        conta={editing}
      />

      {/* Confirm */}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
