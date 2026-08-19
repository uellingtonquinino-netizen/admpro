import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import { gerarHtmlProtocoloEntregaMultiplo } from '../../documentos/protocoloEntrega'
import { Search, FileText } from 'lucide-react'

interface ColaboradorResumo {
  id:     number
  nome:   string
  cpf:    string | null
  funcao: string | null
}

interface Props {
  onClose: () => void
}

// NOVO: Protocolo de Entrega — igual ao Acordo de Compensação, esse
// documento é gerado pra um, vários ou todos os colaboradores de uma
// vez (não parte da linha de um colaborador específico como os
// demais documentos de RH). Cada colaborador selecionado vira o seu
// próprio bloco, delineado por uma caixa, um atrás do outro em ordem
// alfabética — a ordenação e a montagem dos blocos ficam em
// documentos/protocoloEntrega.ts.
export default function ProtocoloEntregaModal({ onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)

  const [lista, setLista]               = useState<ColaboradorResumo[]>([])
  const [busca, setBusca]               = useState('')
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  const [quantidade, setQuantidade]     = useState('')
  const [item, setItemTexto]            = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [dataEntrega, setDataEntrega]   = useState(() => new Date().toISOString().slice(0, 10))
  const [local, setLocal]               = useState('')
  const [gerando, setGerando]           = useState(false)

  const [produtos, setProdutos] = useState<{ nome: string; valor_unitario: number }[]>([])

  useEffect(() => {
    if (!empresa) return
    window.api.colaboradores.listarResumo(empresa.id).then(setLista)
    window.api.produtos.listar({ empresa_id: empresa.id }).then(setProdutos).catch(() => setProdutos([]))
    if (empresa.cidade) {
      setLocal(empresa.estado ? `${empresa.cidade} - ${empresa.estado}` : empresa.cidade)
    }
  }, [empresa])

  function toggle(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados(prev => {
      const todosMarcados = filtrados.length > 0 && filtrados.every(c => prev.has(c.id))
      const next = new Set(prev)
      if (todosMarcados) {
        filtrados.forEach(c => next.delete(c.id))
      } else {
        filtrados.forEach(c => next.add(c.id))
      }
      return next
    })
  }

  // Igual ao GerarDocumentoModal: se o item digitado bate com um
  // produto do Almoxarifado, o valor unitário é preenchido sozinho.
  function setItem(valor: string) {
    setItemTexto(valor)
    const produto = produtos.find(p => p.nome.toUpperCase() === valor.toUpperCase())
    if (produto) setValorUnitario(String(produto.valor_unitario).replace('.', ','))
  }

  const filtrados = lista.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))

  async function handleGerar() {
    if (!empresa) return
    if (selecionados.size === 0) { toast.error('Selecione ao menos um colaborador.'); return }
    if (!quantidade.trim() || !item.trim() || !valorUnitario.trim()) {
      toast.error('Preencha quantidade, item e valor unitário.')
      return
    }

    setGerando(true)
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      const colaboradoresSelecionados = lista
        .filter(c => selecionados.has(c.id))
        .map(c => ({ id: c.id, nome: c.nome, cpf: c.cpf, funcao: c.funcao }))

      const dataFmt = new Date(`${dataEntrega}T00:00:00`).toLocaleDateString('pt-BR')

      const html = gerarHtmlProtocoloEntregaMultiplo(colaboradoresSelecionados, empresaAtual, {
        quantidade,
        item,
        valorUnitario: Number(valorUnitario.replace(',', '.')) || 0,
        dataEntrega: dataFmt,
        local,
      })

      const nomeArquivo = selecionados.size === 1
        ? `Protocolo de Entrega - ${colaboradoresSelecionados[0].nome}`
        : `Protocolo de Entrega - ${selecionados.size} colaboradores`

      const result = await window.api.documentos.imprimir({ html, nomeArquivo })
      if (result.ok) {
        onClose()
      } else {
        toast.error('Erro ao abrir a impressão.')
      }
    } catch (erro) {
      toast.error(`Erro ao gerar o protocolo: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Protocolo de Entrega" size="full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input label="Quantidade" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="Ex: 2" />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">Item</label>
          <input
            list="lista-produtos-protocolo-multiplo"
            className="input"
            value={item}
            onChange={e => setItem(e.target.value.toUpperCase())}
            placeholder="Busque no cadastro ou digite"
          />
          <datalist id="lista-produtos-protocolo-multiplo">
            {produtos.map(p => <option key={p.nome} value={p.nome} />)}
          </datalist>
        </div>
        <Input label="Valor unitário (R$)" value={valorUnitario} onChange={e => setValorUnitario(e.target.value)} placeholder="Ex: 50,00" />
        <Input label="Data da entrega" type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} />
        <Input label="Local (cidade - UF)" value={local} onChange={e => setLocal(e.target.value)} />
      </div>

      <div className="border-t border-surface-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">
            Colaboradores ({selecionados.size} selecionado{selecionados.size !== 1 && 's'})
          </p>
          <button
            type="button"
            onClick={alternarSelecionarTodos}
            disabled={filtrados.length === 0}
            className="text-xs text-brand-400 hover:text-brand-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {filtrados.length > 0 && filtrados.every(c => selecionados.has(c.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
        </div>
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar colaborador…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border/50">
          {filtrados.map(c => (
            <label
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={selecionados.has(c.id)}
                onChange={() => toggle(c.id)}
                className="accent-brand-500 w-4 h-4"
              />
              <span className="text-gray-200">{c.nome}</span>
              <span className="text-xs text-gray-500 ml-auto">{c.funcao}</span>
            </label>
          ))}
          {filtrados.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">Nenhum colaborador encontrado.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={gerando}>
          Cancelar
        </Button>
        <Button icon={<FileText size={14} />} onClick={handleGerar} loading={gerando}>
          Imprimir / Salvar PDF
        </Button>
      </div>
    </Modal>
  )
}
