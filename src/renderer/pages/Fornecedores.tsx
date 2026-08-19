import { useEffect, useState, useCallback } from 'react'
import { useLocation }                       from 'react-router-dom'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useDebounce }                       from '@hooks/useDebounce'
import { useConfirm }                        from '@hooks/useConfirm'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import Badge                                 from '@components/ui/Badge'
import Input                                 from '@components/ui/Input'
import { SkeletonTable }                     from '@components/ui/Skeleton'
import EmptyState                            from '@components/ui/EmptyState'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import FornecedorModal                       from '@components/fornecedores/FornecedorModal'
import EmitirAPModal                         from '@components/fornecedores/EmitirAPModal'
import HistoricoAPModal                      from '@components/fornecedores/HistoricoAPModal'
import EmitirReciboModal                     from '@components/fornecedores/EmitirReciboModal'
import { clsx } from 'clsx'
import {
  Plus, Search, Truck, Pencil, Trash2, FileText, History, Receipt,
} from 'lucide-react'

interface Fornecedor {
  id:              number
  nome:            string
  tipo_pessoa:     'pj' | 'pf'
  cnpj:            string | null
  cpf:             string | null
  telefone:        string | null
  categoria:       string | null
  forma_pagamento: string
  ativo:           number
  [key: string]:   unknown
}

export default function Fornecedores() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const location   = useLocation()
  const { confirm, dialogProps } = useConfirm()

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading,      setLoading]      = useState(true)
  const [busca,        setBusca]        = useState('')
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState<Fornecedor | null>(null)
  const [apPara,       setApPara]       = useState<Fornecedor | null>(null)
  const [historicoOpen, setHistoricoOpen] = useState(false)
  const [reciboPara,   setReciboPara]   = useState<Fornecedor | null>(null)

  const buscaDebounced = useDebounce(busca, 400)

  const fetchFornecedores = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.fornecedores.listar({
        empresa_id: empresaId,
        busca:      buscaDebounced || undefined,
      })
      setFornecedores(data)
    } catch {
      toast.error('Erro ao carregar fornecedores.')
    } finally {
      setLoading(false)
    }
  }, [empresaId, buscaDebounced])

  useEffect(() => { fetchFornecedores() }, [fetchFornecedores])

  // NOVO: abre o cadastro automaticamente ao chegar aqui vindo da
  // busca global (Navbar) com um fornecedor específico selecionado.
  useEffect(() => {
    const id = (location.state as { editFornecedorId?: number } | null)?.editFornecedorId
    if (!id) return
    window.api.fornecedores.buscarPorId(id).then(f => {
      if (f) { setEditing(f); setModalOpen(true) }
    })
    window.history.replaceState({}, '')
  }, [location.state])

  function handleNovo() {
    setEditing(null)
    setModalOpen(true)
  }

  function handleEditar(f: Fornecedor) {
    setEditing(f)
    setModalOpen(true)
  }

  async function handleExcluir(f: Fornecedor) {
    const ok = await confirm({
      title:   'Excluir fornecedor',
      message: `Deseja excluir "${f.nome}"? Esta ação não pode ser desfeita.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.fornecedores.excluir(f.id)
      toast.success('Fornecedor excluído.')
      fetchFornecedores()
    } catch {
      toast.error('Erro ao excluir fornecedor.')
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchFornecedores()
  }

  return (
    <div>
      <PageHeader title="Fornecedores" subtitle="Cadastro e Autorizações de Pagamento">
        <Button
          variant="outline"
          icon={<History size={15} />}
          onClick={() => setHistoricoOpen(true)}
        >
          Histórico de AP
        </Button>
        <Button icon={<Plus size={15} />} onClick={handleNovo}>
          Novo fornecedor
        </Button>
      </PageHeader>

      <div className="mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por nome, CNPJ ou CPF…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-72"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : fornecedores.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nenhum fornecedor cadastrado"
          description="Cadastre fornecedores, empreiteiros ou prestadores para começar a emitir Autorizações de Pagamento."
          action={{ label: 'Novo fornecedor', onClick: handleNovo }}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Nome', 'Documento', 'Categoria', 'Pagamento', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center
                                      text-xs font-bold uppercase bg-brand-500/10 text-brand-400">
                        {f.nome.slice(0, 2)}
                      </div>
                      <p className="font-medium text-gray-200">{f.nome}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {f.tipo_pessoa === 'pj' ? (f.cnpj ?? '—') : (f.cpf ?? '—')}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{f.categoria ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge color={f.forma_pagamento === 'boleto' ? 'yellow' : 'blue'}>
                      {f.forma_pagamento === 'boleto' ? 'Boleto' : 'Conta/PIX'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setApPara(f)}
                        title="Emitir Autorização de Pagamento"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors"
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        onClick={() => setReciboPara(f)}
                        title="Emitir recibo de pagamento"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      >
                        <Receipt size={14} />
                      </button>
                      <button
                        onClick={() => handleEditar(f)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleExcluir(f)}
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
        </div>
      )}

      <FornecedorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        fornecedor={editing}
      />

      {apPara && (
        <EmitirAPModal
          onClose={() => setApPara(null)}
          beneficiarioInicial={{ tipo: 'fornecedor', id: apPara.id }}
        />
      )}

      {historicoOpen && (
        <HistoricoAPModal onClose={() => setHistoricoOpen(false)} />
      )}

      {reciboPara && (
        <EmitirReciboModal
          nome={reciboPara.nome}
          documento={reciboPara.tipo_pessoa === 'pj' ? (reciboPara.cnpj ?? '') : (reciboPara.cpf ?? '')}
          onClose={() => setReciboPara(null)}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
