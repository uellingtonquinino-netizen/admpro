import { useEffect, useState, useCallback, useMemo } from 'react'
import { useEmpresaStore }   from '@store/empresa.store'
import { useConfirm }        from '@hooks/useConfirm'
import { toast }             from '@components/ui/ToastContainer'
import PageHeader            from '@components/layout/PageHeader'
import Button                from '@components/ui/Button'
import Modal                 from '@components/ui/Modal'
import Input                 from '@components/ui/Input'
import ConfirmDialog         from '@components/ui/ConfirmDialog'
import {
  construirArvoreComExecucao, percentualGeralObra,
  type EapItemBanco, type EapItemComExecucao,
} from '@utils/obraEapCalculo'
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, FolderTree, Copy,
} from 'lucide-react'

function formatReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// NOVO: tela do ADM pra montar a Estrutura Analítica da Obra (EAP) —
// Fases/Itens/Sub-itens em quantos níveis quiser. O peso (%) de cada
// item nunca é digitado — é sempre calculado a partir do valor
// orçado dele em relação ao pai (ou ao total da obra, se for uma
// Fase). É essa estrutura que o Diário de Obra vai usar depois pra
// lançar o percentual executado.
export default function EstruturaObra() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const { confirm, dialogProps } = useConfirm()

  const [itens, setItens]         = useState<EapItemBanco[]>([])
  const [acumulados, setAcumulados] = useState<Record<number, number>>({})
  const [loading, setLoading]     = useState(true)
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())
  const [clonando, setClonando]   = useState(false)

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando]       = useState<EapItemBanco | null>(null)
  const [parentIdNovo, setParentIdNovo] = useState<number | null>(null)
  const [formNome, setFormNome]         = useState('')
  const [formValor, setFormValor]       = useState('')
  const [formUnidade, setFormUnidade]   = useState('')
  // NOVO: datas planejadas — base pro "previsto" da Curva S completa
  const [formDataInicio, setFormDataInicio] = useState('')
  const [formDataFim, setFormDataFim]       = useState('')
  const [salvando, setSalvando]         = useState(false)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    Promise.all([
      window.api.obraEap.listar(empresaId),
      window.api.obraDiario.percentuaisAcumulados(empresaId),
    ]).then(([itensCarregados, acumuladosCarregados]) => {
      setItens(itensCarregados)
      setAcumulados(acumuladosCarregados)
    }).finally(() => setLoading(false))
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])

  const arvore = useMemo(() => construirArvoreComExecucao(itens, acumulados), [itens, acumulados])
  const totalGeral = useMemo(() => arvore.reduce((soma, f) => soma + f.valor_orcado, 0), [arvore])
  const percentualGeral = useMemo(() => percentualGeralObra(arvore), [arvore])

  function toggleExpandido(id: number) {
    setExpandidos(prev => {
      const novo = new Set(prev)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      return novo
    })
  }

  function abrirNovo(parentId: number | null) {
    setEditando(null)
    setParentIdNovo(parentId)
    setFormNome('')
    setFormValor('')
    setFormUnidade('')
    setFormDataInicio('')
    setFormDataFim('')
    setModalAberto(true)
  }

  function abrirEditar(item: EapItemBanco) {
    setEditando(item)
    setParentIdNovo(item.parent_id)
    setFormNome(item.nome)
    setFormValor(String(item.valor_orcado).replace('.', ','))
    setFormUnidade(item.unidade_medida ?? '')
    setFormDataInicio(item.data_inicio_prevista ?? '')
    setFormDataFim(item.data_fim_prevista ?? '')
    setModalAberto(true)
  }

  async function handleSalvar() {
    if (!formNome.trim() || !empresaId) { toast.error('Informe o nome.'); return }
    setSalvando(true)
    try {
      const valor = Number(formValor.replace(',', '.')) || 0
      if (editando) {
        await window.api.obraEap.atualizar({
          id: editando.id, empresa_id: empresaId, parent_id: editando.parent_id,
          nome: formNome.trim(), valor_orcado: valor, unidade_medida: formUnidade.trim() || null,
          ordem: editando.ordem,
          data_inicio_prevista: formDataInicio || null, data_fim_prevista: formDataFim || null,
        })
        toast.success('Item atualizado.')
      } else {
        const irmaos = itens.filter(i => i.parent_id === parentIdNovo)
        await window.api.obraEap.criar({
          empresa_id: empresaId, parent_id: parentIdNovo,
          nome: formNome.trim(), valor_orcado: valor, unidade_medida: formUnidade.trim() || null,
          ordem: irmaos.length,
          data_inicio_prevista: formDataInicio || null, data_fim_prevista: formDataFim || null,
        })
        toast.success(parentIdNovo === null ? 'Fase criada.' : 'Item criado.')
        if (parentIdNovo !== null) setExpandidos(prev => new Set(prev).add(parentIdNovo))
      }
      setModalAberto(false)
      carregar()
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(item: EapItemBanco) {
    const temFilhos = itens.some(i => i.parent_id === item.id)
    const ok = await confirm({
      title:   'Excluir item da EAP',
      danger:  true,
      message: temFilhos
        ? `"${item.nome}" tem itens dentro dele — excluindo, todos eles (e os lançamentos do Diário de Obra vinculados) somem junto. Confirma?`
        : `Deseja excluir "${item.nome}"?`,
    })
    if (!ok) return
    try {
      await window.api.obraEap.excluir(item.id)
      toast.success('Excluído.')
      carregar()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  async function handleClonarModelo() {
    if (!empresaId) return
    const ok = await confirm({
      title:   'Clonar do modelo padrão',
      message: 'Isso copia toda a estrutura do modelo padrão da Elite Engenharia pra dentro dessa obra — você pode ajustar os valores livremente depois, sem afetar o modelo.',
    })
    if (!ok) return
    setClonando(true)
    try {
      const r = await window.api.obraEap.clonarModelo(empresaId)
      toast.success(`${r.quantidade} item(ns) copiado(s) do modelo.`)
      carregar()
    } catch {
      toast.error('Erro ao clonar o modelo.')
    } finally {
      setClonando(false)
    }
  }

  return (
    <div>
      <PageHeader title="Estrutura da Obra (EAP)" subtitle="Fases, itens e sub-itens que compõem o processo construtivo">
        {itens.length > 0 && (
          <Button icon={<Plus size={15} />} onClick={() => abrirNovo(null)}>
            Nova Fase
          </Button>
        )}
      </PageHeader>

      {!loading && itens.length > 0 && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Valor total orçado da obra</p>
            <p className="text-2xl font-bold text-brand-400">{formatReais(totalGeral)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Executado</p>
            <p className="text-2xl font-bold text-emerald-400">{percentualGeral.toFixed(1)}%</p>
          </div>
          <p className="text-xs text-gray-500">{itens.length} item(ns) cadastrado(s)</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 shimmer rounded-xl" />)}
        </div>
      ) : itens.length === 0 ? (
        <div className="py-16 text-center bg-surface border border-surface-border rounded-xl">
          <FolderTree size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 mb-1">Essa obra ainda não tem uma estrutura cadastrada.</p>
          <p className="text-xs text-gray-500 mb-5">Comece copiando o modelo padrão da empresa, ou monte a sua do zero.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" icon={<Copy size={15} />} onClick={handleClonarModelo} loading={clonando}>
              Copiar do modelo padrão
            </Button>
            <Button icon={<Plus size={15} />} onClick={() => abrirNovo(null)}>
              Criar do zero
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_130px_90px_100px_110px_100px] gap-2 px-4 py-2.5 border-b border-surface-border text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Nome</span>
            <span className="text-right">Valor Orçado</span>
            <span className="text-right">Peso</span>
            <span className="text-right">Executado</span>
            <span>Unidade</span>
            <span></span>
          </div>
          {arvore.map(fase => (
            <NoEap
              key={fase.id}
              item={fase}
              nivel={0}
              valorReferencia={totalGeral}
              expandidos={expandidos}
              onToggle={toggleExpandido}
              onAdicionar={abrirNovo}
              onEditar={abrirEditar}
              onExcluir={handleExcluir}
            />
          ))}
        </div>
      )}

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={editando ? 'Editar item' : (parentIdNovo === null ? 'Nova Fase' : 'Novo item')} size="sm">
        <div className="space-y-4">
          <Input label="Nome" value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Ex: Fundação, Sapatas, Alvenaria..." />
          <Input label="Valor orçado (R$)" value={formValor} onChange={e => setFormValor(e.target.value)} placeholder="0,00" />
          <Input label="Unidade de medida (opcional)" value={formUnidade} onChange={e => setFormUnidade(e.target.value)} placeholder="Ex: m², m³, un..." />
          {/* NOVO: datas planejadas — só fazem sentido em itens-folha
              (sem sub-item dentro); é a partir delas que a Curva S
              calcula o "previsto". Item com filho pode deixar em
              branco. */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início previsto (opcional)" type="date" value={formDataInicio} onChange={e => setFormDataInicio(e.target.value)} />
            <Input label="Fim previsto (opcional)" type="date" value={formDataFim} onChange={e => setFormDataFim(e.target.value)} />
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Usado no Painel de Acompanhamento pra calcular o "previsto" da Curva S. Só preencha em itens sem sub-item dentro.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
          <Button variant="ghost" onClick={() => setModalAberto(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleSalvar} loading={salvando}>Salvar</Button>
        </div>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

// Nó recursivo da árvore — desenha ele mesmo e, se estiver expandido,
// desenha os filhos dele chamando a si mesmo de novo.
function NoEap({ item, nivel, valorReferencia, expandidos, onToggle, onAdicionar, onEditar, onExcluir }: {
  item: EapItemComExecucao
  nivel: number
  valorReferencia: number
  expandidos: Set<number>
  onToggle: (id: number) => void
  onAdicionar: (parentId: number) => void
  onEditar: (item: EapItemBanco) => void
  onExcluir: (item: EapItemBanco) => void
}) {
  const temFilhos = item.filhos.length > 0
  const expandido = expandidos.has(item.id)
  // Peso = valor do item ÷ valor de referência (do pai, ou do total
  // da obra se for uma Fase) — nunca digitado, sempre calculado.
  const peso = valorReferencia > 0 ? (item.valor_orcado / valorReferencia) * 100 : 0
  const somaFilhos = item.filhos.reduce((s, f) => s + f.valor_orcado, 0)

  return (
    <div>
      <div
        className="grid grid-cols-[1fr_130px_90px_100px_110px_100px] gap-2 px-4 py-2.5 border-b border-surface-border/50 hover:bg-surface-hover transition-colors items-center"
        style={{ paddingLeft: `${16 + nivel * 24}px` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {temFilhos ? (
            <button onClick={() => onToggle(item.id)} className="shrink-0 text-gray-500 hover:text-gray-300">
              {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : <span className="w-[14px] shrink-0" />}
          <span className={nivel === 0 ? 'text-sm font-semibold text-white truncate' : 'text-sm text-gray-200 truncate'}>
            {item.nome}
          </span>
        </div>
        <span className="text-sm text-gray-300 text-right font-mono">{formatReais(item.valor_orcado)}</span>
        <span className="text-sm text-brand-400 text-right font-mono">{peso.toFixed(1)}%</span>
        <span className="text-sm text-emerald-400 text-right font-mono">{item.percentualExecutado.toFixed(1)}%</span>
        <span className="text-xs text-gray-500">{item.unidade_medida ?? '—'}</span>
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => onAdicionar(item.id)} title="Adicionar item dentro" className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
            <Plus size={13} />
          </button>
          <button onClick={() => onEditar(item)} title="Editar" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={() => onExcluir(item)} title="Excluir" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {temFilhos && item.valor_orcado > 0 && Math.abs(somaFilhos - item.valor_orcado) > 0.01 && expandido && (
        <p className="text-[11px] text-amber-500 px-4 py-1" style={{ paddingLeft: `${16 + (nivel + 1) * 24}px` }}>
          ⚠ Os itens dentro somam {formatReais(somaFilhos)}, diferente do valor de "{item.nome}" ({formatReais(item.valor_orcado)}).
        </p>
      )}

      {expandido && item.filhos.map(filho => (
        <NoEap
          key={filho.id}
          item={filho}
          nivel={nivel + 1}
          valorReferencia={item.valor_orcado}
          expandidos={expandidos}
          onToggle={onToggle}
          onAdicionar={onAdicionar}
          onEditar={onEditar}
          onExcluir={onExcluir}
        />
      ))}
    </div>
  )
}
