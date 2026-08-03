import { useState, useEffect } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }     from '@components/ui/ToastContainer'
import Modal         from '@components/ui/Modal'
import Button        from '@components/ui/Button'
import Input         from '@components/ui/Input'
import Select        from '@components/ui/Select'
import { Search } from 'lucide-react'

interface Produto {
  id:              number
  codigo:          string
  nome:            string
  descricao:       string | null
  unidade:         string | null
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

interface Fornecedor { id: number; nome: string }

interface Props {
  open:      boolean
  onClose:   () => void
  onSaved:   (novo?: { id: number; codigo: string; nome: string }) => void
  produto?:  Produto | null
}

const OPCOES_PERIODO = [
  { value: 'diario',  label: 'Diário' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal',  label: 'Mensal' },
  { value: 'anual',   label: 'Anual' },
]

// ALTERADO: "Produto" virou "Material/Ferramenta" em toda a tela — e
// o código não é mais digitado, segue a sequência automática (só ao
// cadastrar um novo; editando, o código já existente continua igual).
// NOVO: campo de Fornecedor (não tinha), e opção de marcar como
// Alugado — abrindo valor do aluguel, período de cobrança e
// vencimento (usado no relatório de Alugados, em Estoque).
export default function ProdutoModal({ open, onClose, onSaved, produto }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)

  const [codigo, setCodigo]     = useState(produto?.codigo ?? '')
  const [carregandoCodigo, setCarregandoCodigo] = useState(!produto)
  const [nome, setNome]         = useState(produto?.nome ?? '')
  const [descricao, setDescricao] = useState(produto?.descricao ?? '')
  const [unidade, setUnidade]   = useState(produto?.unidade ?? 'UN')
  const [estoqueAtual, setEstoqueAtual]   = useState(String(produto?.estoque_atual ?? 0))
  const [estoqueMinimo, setEstoqueMinimo] = useState(String(produto?.estoque_minimo ?? 0))
  const [valorUnitario, setValorUnitario] = useState(String(produto?.valor_unitario ?? 0))
  const [salvando, setSalvando] = useState(false)

  // ── Fornecedor ────────────────────────────────────────
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedorId, setFornecedorId] = useState<number | null>(produto?.fornecedor_id ?? null)
  const [buscaFornecedor, setBuscaFornecedor] = useState(produto?.fornecedor_nome ?? '')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    window.api.fornecedores.listarResumo(empresaId).then(setFornecedores)
  }, [empresaId])

  const fornecedoresFiltrados = buscaFornecedor.trim()
    ? fornecedores.filter(f => f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase()))
    : fornecedores

  // ── Alugado ───────────────────────────────────────────
  const [alugado, setAlugado] = useState(!!produto?.alugado)
  const [valorAluguel, setValorAluguel] = useState(String(produto?.valor_aluguel ?? ''))
  const [aluguelPeriodo, setAluguelPeriodo] = useState(produto?.aluguel_periodo ?? 'mensal')
  const [aluguelVencimento, setAluguelVencimento] = useState(produto?.aluguel_vencimento ?? '')

  useEffect(() => {
    if (produto || !empresaId) return
    window.api.produtos.proximoCodigo(empresaId).then(r => {
      setCodigo(r.codigo)
      setCarregandoCodigo(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSalvar() {
    if (!nome.trim())    { toast.error('Informe o nome do material/ferramenta.'); return }
    if (!empresaId) return

    setSalvando(true)
    try {
      const payload = {
        empresa_id:     empresaId,
        codigo:         codigo.trim(),
        nome:           nome.trim(),
        descricao,
        unidade,
        estoque_atual:  Number(estoqueAtual.toString().replace(',', '.')) || 0,
        estoque_minimo: Number(estoqueMinimo.toString().replace(',', '.')) || 0,
        valor_unitario: Number(valorUnitario.toString().replace(',', '.')) || 0,
        fornecedor_id:      fornecedorId,
        alugado,
        valor_aluguel:      alugado ? (Number(valorAluguel.toString().replace(',', '.')) || 0) : null,
        aluguel_periodo:    alugado ? aluguelPeriodo : null,
        aluguel_vencimento: alugado ? (aluguelVencimento || null) : null,
      }

      if (produto) {
        await window.api.produtos.atualizar({ id: produto.id, ...payload })
        toast.success('Material/Ferramenta atualizado.')
        onSaved()
      } else {
        const { id } = await window.api.produtos.criar(payload)
        toast.success('Material/Ferramenta cadastrado.')
        onSaved({ id, codigo: payload.codigo, nome: payload.nome })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar. Verifique se o código já existe.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={produto ? 'Editar Material/Ferramenta' : 'Novo Material/Ferramenta'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Código"
            value={carregandoCodigo ? '...' : codigo}
            disabled={!produto}
            onChange={e => setCodigo(e.target.value)}
          />
          <Input label="Unidade" value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="UN, KG, M..." />
        </div>
        {!produto && (
          <p className="text-xs text-gray-500 -mt-2">Código gerado automaticamente, em sequência.</p>
        )}

        <Input label="Nome do material/ferramenta" value={nome} onChange={e => setNome(e.target.value)} />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">Descrição</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={descricao}
            onChange={e => setDescricao(e.target.value.toUpperCase())}
          />
        </div>

        {/* NOVO: Fornecedor */}
        <div className="relative">
          <Input
            label="Fornecedor"
            icon={<Search size={14} />}
            value={buscaFornecedor}
            onChange={e => { setBuscaFornecedor(e.target.value); setFornecedorId(null); setSugestoesAbertas(true) }}
            onFocus={() => setSugestoesAbertas(true)}
            placeholder="Digite para buscar…"
          />
          {sugestoesAbertas && fornecedoresFiltrados.length > 0 && !fornecedorId && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-40 overflow-y-auto">
              {fornecedoresFiltrados.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setFornecedorId(f.id); setBuscaFornecedor(f.nome); setSugestoesAbertas(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  {f.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input label="Estoque atual" value={estoqueAtual} onChange={e => setEstoqueAtual(e.target.value)} />
          <Input label="Estoque mínimo" value={estoqueMinimo} onChange={e => setEstoqueMinimo(e.target.value)} />
          <Input label="Valor unitário (R$)" value={valorUnitario} onChange={e => setValorUnitario(e.target.value)} />
        </div>

        {/* NOVO: Alugado */}
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={alugado} onChange={e => setAlugado(e.target.checked)} className="accent-brand-500 w-4 h-4" />
          Alugado
        </label>

        {alugado && (
          <div className="grid grid-cols-3 gap-4 bg-surface-hover rounded-lg p-3 -mt-1">
            <Input label="Valor do aluguel (R$)" value={valorAluguel} onChange={e => setValorAluguel(e.target.value)} />
            <Select label="Período" value={aluguelPeriodo} onChange={e => setAluguelPeriodo(e.target.value)} options={OPCOES_PERIODO} />
            <Input label="Vencimento" type="date" value={aluguelVencimento} onChange={e => setAluguelVencimento(e.target.value)} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} loading={salvando || carregandoCodigo}>
          {produto ? 'Salvar alterações' : 'Cadastrar'}
        </Button>
      </div>
    </Modal>
  )
}
