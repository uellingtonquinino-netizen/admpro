import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }   from '@store/empresa.store'
import { useDebounce }       from '@hooks/useDebounce'
import { useConfirm }        from '@hooks/useConfirm'
import { toast }             from '@components/ui/ToastContainer'
import Button                from '@components/ui/Button'
import Input                 from '@components/ui/Input'
import FiltroPeriodo         from '@components/ui/FiltroPeriodo'
import ConfirmDialog         from '@components/ui/ConfirmDialog'
import { SkeletonTable }     from '@components/ui/Skeleton'
import EmptyState            from '@components/ui/EmptyState'
import NovaSaidaModal        from '@components/almoxarifado/NovaSaidaModal'
import { formatDate }        from '@utils/format'
import { gerarHtmlSaidaAlmoxarifado } from '../documentos/saidaAlmoxarifado'
import { nomeExibicaoEmpresa } from '../documentos/base'
import { Search, Plus, Trash2, Printer, PackageMinus as IconVazio } from 'lucide-react'

interface ItemSaida {
  produto_id:     number
  produto_codigo: string
  produto_nome:   string
  quantidade:     number
}

interface Saida {
  id:                number
  data:              string
  itens:             ItemSaida[]
  retirado_por_nome: string
  setor:             string | null
  solicitado_por_nome: string | null
  liberado_por:      string | null
}

// ALTERADO: cada saída agora pode ter vários materiais/ferramentas
// (antes era só um por linha) — a coluna de material mostra um
// resumo de todos os itens da saída.
export default function Saidas() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const { confirm, dialogProps } = useConfirm()

  const [saidas, setSaidas]   = useState<Saida[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca]     = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]       = useState('')
  const [novaOpen, setNovaOpen]     = useState(false)
  const [imprimindoId, setImprimindoId] = useState<number | null>(null)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.almoxarifadoSaidas.listar({
      empresa_id: empresaId,
      busca:      buscaDebounced || undefined,
      dataInicio: dataInicio || undefined,
      dataFim:    dataFim || undefined,
    })
      .then(setSaidas)
      .finally(() => setLoading(false))
  }, [empresaId, buscaDebounced, dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  function resumoItens(s: Saida): string {
    return s.itens.map(it => `${it.produto_nome} (${it.quantidade})`).join(', ')
  }

  // NOVO: reimprime o comprovante de retirada — antes só era possível
  // na hora de registrar a saída, sem opção de imprimir de novo depois.
  async function handleImprimir(s: Saida) {
    if (!empresaId) return
    setImprimindoId(s.id)
    try {
      const empresa = await window.api.empresas.buscarPorId(empresaId)
      const produtos = await Promise.all(s.itens.map(it => window.api.produtos.buscarPorId(it.produto_id)))
      const html = gerarHtmlSaidaAlmoxarifado({
        logoUrl:           empresa.logo_url,
        empresaNome:       nomeExibicaoEmpresa(empresa),
        data:              s.data,
        itens: s.itens.map((it, i) => ({
          produtoCodigo: it.produto_codigo,
          produtoNome:   it.produto_nome,
          quantidade:    it.quantidade,
          unidade:       produtos[i]?.unidade ?? null,
        })),
        retiradoPorNome:   s.retirado_por_nome,
        setor:             s.setor,
        solicitadoPorNome: s.solicitado_por_nome,
        liberadoPor:       s.liberado_por,
      })
      const nomeArquivo = s.itens.length === 1 ? `Retirada - ${s.itens[0].produto_nome}` : `Retirada - ${s.itens.length} itens`
      const result = await window.api.documentos.imprimir({ html, nomeArquivo })
      if (!result.ok) toast.error('Erro ao abrir a impressão.')
    } catch {
      toast.error('Erro ao preparar a impressão.')
    } finally {
      setImprimindoId(null)
    }
  }

  async function handleExcluir(s: Saida) {
    const ok = await confirm({
      title:   'Excluir saída',
      message: `Deseja excluir a retirada de ${resumoItens(s)}? A(s) quantidade(s) volta(m) ao estoque.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.almoxarifadoSaidas.excluir(s.id)
      toast.success('Saída excluída — estoque ajustado.')
      carregar()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Saídas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Retiradas de material/ferramenta do Almoxarifado</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setNovaOpen(true)}>
          Nova Saída
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por material/ferramenta, código ou quem retirou…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px]"
        />
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onBuscar={(inicio, fim) => { setDataInicio(inicio); setDataFim(fim) }}
        />
        {(dataInicio || dataFim) && (
          <Button variant="ghost" size="sm" onClick={() => { setDataInicio(''); setDataFim('') }}>
            Limpar período
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : saidas.length === 0 ? (
        <EmptyState
          icon={IconVazio}
          title="Nenhuma saída registrada"
          description={busca || dataInicio ? 'Ajuste os filtros acima.' : 'Clique em "Nova Saída" para registrar a primeira retirada.'}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Materiais/Ferramentas', 'Retirado por', 'Setor', 'Solicitado por', 'Data', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saidas.map(s => (
                <tr key={s.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 text-gray-200 max-w-[320px]">
                    {resumoItens(s)}
                    {s.itens.length > 1 && <span className="text-xs text-gray-500 ml-1.5">({s.itens.length} itens)</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{s.retirado_por_nome}</td>
                  <td className="px-4 py-3 text-gray-400">{s.setor ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{s.solicitado_por_nome ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(s.data)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => handleImprimir(s)}
                        disabled={imprimindoId === s.id}
                        title="Imprimir"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40"
                      >
                        <Printer size={13} />
                      </button>
                      <button
                        onClick={() => handleExcluir(s)}
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

      {novaOpen && (
        <NovaSaidaModal
          onClose={() => setNovaOpen(false)}
          onSaved={() => { setNovaOpen(false); carregar() }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
