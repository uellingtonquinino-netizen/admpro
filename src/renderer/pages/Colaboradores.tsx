import { useEffect, useState, useCallback } from 'react'
import { useLocation }                       from 'react-router-dom'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useDebounce }                       from '@hooks/useDebounce'
import { useConfirm }                        from '@hooks/useConfirm'
import { toast }                             from '@components/ui/ToastContainer'
import { formatDate }                        from '@utils/format'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import Badge                                 from '@components/ui/Badge'
import Input                                 from '@components/ui/Input'
import Select                                from '@components/ui/Select'
import { SkeletonTable }                     from '@components/ui/Skeleton'
import EmptyState                            from '@components/ui/EmptyState'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import ColaboradorModal                      from '@components/colaboradores/ColaboradorModal'
import GerarDocumentoModal                   from '@components/colaboradores/GerarDocumentoModal'
import EmitirAPModal                         from '@components/fornecedores/EmitirAPModal'
import AcordoCompensacaoModal                from '@components/colaboradores/AcordoCompensacaoModal'
import { clsx }                              from 'clsx'
import {
  Plus, Search, Users, Pencil, Trash2,
  ChevronLeft, ChevronRight, FileText, DollarSign,
  Download, Upload,
} from 'lucide-react'

interface Colaborador {
  id:             number
  nome:           string
  cpf:            string | null
  funcao:         string | null
  setor:          string | null
  equipe:         string | null
  status:         string
  data_admissao:  string | null
  telefone:       string | null
  [key: string]:  unknown
}

interface Filtros {
  busca:  string
  funcao: string
  setor:  string
  equipe: string
  status: string
}

const statusColor: Record<string, 'green' | 'yellow' | 'blue' | 'red' | 'gray'> = {
  ativo:     'green',
  afastado:  'yellow',
  ferias:    'blue',
  desligado: 'red',
}

const statusLabel: Record<string, string> = {
  ativo:     'Ativo',
  afastado:  'Afastado',
  ferias:    'Férias',
  desligado: 'Desligado',
}

const PER_PAGE = 15

export default function Colaboradores() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const location   = useLocation()
  const { confirm, dialogProps } = useConfirm()

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [total,         setTotal]         = useState(0)
  const [page,          setPage]          = useState(1)
  const [loading,       setLoading]       = useState(true)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [editing,       setEditing]       = useState<Colaborador | null>(null)
  const [gerandoDoc,    setGerandoDoc]    = useState<Colaborador | null>(null)
  const [apPara,        setApPara]        = useState<Colaborador | null>(null)
  const [acordoOpen,    setAcordoOpen]    = useState(false)
  const [importando,    setImportando]    = useState(false)

  const [opcoes, setOpcoes] = useState<{ funcoes: string[]; setores: string[]; equipes: string[] }>({
    funcoes: [], setores: [], equipes: [],
  })

  const [filtros, setFiltros] = useState<Filtros>({
    busca: '', funcao: '', setor: '', equipe: '', status: '',
  })

  const buscaDebounced = useDebounce(filtros.busca, 400)
  const totalPages     = Math.ceil(total / PER_PAGE)

  const fetchColaboradores = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.colaboradores.listar({
        empresa_id: empresaId,
        busca:      buscaDebounced || undefined,
        funcao:     filtros.funcao || undefined,
        setor:      filtros.setor || undefined,
        equipe:     filtros.equipe || undefined,
        status:     filtros.status || undefined,
        page, perPage: PER_PAGE,
      })
      setColaboradores(data.items)
      setTotal(data.total)
    } catch {
      toast.error('Erro ao carregar colaboradores.')
    } finally {
      setLoading(false)
    }
  }, [empresaId, buscaDebounced, filtros.funcao, filtros.setor, filtros.equipe, filtros.status, page])

  useEffect(() => { fetchColaboradores() }, [fetchColaboradores])

  // NOVO: abre o cadastro automaticamente ao chegar aqui vindo da
  // busca global (Navbar) com um colaborador específico selecionado.
  useEffect(() => {
    const id = (location.state as { editColaboradorId?: number } | null)?.editColaboradorId
    if (!id) return
    window.api.colaboradores.buscarPorId(id).then(c => {
      if (c) { setEditing(c); setModalOpen(true) }
    })
    window.history.replaceState({}, '')
  }, [location.state])

  useEffect(() => {
    if (!empresaId) return
    window.api.colaboradores.opcoesFiltro(empresaId).then(setOpcoes)
  }, [empresaId])

  useEffect(() => { setPage(1) }, [buscaDebounced, filtros.funcao, filtros.setor, filtros.equipe, filtros.status])

  function handleNovo() {
    setEditing(null)
    setModalOpen(true)
  }

  async function handleBaixarModelo() {
    try {
      const result = await window.api.importacao.gerarModeloColaboradores()
      if (result.ok) toast.success('Modelo salvo.')
    } catch {
      toast.error('Erro ao gerar o modelo.')
    }
  }

  async function handleImportar() {
    if (!empresaId) return
    setImportando(true)
    try {
      const result = await window.api.importacao.importarColaboradores({ empresa_id: empresaId })
      if (result.canceled) return
      if (result.ok) {
        toast.success(
          `Importação concluída: ${result.criados} novo(s), ${result.atualizados} atualizado(s)` +
          (result.ignorados ? `, ${result.ignorados} linha(s) sem nome ignorada(s)` : '') + '.'
        )
        fetchColaboradores()
      } else {
        toast.error('Erro ao importar a planilha.')
      }
    } catch {
      toast.error('Erro ao importar a planilha.')
    } finally {
      setImportando(false)
    }
  }

  function handleEditar(c: Colaborador) {
    setEditing(c)
    setModalOpen(true)
  }

  async function handleExcluir(c: Colaborador) {
    const ok = await confirm({
      title:   'Excluir colaborador',
      message: `Deseja excluir "${c.nome}"? Esta ação não pode ser desfeita.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.colaboradores.excluir(c.id)
      toast.success('Colaborador excluído.')
      fetchColaboradores()
    } catch {
      toast.error('Erro ao excluir colaborador.')
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchColaboradores()
    if (empresaId) window.api.colaboradores.opcoesFiltro(empresaId).then(setOpcoes)
  }

  return (
    <div>
      <PageHeader title="Colaboradores" subtitle="Cadastro e documentos de RH">
        <Button
          variant="outline"
          icon={<Users size={15} />}
          onClick={() => setAcordoOpen(true)}
        >
          Acordo de Compensação
        </Button>
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
          Novo colaborador
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por nome, CPF ou função…"
          value={filtros.busca}
          onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
          className="w-64"
        />
        <Select
          value={filtros.funcao}
          onChange={e => setFiltros(f => ({ ...f, funcao: e.target.value }))}
          options={[{ value: '', label: 'Todas as funções' }, ...opcoes.funcoes.map(v => ({ value: v, label: v }))]}
          className="w-44"
        />
        <Select
          value={filtros.setor}
          onChange={e => setFiltros(f => ({ ...f, setor: e.target.value }))}
          options={[{ value: '', label: 'Todos os setores' }, ...opcoes.setores.map(v => ({ value: v, label: v }))]}
          className="w-40"
        />
        <Select
          value={filtros.equipe}
          onChange={e => setFiltros(f => ({ ...f, equipe: e.target.value }))}
          options={[{ value: '', label: 'Todas as equipes' }, ...opcoes.equipes.map(v => ({ value: v, label: v }))]}
          className="w-40"
        />
        <Select
          value={filtros.status}
          onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}
          options={[
            { value: '', label: 'Todos os status' },
            { value: 'ativo', label: 'Ativo' },
            { value: 'afastado', label: 'Afastado' },
            { value: 'ferias', label: 'Férias' },
            { value: 'desligado', label: 'Desligado' },
          ]}
          className="w-40"
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : colaboradores.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum colaborador encontrado"
          description="Cadastre o primeiro colaborador da obra para começar."
          action={{ label: 'Novo colaborador', onClick: handleNovo }}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Nome', 'Função', 'Setor', 'Equipe', 'Admissão', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colaboradores.map(c => (
                <tr key={c.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center',
                        'text-xs font-bold uppercase bg-brand-500/10 text-brand-400'
                      )}>
                        {c.nome.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-200">{c.nome}</p>
                        {c.cpf && <p className="text-xs text-gray-500">{c.cpf}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{c.funcao ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.setor ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{c.equipe ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.data_admissao ? formatDate(c.data_admissao) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColor[c.status] ?? 'gray'}>
                      {statusLabel[c.status] ?? c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setApPara(c)}
                        title="Emitir Autorização de Pagamento"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      >
                        <DollarSign size={14} />
                      </button>
                      <button
                        onClick={() => setGerandoDoc(c)}
                        title="Gerar documento"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        onClick={() => handleEditar(c)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleExcluir(c)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
              <p className="text-xs text-gray-500">
                {total} colaborador{total !== 1 && 'es'} · página {page} de {totalPages}
              </p>
              <div className="flex gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      <ColaboradorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        onRefresh={fetchColaboradores}
        colaborador={editing}
      />

      {gerandoDoc && (
        <GerarDocumentoModal
          colaborador={gerandoDoc}
          onClose={() => setGerandoDoc(null)}
        />
      )}

      {apPara && (
        <EmitirAPModal
          onClose={() => setApPara(null)}
          beneficiarioInicial={{ tipo: 'colaborador', id: apPara.id }}
        />
      )}

      {acordoOpen && (
        <AcordoCompensacaoModal onClose={() => setAcordoOpen(false)} />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
