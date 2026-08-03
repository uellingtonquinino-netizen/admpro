import { useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import Input                  from '@components/ui/Input'
import Select                  from '@components/ui/Select'
import {
  gerarRelatorioEstoque, gerarRelatorioFaixaEstoque, gerarRelatorioMovimentacao, gerarRelatorioAlugados,
} from '../../documentos/relatoriosAlmoxarifado'
import { Search } from 'lucide-react'

interface Produto { id: number; codigo: string; nome: string }

interface Props {
  onClose: () => void
}

type TipoRelatorio = 'estoque' | 'faixa' | 'movimentacao' | 'alugados'

// NOVO: gera um dos três relatórios do Almoxarifado — estoque
// completo, produtos numa faixa de quantidade, ou a movimentação de
// um produto específico.
export default function RelatorioModal({ onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)

  const [tipo, setTipo] = useState<TipoRelatorio>('estoque')
  const [min, setMin]   = useState('0')
  const [max, setMax]   = useState('')

  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtos, setProdutos]         = useState<Produto[]>([])
  const [produtoSel, setProdutoSel]     = useState<Produto | null>(null)
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)

  const [vencimentoInicio, setVencimentoInicio] = useState('')
  const [vencimentoFim, setVencimentoFim]       = useState('')

  const [gerando, setGerando] = useState(false)

  async function buscarProdutos(valor: string) {
    setBuscaProduto(valor)
    setProdutoSel(null)
    setSugestoesAbertas(true)
    if (!empresa || !valor.trim()) { setProdutos([]); return }
    const lista = await window.api.produtos.listar({ empresa_id: empresa.id, busca: valor })
    setProdutos(lista)
  }

  async function handleGerar() {
    if (!empresa) return
    setGerando(true)
    try {
      let html = ''
      if (tipo === 'estoque') {
        const itens = await window.api.produtos.listar({ empresa_id: empresa.id })
        html = gerarRelatorioEstoque(empresa, itens)
      } else if (tipo === 'faixa') {
        const minNum = Number(min) || 0
        const maxNum = Number(max) || 999999
        const itens = await window.api.produtos.porFaixaEstoque({ empresa_id: empresa.id, min: minNum, max: maxNum })
        html = gerarRelatorioFaixaEstoque(empresa, itens, minNum, maxNum)
      } else if (tipo === 'movimentacao') {
        if (!produtoSel) { toast.error('Selecione o material/ferramenta.'); setGerando(false); return }
        const movimentos = await window.api.produtos.movimentacao({ produto_id: produtoSel.id })
        html = gerarRelatorioMovimentacao(empresa, produtoSel, movimentos)
      } else {
        const itens = await window.api.produtos.alugados({
          empresa_id: empresa.id,
          vencimentoInicio: vencimentoInicio || undefined,
          vencimentoFim: vencimentoFim || undefined,
        })
        html = gerarRelatorioAlugados(empresa, itens, vencimentoInicio || undefined, vencimentoFim || undefined)
      }

      await window.api.documentos.imprimir({ html, nomeArquivo: 'Relatório Almoxarifado' })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar o relatório.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Gerar Relatório" size="md">
      <div className="space-y-4">
        <Select
          label="Tipo de relatório"
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoRelatorio)}
          options={[
            { value: 'estoque', label: 'Estoque completo' },
            { value: 'faixa', label: 'Materiais/Ferramentas por faixa de estoque' },
            { value: 'movimentacao', label: 'Movimentação de um material/ferramenta' },
            { value: 'alugados', label: 'Alugados' },
          ]}
        />

        {tipo === 'faixa' && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="De (quantidade)" value={min} onChange={e => setMin(e.target.value)} />
            <Input label="Até (quantidade)" value={max} onChange={e => setMax(e.target.value)} placeholder="Sem limite" />
          </div>
        )}

        {tipo === 'movimentacao' && (
          <div className="relative">
            <Input
              label="Material/Ferramenta"
              icon={<Search size={14} />}
              value={buscaProduto}
              onChange={e => buscarProdutos(e.target.value)}
              onFocus={() => setSugestoesAbertas(true)}
              placeholder="Digite para buscar…"
            />
            {sugestoesAbertas && produtos.length > 0 && !produtoSel && (
              <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {produtos.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setProdutoSel(p); setBuscaProduto(p.nome); setSugestoesAbertas(false) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                  >
                    {p.nome} <span className="text-xs text-gray-500 ml-1">({p.codigo})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tipo === 'alugados' && (
          <div>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Vencimento de" type="date" value={vencimentoInicio} onChange={e => setVencimentoInicio(e.target.value)} />
              <Input label="Vencimento até" type="date" value={vencimentoFim} onChange={e => setVencimentoFim(e.target.value)} />
            </div>
            <p className="text-xs text-gray-500 mt-1">Deixe em branco pra trazer todos os materiais/ferramentas alugados, sem filtrar por vencimento.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={gerando}>
          Cancelar
        </Button>
        <Button onClick={handleGerar} loading={gerando}>
          Gerar
        </Button>
      </div>
    </Modal>
  )
}
