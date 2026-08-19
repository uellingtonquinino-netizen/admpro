import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useCurrency }     from '@hooks/useCurrency'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import Input                  from '@components/ui/Input'
import FornecedorModal          from '@components/fornecedores/FornecedorModal'
import ProdutoModal              from '@components/almoxarifado/ProdutoModal'
import { Search, Plus, Trash2 } from 'lucide-react'

interface FornecedorResumo { id: number; nome: string; cnpj?: string | null }

interface ItemLinha {
  codigo:         string
  produto_id:     number | null
  produto_nome:   string
  encontrado:     boolean | null  // null = ainda não buscou
  quantidade:     string
  valor_unitario: string
}

const ITEM_VAZIO: ItemLinha = {
  codigo: '', produto_id: null, produto_nome: '', encontrado: null, quantidade: '', valor_unitario: '',
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

// NOVO: lança uma nota de entrada no almoxarifado — cada linha busca
// o produto pelo código (ou permite cadastrar um novo na hora), soma
// ao estoque e recalcula o valor total ao salvar.
export default function NovaEntradaModal({ onClose, onSaved }: Props) {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const { format } = useCurrency()

  const [numeroNota, setNumeroNota]     = useState('')
  const [numeroPedido, setNumeroPedido] = useState('')
  const [data, setData]                 = useState(hoje())

  const [fornecedores, setFornecedores] = useState<FornecedorResumo[]>([])
  const [buscaFornecedor, setBuscaFornecedor] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [fornecedorSel, setFornecedorSel] = useState<FornecedorResumo | null>(null)
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false)

  const [itens, setItens] = useState<ItemLinha[]>([{ ...ITEM_VAZIO }])
  const [indiceNovoProduto, setIndiceNovoProduto] = useState<number | null>(null)
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<{ id: number; codigo: string; nome: string; valor_unitario: number }[]>([])
  const [indiceSugestoesAbertas, setIndiceSugestoesAbertas] = useState<number | null>(null)

  const [desconto, setDesconto] = useState('0')
  const [acrescimo, setAcrescimo] = useState('0')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    window.api.fornecedores.listarResumo(empresaId).then(setFornecedores)
    window.api.produtos.listar({ empresa_id: empresaId }).then(setProdutosDisponiveis)
  }, [empresaId])

  const sugestoesFornecedor = buscaFornecedor && !fornecedorSel
    ? fornecedores.filter(f => f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase())).slice(0, 8)
    : []

  function selecionarFornecedor(f: FornecedorResumo) {
    setFornecedorSel(f)
    setBuscaFornecedor(f.nome)
    setSugestoesAbertas(false)
  }

  function setItem<K extends keyof ItemLinha>(i: number, campo: K, valor: ItemLinha[K]) {
    setItens(prev => prev.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)))
  }

  async function buscarProdutoPorCodigo(i: number) {
    const codigo = itens[i].codigo.trim()
    if (!codigo || !empresaId) return
    const produto = await window.api.produtos.buscarPorCodigo({ empresa_id: empresaId, codigo })
    if (produto) {
      setItens(prev => prev.map((it, idx) => (idx === i ? {
        ...it,
        produto_id:     produto.id,
        produto_nome:   produto.nome,
        encontrado:     true,
        valor_unitario: it.valor_unitario || String(produto.valor_unitario ?? 0),
      } : it)))
    } else {
      setItens(prev => prev.map((it, idx) => (idx === i ? { ...it, produto_id: null, produto_nome: '', encontrado: false } : it)))
    }
  }

  function abrirNovoProduto(i: number) {
    setIndiceNovoProduto(i)
  }

  function selecionarProdutoNaLinha(i: number, p: { id: number; codigo: string; nome: string; valor_unitario: number }) {
    setItens(prev => prev.map((it, idx) => (idx === i ? {
      ...it,
      codigo:         p.codigo,
      produto_id:     p.id,
      produto_nome:   p.nome,
      encontrado:     true,
      valor_unitario: it.valor_unitario || String(p.valor_unitario ?? 0),
    } : it)))
    setIndiceSugestoesAbertas(null)
  }

  function adicionarLinha() {
    setItens(prev => [...prev, { ...ITEM_VAZIO }])
  }

  function removerLinha(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i))
  }

  const subtotal = itens.reduce((soma, it) => {
    const qtd = Number(it.quantidade.toString().replace(',', '.')) || 0
    const val = Number(it.valor_unitario.toString().replace(',', '.')) || 0
    return soma + qtd * val
  }, 0)
  const descontoNum = Number(desconto.toString().replace(',', '.')) || 0
  const acrescimoNum = Number(acrescimo.toString().replace(',', '.')) || 0
  const total = Math.max(subtotal - descontoNum + acrescimoNum, 0)

  async function handleSalvar() {
    if (!fornecedorSel) { toast.error('Selecione o fornecedor.'); return }
    if (itens.some(it => !it.produto_id || !it.quantidade || !it.valor_unitario)) {
      toast.error('Selecione o material/ferramenta (por código ou nome), e preencha quantidade e valor em todas as linhas.')
      return
    }
    if (!empresaId) return

    setSalvando(true)
    try {
      await window.api.almoxarifadoEntradas.criar({
        empresa_id:      empresaId,
        numero_nota:     numeroNota || null,
        numero_pedido:   numeroPedido || null,
        data,
        fornecedor_id:   fornecedorSel.id,
        fornecedor_nome: fornecedorSel.nome,
        valor_desconto:  descontoNum,
        valor_acrescimo: acrescimoNum,
        itens: itens.map(it => ({
          produto_id:     it.produto_id!,
          produto_codigo: it.codigo.trim(),
          produto_nome:   it.produto_nome,
          quantidade:     Number(it.quantidade.toString().replace(',', '.')),
          valor_unitario: Number(it.valor_unitario.toString().replace(',', '.')),
        })),
      })
      toast.success('Entrada registrada — estoque atualizado.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar a entrada.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Nova Entrada de Nota" size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Input label="Número da nota" value={numeroNota} onChange={e => setNumeroNota(e.target.value)} />
          <Input label="Número do pedido" value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} />
          <Input label="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        </div>

        <div className="relative">
          <Input
            label="Fornecedor"
            icon={<Search size={14} />}
            value={buscaFornecedor}
            onChange={e => { setBuscaFornecedor(e.target.value); setFornecedorSel(null); setSugestoesAbertas(true) }}
            onFocus={() => setSugestoesAbertas(true)}
            placeholder="Digite para buscar…"
          />
          {sugestoesAbertas && sugestoesFornecedor.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {sugestoesFornecedor.map(f => (
                <button
                  key={f.id}
                  onClick={() => selecionarFornecedor(f)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  {f.nome}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setNovoFornecedorOpen(true)}
            className="mt-1.5 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <Plus size={12} /> Novo fornecedor
          </button>
        </div>

        {/* Itens */}
        <div className="border-t border-surface-border pt-4">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
            Materiais/Ferramentas
          </p>
          <div className="space-y-2">
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[110px_1fr_90px_120px_auto] gap-2 items-end">
                <Input
                  label={i === 0 ? 'Código' : undefined}
                  value={it.codigo}
                  onChange={e => setItem(i, 'codigo', e.target.value)}
                  onBlur={() => buscarProdutoPorCodigo(i)}
                  placeholder="Cód."
                />
                <div className="relative">
                  {i === 0 && <label className="text-xs font-medium text-gray-400">Material/Ferramenta</label>}
                  <Input
                    value={it.produto_nome}
                    onChange={e => {
                      setItem(i, 'produto_nome', e.target.value)
                      setItem(i, 'produto_id', null)
                      setItem(i, 'encontrado', null)
                      setIndiceSugestoesAbertas(i)
                    }}
                    onFocus={() => setIndiceSugestoesAbertas(i)}
                    placeholder="Digite para buscar…"
                  />
                  {indiceSugestoesAbertas === i && it.produto_nome && !it.produto_id && (
                    <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {produtosDisponiveis
                        .filter(p => p.nome.toLowerCase().includes(it.produto_nome.toLowerCase()))
                        .slice(0, 8)
                        .map(p => (
                          <button
                            key={p.id}
                            onClick={() => selecionarProdutoNaLinha(i, p)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                          >
                            {p.nome} <span className="text-xs text-gray-500 ml-1">({p.codigo})</span>
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => abrirNovoProduto(i)}
                        className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-surface-hover transition-colors border-t border-surface-border"
                      >
                        + Cadastrar "{it.produto_nome}" como novo material/ferramenta
                      </button>
                    </div>
                  )}
                </div>
                <Input
                  label={i === 0 ? 'Qtd.' : undefined}
                  value={it.quantidade}
                  onChange={e => setItem(i, 'quantidade', e.target.value)}
                  placeholder="0"
                />
                <Input
                  label={i === 0 ? 'Valor unit. (R$)' : undefined}
                  value={it.valor_unitario}
                  onChange={e => setItem(i, 'valor_unitario', e.target.value)}
                  placeholder="0,00"
                />
                <Button variant="ghost" onClick={() => removerLinha(i)} disabled={itens.length === 1} icon={<Trash2 size={14} />} />
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={adicionarLinha} className="mt-3">
            Adicionar material/ferramenta
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 items-end border-t border-surface-border pt-4">
          <Input label="Desconto (R$)" value={desconto} onChange={e => setDesconto(e.target.value)} placeholder="0,00" />
          <Input label="Acréscimo (R$)" value={acrescimo} onChange={e => setAcrescimo(e.target.value)} placeholder="0,00" />
          <div className="text-right">
            <p className="text-sm text-gray-300">
              Valor total da entrada: <span className="text-lg font-semibold text-white">{format(total)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} loading={salvando}>
          Registrar entrada
        </Button>
      </div>

      {novoFornecedorOpen && (
        <FornecedorModal
          open={novoFornecedorOpen}
          onClose={() => setNovoFornecedorOpen(false)}
          onSaved={async () => {
            setNovoFornecedorOpen(false)
            if (empresaId) {
              const lista = await window.api.fornecedores.listarResumo(empresaId)
              setFornecedores(lista)
              const criado = lista[lista.length - 1]
              if (criado) selecionarFornecedor(criado)
            }
          }}
        />
      )}

      {indiceNovoProduto !== null && (
        <ProdutoModal
          open
          onClose={() => setIndiceNovoProduto(null)}
          onSaved={novo => {
            if (novo) {
              setItem(indiceNovoProduto, 'produto_id', novo.id)
              setItem(indiceNovoProduto, 'produto_nome', novo.nome)
              setItem(indiceNovoProduto, 'codigo', novo.codigo)
              setItem(indiceNovoProduto, 'encontrado', true)
            }
            setIndiceNovoProduto(null)
          }}
        />
      )}
    </Modal>
  )
}
