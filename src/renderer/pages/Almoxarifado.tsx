import { useEffect, useState, useCallback } from 'react'
import { useLocation }          from 'react-router-dom'
import { useEmpresaStore }      from '@store/empresa.store'
import { useAuthStore }         from '@store/auth.store'
import { useCurrency }          from '@hooks/useCurrency'
import { useDebounce }          from '@hooks/useDebounce'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import PageHeader               from '@components/layout/PageHeader'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import ProdutoModal             from '@components/almoxarifado/ProdutoModal'
import { Search, Plus, Pencil, Trash2, PackageX, PackageMinus, Wallet, Boxes, Download, Upload } from 'lucide-react'

interface Produto {
  id:              number
  codigo:          string
  nome:            string
  descricao:       string | null
  unidade:         string | null
  categoria:       string | null
  estoque_atual:   number
  estoque_minimo:  number
  valor_unitario:  number
  fornecedor_id:       number | null
  fornecedor_nome?:    string | null
  alugado:             number | boolean
  valor_aluguel:        number | null
  aluguel_periodo:      string | null
  aluguel_vencimento:   string | null
}

interface ProdutoResumo {
  id: number; codigo: string; nome: string; estoque_atual: number; unidade: string | null
}

interface Resumo {
  zerados:    ProdutoResumo[]
  acabando:   ProdutoResumo[]
  valorTotal: number
}

// NOVO: painel inicial do Almoxarifado — cards de estoque zerado,
// estoque acabando e valor total, além da lista de produtos.
export default function Almoxarifado() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const somenteLeitura = useAuthStore(s => s.usuario?.perfil === 'gestor')
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()
  const location = useLocation()

  const [produtos, setProdutos] = useState<Produto[]>([])
  const [resumo, setResumo]     = useState<Resumo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [importando, setImportando] = useState(false)
  const [editando, setEditando] = useState<Produto | null>(null)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.produtos.listar({ empresa_id: empresaId, busca: buscaDebounced || undefined, categoria: categoriaFiltro || undefined })
      .then(setProdutos)
      .finally(() => setLoading(false))
  }, [empresaId, buscaDebounced, categoriaFiltro])

  useEffect(() => {
    if (!empresaId) return
    window.api.produtos.categorias(empresaId).then(setCategorias)
  }, [empresaId])

  const carregarResumo = useCallback(() => {
    if (!empresaId) return
    window.api.produtos.resumo(empresaId).then(setResumo)
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarResumo() }, [carregarResumo])

  // NOVO: abre o cadastro automaticamente ao chegar aqui vindo da
  // busca global (Navbar) com um material/ferramenta específico.
  useEffect(() => {
    const id = (location.state as { editProdutoId?: number } | null)?.editProdutoId
    if (!id) return
    window.api.produtos.buscarPorId(id).then((p: Produto | null) => {
      if (p) { setEditando(p); setModalOpen(true) }
    })
    window.history.replaceState({}, '')
  }, [location.state])

  function atualizarTudo() {
    carregar()
    carregarResumo()
  }

  async function handleBaixarModelo() {
    try {
      const result = await window.api.importacao.gerarModeloProdutos()
      if (result.ok) toast.success('Modelo salvo.')
    } catch {
      toast.error('Erro ao gerar o modelo.')
    }
  }

  async function handleImportar() {
    if (!empresaId) return
    setImportando(true)
    try {
      const result = await window.api.importacao.importarProdutos({ empresa_id: empresaId })
      if (result.canceled) return
      if (result.ok) {
        toast.success(
          `Importação concluída: ${result.criados} novo(s), ${result.atualizados} atualizado(s)` +
          (result.ignorados ? `, ${result.ignorados} linha(s) sem nome ignorada(s)` : '') + '.'
        )
        atualizarTudo()
      } else {
        toast.error('Erro ao importar a planilha.')
      }
    } catch (erro) {
      toast.error(`Erro ao importar a planilha: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setImportando(false)
    }
  }

  function handleNovo() {
    setEditando(null)
    setModalOpen(true)
  }

  function handleEditar(p: Produto) {
    setEditando(p)
    setModalOpen(true)
  }

  async function handleExcluir(p: Produto) {
    const ok = await confirm({
      title:   'Excluir material/ferramenta',
      message: `Deseja excluir "${p.nome}"? Esta ação não pode ser desfeita.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.produtos.excluir(p.id)
      toast.success('Material/Ferramenta excluído.')
      atualizarTudo()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  return (
    <div>
      <PageHeader title="Almoxarifado" subtitle="Estoque de materiais e ferramentas">
        {!somenteLeitura && (
          <>
            <Button
              variant="outline"
              icon={<Download size={15} />}
              onClick={handleBaixarModelo}
            >
              Baixar modelo Excel
            </Button>
            <Button
              variant="outline"
              icon={<Upload size={15} />}
              onClick={handleImportar}
              loading={importando}
            >
              Importar Excel
            </Button>
            <Button icon={<Plus size={15} />} onClick={handleNovo}>
              Novo Material/Ferramenta
            </Button>
          </>
        )}
      </PageHeader>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <PackageX size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Estoque Zerado</p>
          </div>
          {!resumo || resumo.zerados.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum material/ferramenta zerado.</p>
          ) : (
            <div className="space-y-1 max-h-[84px] overflow-y-auto pr-1">
              {resumo.zerados.map(p => (
                <p key={p.id} className="text-xs text-gray-300 truncate">{p.nome}</p>
              ))}
            </div>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <PackageMinus size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Estoque Acabando</p>
          </div>
          {!resumo || resumo.acabando.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum material/ferramenta acabando.</p>
          ) : (
            <div className="space-y-1 max-h-[84px] overflow-y-auto pr-1">
              {resumo.acabando.map(p => (
                <p key={p.id} className="text-xs text-gray-300 truncate">
                  <span className="text-amber-400 font-medium">{p.estoque_atual}{p.unidade ? ` ${p.unidade}` : ''}</span> — {p.nome}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Wallet size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Valor total do estoque</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {resumo ? format(resumo.valorTotal) : '—'}
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por código ou nome…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1"
        />
        <select
          value={categoriaFiltro}
          onChange={e => setCategoriaFiltro(e.target.value)}
          className="bg-surface border border-surface-border rounded-xl px-3 text-sm text-gray-200 min-w-[180px]"
        >
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : produtos.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum material/ferramenta cadastrado"
          description={busca ? 'Ajuste a busca acima.' : somenteLeitura ? 'Nenhum material/ferramenta encontrado.' : 'Clique em "Novo Material/Ferramenta" para começar.'}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual', 'Valor unitário', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtos.map(p => (
                <tr key={p.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-400">{p.codigo}</td>
                  <td className="px-4 py-3 text-gray-200">
                    {p.nome}
                    {p.categoria && <span className="block text-xs text-gray-500 mt-0.5">{p.categoria}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.unidade ?? '—'}</td>
                  <td className={`px-4 py-3 font-medium ${
                    p.estoque_atual <= 0 ? 'text-red-400'
                    : p.estoque_atual <= p.estoque_minimo ? 'text-amber-400'
                    : 'text-gray-200'
                  }`}>
                    {p.estoque_atual}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{format(p.valor_unitario)}</td>
                  <td className="px-4 py-3">
                    {!somenteLeitura && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleEditar(p)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleExcluir(p)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProdutoModal
          open={modalOpen}
          produto={editando}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); atualizarTudo() }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
