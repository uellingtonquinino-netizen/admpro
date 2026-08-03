import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import { clsx }                 from 'clsx'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'

type Tipo = 'funcao' | 'setor' | 'equipe'

interface Opcao {
  id:   number
  nome: string
}

interface Props {
  onClose:  () => void
  onChange?: () => void  // avisa o formulário de colaborador para recarregar as listas
}

const ABAS: { tipo: Tipo; label: string }[] = [
  { tipo: 'funcao', label: 'Função' },
  { tipo: 'setor',  label: 'Setor'  },
  { tipo: 'equipe', label: 'Equipe' },
]

// NOVO: janela própria para cadastrar Função/Setor/Equipe uma única
// vez — o formulário de colaborador passa a escolher dentre essas
// opções em vez de digitar toda vez.
export default function OpcoesCadastroModal({ onClose, onChange }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)

  const [aba, setAba]         = useState<Tipo>('funcao')
  const [itens, setItens]     = useState<Opcao[]>([])
  const [novo, setNovo]       = useState('')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editandoNome, setEditandoNome] = useState('')
  const [loading, setLoading] = useState(false)

  async function carregar() {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.opcoes.listar({ empresa_id: empresaId, tipo: aba })
      setItens(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [aba, empresaId])

  async function handleAdicionar() {
    if (!novo.trim() || !empresaId) return
    try {
      await window.api.opcoes.criar({ empresa_id: empresaId, tipo: aba, nome: novo })
      setNovo('')
      carregar()
      onChange?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar.')
    }
  }

  function iniciarEdicao(item: Opcao) {
    setEditandoId(item.id)
    setEditandoNome(item.nome)
  }

  async function salvarEdicao() {
    if (!editandoId || !editandoNome.trim()) return
    await window.api.opcoes.atualizar({ id: editandoId, nome: editandoNome })
    setEditandoId(null)
    carregar()
    onChange?.()
  }

  async function excluir(id: number) {
    await window.api.opcoes.excluir(id)
    carregar()
    onChange?.()
  }

  return (
    <Modal open onClose={onClose} title="Função, Setor e Equipe" size="md">
      {/* Abas */}
      <div className="flex gap-1 mb-4 p-1 bg-surface-hover rounded-lg">
        {ABAS.map(a => (
          <button
            key={a.tipo}
            onClick={() => setAba(a.tipo)}
            className={clsx(
              'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              aba === a.tipo ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Adicionar novo */}
      <div className="flex gap-2 mb-4">
        <Input
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdicionar()}
          placeholder={`Nova ${ABAS.find(a => a.tipo === aba)?.label.toLowerCase()}…`}
          className="flex-1"
        />
        <Button icon={<Plus size={14} />} onClick={handleAdicionar}>
          Adicionar
        </Button>
      </div>

      {/* Lista */}
      <div className="max-h-80 overflow-y-auto border border-surface-border rounded-lg divide-y divide-surface-border/50">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 shimmer rounded-lg" />)}
          </div>
        ) : itens.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">Nenhum item cadastrado ainda.</p>
        ) : (
          itens.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2">
              {editandoId === item.id ? (
                <>
                  <Input
                    value={editandoNome}
                    onChange={e => setEditandoNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && salvarEdicao()}
                    className="flex-1"
                  />
                  <button onClick={salvarEdicao} className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditandoId(null)} className="p-1.5 text-gray-500 hover:bg-surface-hover rounded-lg">
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-200">{item.nome}</span>
                  <button onClick={() => iniciarEdicao(item)} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-surface-hover rounded-lg">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => excluir(item.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end mt-6">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    </Modal>
  )
}
