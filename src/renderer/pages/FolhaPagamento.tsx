import { useEffect, useState, useCallback } from 'react'
import { useNavigate }          from 'react-router-dom'
import { useEmpresaStore }      from '@store/empresa.store'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import PageHeader               from '@components/layout/PageHeader'
import Button                   from '@components/ui/Button'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import { Plus, Pencil, Trash2, FileSpreadsheet, Download } from 'lucide-react'

interface FolhaResumo {
  id: number
  mes_competencia: string
  criado_por: string | null
  created_at: string
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatCompetencia(mesCompetencia: string): string {
  const [ano, mes] = mesCompetencia.split('-')
  return `${MESES[Number(mes) - 1]} de ${ano}`
}

// NOVO: painel de Folha de Pagamento — cada folha é de um mês/ano,
// preenchida num painel parecido com a planilha Excel que a empresa
// já usa hoje, com exportação pro mesmo formato que o programa de
// folha deles já sabe importar.
export default function FolhaPagamento() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const navigate   = useNavigate()
  const { confirm, dialogProps } = useConfirm()

  const [folhas, setFolhas]   = useState<FolhaResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [exportandoId, setExportandoId] = useState<number | null>(null)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.folhaPagamento.listar(empresaId)
      .then(setFolhas)
      .finally(() => setLoading(false))
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])

  async function handleExcluir(f: FolhaResumo) {
    const ok = await confirm({
      title:   'Excluir Folha de Pagamento',
      message: `Deseja excluir a folha de ${formatCompetencia(f.mes_competencia)}? Esta ação não pode ser desfeita.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.folhaPagamento.excluir(f.id)
      toast.success('Folha excluída.')
      carregar()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  async function handleExportar(f: FolhaResumo) {
    setExportandoId(f.id)
    try {
      const resultado = await window.api.folhaPagamento.exportarExcel(f.id)
      if (resultado.canceled) return
      if (resultado.ok) toast.success('Planilha exportada.')
      else toast.error(resultado.erro || 'Erro ao exportar a planilha.')
    } catch {
      toast.error('Erro ao exportar a planilha.')
    } finally {
      setExportandoId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Folha de Pagamento" subtitle="Preencha e exporte os valores pra elaboração da folha">
        <Button icon={<Plus size={15} />} onClick={() => navigate('/folha-pagamento/nova')}>
          Nova Folha
        </Button>
      </PageHeader>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : folhas.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Nenhuma folha criada ainda"
          description='Clique em "Nova Folha" para começar.'
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Competência', 'Criado por', 'Criado em', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {folhas.map(f => (
                <tr key={f.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-200 font-medium">{formatCompetencia(f.mes_competencia)}</td>
                  <td className="px-4 py-3 text-gray-400">{f.criado_por ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(f.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleExportar(f)}
                        disabled={exportandoId === f.id}
                        title="Exportar Excel"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => navigate(`/folha-pagamento/${f.id}`)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleExcluir(f)}
                        title="Excluir"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
