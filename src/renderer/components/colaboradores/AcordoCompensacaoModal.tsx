import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import { gerarHtmlAcordo }      from '../../documentos/acordo'
import { diaDaSemana }          from '../../utils/documentValidators'
import { Search, FileText, Plus, Trash2 } from 'lucide-react'

interface ColaboradorResumo {
  id:     number
  nome:   string
  cpf:    string | null
}

interface ParDias {
  dataTrabalho: string
  dataFolga:    string
}

interface Props {
  onClose: () => void
}

const PAR_VAZIO: ParDias = { dataTrabalho: '', dataFolga: '' }

// NOVO: o Acordo de Compensação, ao contrário dos outros documentos de
// RH, é assinado por vários colaboradores ao mesmo tempo (uma turma
// inteira compensando o mesmo dia) — por isso tem um fluxo próprio,
// com seleção múltipla, em vez de partir da linha de um único
// colaborador como os demais documentos.
// ALTERADO: agora aceita vários dias de trabalho/folga no mesmo acordo
// (botão "Adicionar outro dia"), e o dia da semana é descoberto
// automaticamente a partir da data — não precisa mais digitar.
export default function AcordoCompensacaoModal({ onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)

  const [lista, setLista]           = useState<ColaboradorResumo[]>([])
  const [busca, setBusca]           = useState('')
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  const [obra, setObra]             = useState('')
  const [ramoAtividade, setRamo]    = useState('Construção Civil')
  const [cidadeObra, setCidadeObra] = useState('')
  const [pares, setPares]           = useState<ParDias[]>([{ ...PAR_VAZIO }])
  const [local, setLocal]           = useState('')
  const [gerando, setGerando]       = useState(false)

  useEffect(() => {
    if (!empresa) return
    window.api.colaboradores.listarResumo(empresa.id).then(setLista)
    if (empresa.cidade) {
      const cidadeUf = empresa.estado ? `${empresa.cidade} - ${empresa.estado}` : empresa.cidade
      setCidadeObra(cidadeUf)
      setLocal(cidadeUf)
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

  function setPar(indice: number, campo: keyof ParDias, valor: string) {
    setPares(prev => prev.map((p, i) => (i === indice ? { ...p, [campo]: valor } : p)))
  }

  function adicionarPar() {
    setPares(prev => [...prev, { ...PAR_VAZIO }])
  }

  function removerPar(indice: number) {
    setPares(prev => prev.filter((_, i) => i !== indice))
  }

  const filtrados = lista.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase()))

  async function handleGerar() {
    if (!empresa) return
    if (selecionados.size === 0) { toast.error('Selecione ao menos um colaborador.'); return }
    if (pares.some(p => !p.dataTrabalho || !p.dataFolga)) {
      toast.error('Preencha as duas datas em cada linha adicionada.')
      return
    }

    setGerando(true)
    try {
      // CORRIGIDO: busca a empresa atualizada direto do banco (inclusive a
      // logo), em vez de usar o valor em cache da store.
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      const colaboradoresSelecionados = lista
        .filter(c => selecionados.has(c.id))
        .map(c => ({ nome: c.nome, cpf: c.cpf }))

      const itens = pares.map(p => {
        const trabalhoFmt = new Date(`${p.dataTrabalho}T00:00:00`).toLocaleDateString('pt-BR')
        const folgaFmt     = new Date(`${p.dataFolga}T00:00:00`).toLocaleDateString('pt-BR')
        const semana        = diaDaSemana(p.dataTrabalho)
        return {
          dataTrabalho: semana ? `${trabalhoFmt} (${semana})` : trabalhoFmt,
          dataFolga:    folgaFmt,
        }
      })

      const html = gerarHtmlAcordo({
        logoUrl:         empresaAtual.logo_url,
        empresaNome:     empresaAtual.nome,
        empresaCnpj:     empresaAtual.cnpj,
        empresaEndereco: empresaAtual.endereco,
        ramoAtividade,
        obra:            obra || empresaAtual.nome,
        cidadeObra,
        itens,
        local,
        colaboradores:   colaboradoresSelecionados,
      })

      const primeiraData = itens[0]?.dataTrabalho.replace(/\//g, '-').replace(/[()]/g, '').trim() ?? ''
      const result = await window.api.documentos.imprimir({
        html,
        nomeArquivo: `Acordo de Compensação - ${primeiraData}`,
      })
      if (result.ok) {
        onClose()
      } else {
        toast.error('Erro ao abrir a impressão.')
      }
    } catch {
      toast.error('Erro ao gerar o acordo.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Acordo de Compensação" size="full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input label="Obra" value={obra} onChange={e => setObra(e.target.value)} placeholder={empresa?.nome} />
        <Input label="Ramo de atividade" value={ramoAtividade} onChange={e => setRamo(e.target.value)} />
        <Input label="Cidade da obra - UF" value={cidadeObra} onChange={e => setCidadeObra(e.target.value)} />
        <Input label="Cidade - UF (assinatura)" value={local} onChange={e => setLocal(e.target.value)} />
      </div>

      <div className="border-t border-surface-border pt-4 mb-4">
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
          Dias de trabalho e compensação
        </p>
        <div className="space-y-3">
          {pares.map((par, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <Input
                label="Dia que vai trabalhar"
                type="date"
                value={par.dataTrabalho}
                onChange={e => setPar(i, 'dataTrabalho', e.target.value)}
              />
              <Input
                label="Dia de folga (compensado)"
                type="date"
                value={par.dataFolga}
                onChange={e => setPar(i, 'dataFolga', e.target.value)}
              />
              <div className="flex items-center gap-2">
                {par.dataTrabalho && (
                  <span className="text-xs text-gray-400 whitespace-nowrap capitalize pb-2.5">
                    {diaDaSemana(par.dataTrabalho)}
                  </span>
                )}
                {pares.length > 1 && (
                  <button
                    onClick={() => removerPar(i)}
                    className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Plus size={13} />}
          onClick={adicionarPar}
          className="mt-3"
        >
          Adicionar outro dia
        </Button>
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
              <span className="text-xs text-gray-500 ml-auto">{c.cpf}</span>
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
