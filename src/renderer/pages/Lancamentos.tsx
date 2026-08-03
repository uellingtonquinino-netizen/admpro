import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useCurrency }                       from '@hooks/useCurrency'
import { useDebounce }                       from '@hooks/useDebounce'
import { useConfirm }                        from '@hooks/useConfirm'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import Badge                                 from '@components/ui/Badge'
import Input                                 from '@components/ui/Input'
import FiltroPeriodo                         from '@components/ui/FiltroPeriodo'
import { SkeletonTable }                     from '@components/ui/Skeleton'
import EmptyState                            from '@components/ui/EmptyState'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import LancamentoModal                       from '@components/lancamentos/LancamentoModal'
import { clsx }                              from 'clsx'
import { format }                            from 'date-fns'
import { ptBR }                              from 'date-fns/locale'
import {
  Plus,
  Search,
  ArrowLeftRight,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────
interface Lancamento {
  id:           number
  descricao:    string
  valor:        number
  tipo:         'receita' | 'despesa'
  status:       string
  situacao?:    string
  data:         string
  data_venc:    string | null
  categoria:    string
  conta:        string
  observacao:   string | null
}

interface Filtros {
  busca:      string
  tipo:       '' | 'receita' | 'despesa'
  status:     string
  mes:        number
  ano:        number
  dataInicio: string
  dataFim:    string
}

const MES_ATUAL = new Date().getMonth() + 1
const ANO_ATUAL = new Date().getFullYear()

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

const statusColor: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  pago:      'green',
  recebido:  'green',
  pendente:  'yellow',
  a_vencer:  'yellow',
  vencido:   'red',
  cancelado: 'gray',
}

const statusLabel: Record<string, string> = {
  pago:      'Pago',
  recebido:  'Recebido',
  a_vencer:  'A vencer',
  vencido:   'Vencido',
  cancelado: 'Cancelado',
}

const PER_PAGE = 15

export default function Lancamentos() {
  const empresaId           = useEmpresaStore(s => s.empresaId)
  const { format: fmtCurr } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [total,       setTotal]       = useState(0)
  const [page,        setPage]        = useState(1)
  const [loading,     setLoading]     = useState(true)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editing,     setEditing]     = useState<Lancamento | null>(null)

  const [filtros, setFiltros] = useState<Filtros>({
    busca:      '',
    tipo:       '',
    status:     '',
    mes:        MES_ATUAL,
    ano:        ANO_ATUAL,
    dataInicio: '',
    dataFim:    '',
  })

  const buscaDebounced = useDebounce(filtros.busca, 400)
  const totalPages     = Math.ceil(total / PER_PAGE)

  // ── Buscar lançamentos ────────────────────────────────────
  const fetchLancamentos = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const res = await window.api.lancamentos.listar({
        empresa_id: empresaId,
        mes:        filtros.mes,
        ano:        filtros.ano,
        dataInicio: filtros.dataInicio || undefined,
        dataFim:    filtros.dataFim || undefined,
        tipo:       filtros.tipo || undefined,
        status:     filtros.status || undefined,
        busca:      buscaDebounced || undefined,
        page,
        perPage:    PER_PAGE,
      })
      setLancamentos(res.items)
      setTotal(res.total)
    } catch {
      toast.error('Erro ao buscar lançamentos.')
    } finally {
      setLoading(false)
    }
  }, [empresaId, filtros.mes, filtros.ano, filtros.dataInicio, filtros.dataFim, filtros.tipo,
      filtros.status, buscaDebounced, page])

  useEffect(() => { fetchLancamentos() }, [fetchLancamentos])

  // Reset page ao mudar filtros
  useEffect(() => { setPage(1) }, [
    filtros.mes, filtros.ano, filtros.tipo,
    filtros.status, buscaDebounced,
  ])

  // ── Ações ─────────────────────────────────────────────────
  function handleNovo() {
    setEditing(null)
    setModalOpen(true)
  }

  function handleEditar(l: Lancamento) {
    setEditing(l)
    setModalOpen(true)
  }

  async function handleExcluir(l: Lancamento) {
    const ok = await confirm({
      title:   'Excluir lançamento',
      message: `Deseja excluir "${l.descricao}"? Esta ação não pode ser desfeita.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.lancamentos.excluir(l.id)
      toast.success('Lançamento excluído.')
      fetchLancamentos()
    } catch {
      toast.error('Erro ao excluir lançamento.')
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchLancamentos()
  }

  function setFiltro<K extends keyof Filtros>(key: K, value: Filtros[K]) {
    setFiltros(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div>
      {/* Header */}
      <PageHeader title="Lançamentos" subtitle="Receitas e despesas">
        <Button icon={<Plus size={15} />} onClick={handleNovo}>
          Novo lançamento
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Input
          placeholder="Buscar..."
          icon={<Search size={14} />}
          value={filtros.busca}
          onChange={e => setFiltro('busca', e.target.value)}
          className="w-56"
        />

        <select
          value={filtros.tipo}
          onChange={e => setFiltro('tipo', e.target.value as Filtros['tipo'])}
          className="input w-36 text-sm"
        >
          <option value="">Todos os tipos</option>
          <option value="receita">Receitas</option>
          <option value="despesa">Despesas</option>
        </select>

        <select
          value={filtros.status}
          onChange={e => setFiltro('status', e.target.value)}
          className="input w-36 text-sm"
        >
          <option value="">Todos os status</option>
          <option value="a_vencer">A vencer</option>
          <option value="pago">Pago</option>
          <option value="recebido">Recebido</option>
          <option value="vencido">Vencido</option>
          <option value="cancelado">Cancelado</option>
        </select>

        <select
          value={filtros.mes}
          onChange={e => setFiltro('mes', Number(e.target.value))}
          disabled={!!(filtros.dataInicio && filtros.dataFim)}
          className="input w-36 text-sm disabled:opacity-40"
        >
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m}</option>
          ))}
        </select>

        <select
          value={filtros.ano}
          onChange={e => setFiltro('ano', Number(e.target.value))}
          disabled={!!(filtros.dataInicio && filtros.dataFim)}
          className="input w-24 text-sm disabled:opacity-40"
        >
          {[ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* ALTERADO: filtro por período agora só busca ao clicar na
            lupa ou apertar Enter — quando preenchido, vale no lugar
            do mês/ano acima. */}
        <FiltroPeriodo
          dataInicio={filtros.dataInicio}
          dataFim={filtros.dataFim}
          onBuscar={(inicio, fim) => {
            setFiltro('dataInicio', inicio)
            setFiltro('dataFim', fim)
          }}
        />
        {(filtros.dataInicio || filtros.dataFim) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFiltro('dataInicio', ''); setFiltro('dataFim', '') }}
          >
            Limpar período
          </Button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <SkeletonTable rows={PER_PAGE} />
      ) : lancamentos.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="Nenhum lançamento encontrado"
          description="Tente ajustar os filtros ou cadastre um novo lançamento."
          action={{ label: 'Novo lançamento', onClick: handleNovo }}
        />
      ) : (
        <div className="space-y-1">
          {/* Cabeçalho */}
          <div className="grid grid-cols-[1fr_140px_120px_110px_110px_80px]
                          gap-4 px-4 py-2 text-xs text-gray-500 font-medium">
            <span>Descrição</span>
            <span>Categoria</span>
            <span>Conta</span>
            <span>Data</span>
            <span>Status</span>
            <span className="text-right">Valor</span>
          </div>

          {/* Linhas */}
          {lancamentos.map(l => (
            <div
              key={l.id}
              className="grid grid-cols-[1fr_140px_120px_110px_110px_80px]
                         gap-4 items-center px-4 py-3
                         bg-surface rounded-lg border border-surface-border
                         hover:border-brand-500/30 transition-colors group"
            >
              {/* Descrição */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={clsx(
                  'w-1.5 h-7 rounded-full shrink-0',
                  l.tipo === 'receita' ? 'bg-emerald-500' : 'bg-red-500'
                )} />
                <div className="min-w-0">
                  <p className="text-sm text-gray-200 truncate">{l.descricao}</p>
                  {l.observacao && (
                    <p className="text-xs text-gray-500 truncate">{l.observacao}</p>
                  )}
                </div>
              </div>

              {/* Categoria */}
              <p className="text-sm text-gray-400 truncate">{l.categoria}</p>

              {/* Conta */}
              <p className="text-sm text-gray-400 truncate">{l.conta}</p>

              {/* Data */}
              <p className="text-sm text-gray-400">
                {format(new Date(l.data), 'dd/MM/yyyy', { locale: ptBR })}
              </p>

              {/* Status */}
              <Badge color={statusColor[l.situacao ?? l.status] ?? 'gray'}>
                {statusLabel[l.situacao ?? l.status] ?? l.situacao ?? l.status}
              </Badge>

              {/* Valor + ações */}
              <div className="flex items-center justify-end gap-2">
                <p className={clsx(
                  'text-sm font-medium',
                  l.tipo === 'receita' ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {l.tipo === 'despesa' ? '−' : '+'}{fmtCurr(l.valor)}
                </p>

                {/* Ações (hover) */}
                <div className="hidden group-hover:flex items-center gap-1 ml-1">
                  <button
                    onClick={() => handleEditar(l)}
                    className="p-1 text-gray-500 hover:text-brand-400
                               hover:bg-brand-500/10 rounded transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleExcluir(l)}
                    className="p-1 text-gray-500 hover:text-red-400
                               hover:bg-red-500/10 rounded transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <p className="text-xs text-gray-500">
            {total} registros · página {page} de {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronLeft size={14} />}
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            />
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages ||
                           Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span key={`gap-${p}`} className="text-gray-600 px-1">
                      …
                    </span>
                  )}
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={clsx(
                      'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                      p === page
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-400 hover:bg-surface-hover'
                    )}
                  >
                    {p}
                  </button>
                </>
              ))
            }
            <Button
              variant="ghost"
              size="sm"
              icon={<ChevronRight size={14} />}
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            />
          </div>
        </div>
      )}

      {/* Modal */}
      <LancamentoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        lancamento={editing}
      />

      {/* Confirm dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
