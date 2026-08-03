import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useConfirm }                        from '@hooks/useConfirm'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import EmptyState                            from '@components/ui/EmptyState'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import CategoriaModal                        from '@components/categorias/CategoriaModal'
import { SkeletonTable }                     from '@components/ui/Skeleton'
import { clsx }                              from 'clsx'
import {
  Plus,
  Tag,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────
interface Categoria {
  id:   number
  nome: string
  tipo: 'receita' | 'despesa' | 'ambos'
  cor:  string | null
}

// ── Paleta de cores padrão ─────────────────────────────────
export const CORES_PADRAO = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#64748b', '#a1a1aa',
]

export default function Categorias() {
  const empresaId              = useEmpresaStore(s => s.empresaId)
  const { confirm, dialogProps } = useConfirm()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState<Categoria | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string>('')

  // ── Buscar ────────────────────────────────────────────────
  const fetchCategorias = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.categorias.listar({
        empresa_id: empresaId,
        tipo: filtroTipo || undefined,
      })
      setCategorias(data)
    } catch {
      toast.error('Erro ao carregar categorias.')
    } finally {
      setLoading(false)
    }
  }, [empresaId, filtroTipo])

  useEffect(() => { fetchCategorias() }, [fetchCategorias])

  // ── Ações ─────────────────────────────────────────────────
  function handleNova() {
    setEditing(null)
    setModalOpen(true)
  }

  function handleEditar(c: Categoria) {
    setEditing(c)
    setModalOpen(true)
  }

  async function handleExcluir(c: Categoria) {
    const ok = await confirm({
      title:   'Excluir categoria',
      message: `Deseja excluir "${c.nome}"? Os lançamentos vinculados serão desvinculados.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.categorias.excluir(c.id)
      toast.success('Categoria excluída.')
      fetchCategorias()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir.'
      toast.error(msg)
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchCategorias()
  }

  // ── Agrupamento por tipo ──────────────────────────────────
  const receitas = categorias.filter(c => c.tipo === 'receita' || c.tipo === 'ambos')
  const despesas = categorias.filter(c => c.tipo === 'despesa' || c.tipo === 'ambos')

  // ── Render grupo ─────────────────────────────────────────
  function renderGrupo(label: string, items: Categoria[], tipo: string) {
    if (items.length === 0) return null
    return (
      <div key={tipo}>
        <div className="flex items-center gap-2 mb-3">
          {tipo === 'receita'
            ? <TrendingUp  size={14} className="text-emerald-400" />
            : <TrendingDown size={14} className="text-red-400"    />
          }
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {label}
          </span>
          <span className="text-xs text-gray-600">({items.length})</span>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {items.map(cat => (
            <div
              key={cat.id}
              className="group flex items-center gap-2
                         px-3 py-1.5 rounded-full
                         bg-surface border border-surface-border
                         hover:border-brand-500/30 transition-colors"
            >
              {/* Bolinha de cor */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: cat.cor ?? '#6366f1' }}
              />

              <span className="text-sm text-gray-200">{cat.nome}</span>

              {/* Ações */}
              <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => handleEditar(cat)}
                  className="p-0.5 text-gray-500 hover:text-brand-400
                             rounded transition-colors"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => handleExcluir(cat)}
                  className="p-0.5 text-gray-500 hover:text-red-400
                             rounded transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Categorias"
        subtitle="Organize seus lançamentos por categoria"
      >
        <div className="flex items-center gap-3">
          {/* Filtro tipo */}
          <div className="flex rounded-lg border border-surface-border overflow-hidden">
            {[
              { value: '',        label: 'Todas'   },
              { value: 'receita', label: 'Receitas' },
              { value: 'despesa', label: 'Despesas' },
            ].map(f => (
              <button
                key={f.value}
                onClick={() => setFiltroTipo(f.value)}
                className={clsx(
                  'px-3 py-1.5 text-sm transition-colors',
                  filtroTipo === f.value
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:bg-surface-hover'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Button icon={<Plus size={15} />} onClick={handleNova}>
            Nova categoria
          </Button>
        </div>
      </PageHeader>

      {/* Conteúdo */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : categorias.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Nenhuma categoria encontrada"
          description="Crie categorias para organizar seus lançamentos."
          action={{ label: 'Nova categoria', onClick: handleNova }}
        />
      ) : (
        <div>
          {renderGrupo('Receitas', receitas, 'receita')}
          {renderGrupo('Despesas', despesas, 'despesa')}
        </div>
      )}

      {/* Modal */}
      <CategoriaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        categoria={editing}
      />

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
