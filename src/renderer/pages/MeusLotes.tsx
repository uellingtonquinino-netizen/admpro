import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { useCurrency }     from '@hooks/useCurrency'
import { useConfirm }      from '@hooks/useConfirm'
import { toast }           from '@components/ui/ToastContainer'
import Badge                from '@components/ui/Badge'
import ConfirmDialog         from '@components/ui/ConfirmDialog'
import { gerarCapaLote, ApCapaItem } from '../documentos/capaLote'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'
import {
  FileWarning, ArrowLeft, FileText, Receipt, Printer, FolderOutput, Trash2,
} from 'lucide-react'

interface Lote {
  id:              number
  titulo:          string
  total_itens:     number
  itens_aprovados: number
  pendente:        boolean
  enviado_em:      string | null
}

interface ApItem {
  id: number
  beneficiario_nome: string; valor_total: number; qtd_boletos: number
  aprovado_supervisor_por: string | null; aprovado_central_por: string | null
}
interface NfItem {
  id: number; fornecedor_nome: string; numero_nf: string | null; valor_total: number
  qtd_boletos: number; aprovado_supervisor_por: string | null; aprovado_central_por: string | null
  nota_pdf_path: string | null; boletos_pdf_path: string | null
}

type View = 'lotes' | 'lote'

// NOVO: o ADM acompanha aqui os lotes que já enviou (AP's e Notas
// Fiscais reunidas pra aprovação do Supervisor) — só visualização e
// os mesmos documentos que o Supervisor/Central geram (capa e
// exportar pasta), sem o botão de autorizar (isso é papel de quem
// está acima na hierarquia).
export default function MeusLotes() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const empresa    = useEmpresaStore(s => s.empresa)
  const usuario    = useAuthStore(s => s.usuario)
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const podeApagarLote = usuario?.permissoes_extras?.includes('apagar-lote')

  const [view, setView] = useState<View>('lotes')
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loadingLotes, setLoadingLotes] = useState(true)

  const [loteAtual, setLoteAtual] = useState<Lote | null>(null)
  const [loteDetalhe, setLoteDetalhe] = useState<{ autorizacoes: ApItem[]; notas_fiscais: NfItem[] } | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [processandoId, setProcessandoId] = useState<number | null>(null)
  const [gerandoExport, setGerandoExport] = useState(false)
  const [gerandoCapa, setGerandoCapa]     = useState(false)
  const [apagandoLote, setApagandoLote]   = useState(false)

  // ALTERADO: essa página é "Lotes Enviados" — só mostra os que já
  // foram mandados pro Supervisor. Os que ainda estão só organizados
  // (Fechar Lote, sem enviar ainda) aparecem direto nas telas de AP
  // e Notas Fiscais, não aqui.
  function carregarLotes() {
    if (!empresaId) return
    setLoadingLotes(true)
    window.api.lotes.listarPorObra(empresaId)
      .then((todos: Lote[]) => setLotes(todos.filter(l => !!l.enviado_em)))
      .finally(() => setLoadingLotes(false))
  }

  useEffect(() => { carregarLotes() }, [empresaId])

  function abrirLote(lote: Lote) {
    setLoteAtual(lote)
    setView('lote')
    setLoadingDetalhe(true)
    window.api.lotes.buscarPorId(lote.id)
      .then(setLoteDetalhe)
      .finally(() => setLoadingDetalhe(false))
  }

  function voltarLotes() {
    setView('lotes')
    carregarLotes()
  }

  async function visualizarAp(item: ApItem) {
    setProcessandoId(item.id)
    try {
      const completa = await window.api.ap.buscarPorId(item.id)
      if (completa.pdf_path) {
        await window.api.documentos.abrirArquivo(completa.pdf_path)
      } else {
        toast.error('Essa AP ainda não tem um PDF pronto pra visualizar.')
      }
    } finally {
      setProcessandoId(null)
    }
  }

  async function visualizarNf(caminho: string | null) {
    if (!caminho) { toast.error('Nenhum arquivo anexado.'); return }
    await window.api.documentos.abrirArquivo(caminho)
  }

  async function handleExportarLote() {
    if (!loteDetalhe) return
    setGerandoExport(true)
    try {
      const arquivos: { origem: string; nomeArquivo: string }[] = []
      for (const a of loteDetalhe.autorizacoes) {
        const completa = await window.api.ap.buscarPorId(a.id)
        if (completa.pdf_path) arquivos.push({ origem: completa.pdf_path, nomeArquivo: `AP ${a.id} - ${a.beneficiario_nome}` })
      }
      for (const n of loteDetalhe.notas_fiscais) {
        if (n.nota_pdf_path) arquivos.push({ origem: n.nota_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Nota` })
        if (n.boletos_pdf_path) arquivos.push({ origem: n.boletos_pdf_path, nomeArquivo: `NF ${n.id} - ${n.fornecedor_nome} - Boletos` })
      }
      if (arquivos.length === 0) { toast.error('Nenhum PDF disponível nesse lote ainda.'); return }

      const resultado = await window.api.documentos.gerarLote(arquivos)
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao exportar o lote.'); return }
      toast.success(`${resultado.copiados} de ${resultado.total} arquivo(s) copiados para a pasta.`)
    } catch {
      toast.error('Erro ao exportar o lote.')
    } finally {
      setGerandoExport(false)
    }
  }

  async function handleGerarCapa() {
    if (!loteAtual) return
    setGerandoCapa(true)
    try {
      const dados = await window.api.lotes.apsParaCapa(loteAtual.id)
      if (dados.length === 0) { toast.error('Nenhuma AP nesse lote ainda.'); return }

      const itens: ApCapaItem[] = dados.map((d: any, i: number) => ({
        numero: i + 1,
        data_emissao: d.created_at,
        nome_razao_social: d.beneficiario_nome,
        documento: d.cnpj ? formatCNPJ(d.cnpj) : (d.cpf ? formatCPF(d.cpf) : ''),
        banco: d.forma_pagamento === 'boleto' ? 'Boleto' : (d.banco ?? ''),
        agencia: d.agencia ?? '',
        operacao: d.operacao ?? '',
        conta: d.conta ? `${d.conta}${d.conta_digito ? '-' + d.conta_digito : ''}` : '',
        descricao: d.descricao ?? '',
        vencimento: d.primeiro_vencimento,
        valor_total: d.valor_total,
      }))

      const html = gerarCapaLote(
        { nome: empresa?.nome ?? '', logo_url: empresa?.logo_url }, loteAtual.titulo, itens, format,
      )
      const resultado = await window.api.documentos.imprimir({ html, nomeArquivo: `Capa - ${loteAtual.titulo}`, landscape: true })
      if (!resultado.ok && !resultado.canceled) toast.error('Erro ao gerar a capa do lote.')
    } catch {
      toast.error('Erro ao gerar a capa do lote.')
    } finally {
      setGerandoCapa(false)
    }
  }

  // NOVO: "Apagar Lote" — some com o lote, mas as AP's/Notas que
  // estavam dentro dele continuam existindo, só voltam a ficar
  // soltas (sem lote).
  async function handleApagarLote() {
    if (!loteAtual) return
    const ok = await confirm({
      title:   'Apagar lote',
      danger:  true,
      message: `Deseja apagar "${loteAtual.titulo}"? As AP's e Notas Fiscais que estão dentro dele NÃO serão excluídas — só voltam a ficar soltas, fora de qualquer lote.`,
    })
    if (!ok) return
    setApagandoLote(true)
    try {
      await window.api.lotes.excluir(loteAtual.id)
      toast.success('Lote apagado.')
      voltarLotes()
    } catch {
      toast.error('Erro ao apagar o lote.')
    } finally {
      setApagandoLote(false)
    }
  }

  // ── Tela 1: lotes ────────────────────────────────────────
  if (view === 'lotes') {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Lotes Enviados</h1>
          <p className="text-sm text-gray-400 mt-0.5">Programações Financeiras já enviadas pra aprovação</p>
        </div>

        {loadingLotes ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 shimmer rounded-xl" />)}</div>
        ) : lotes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum lote enviado ainda.</p>
        ) : (
          <div className="space-y-2">
            {lotes.map(l => (
              <button
                key={l.id}
                onClick={() => abrirLote(l)}
                className="w-full flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3.5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-white">{l.titulo}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{l.itens_aprovados} de {l.total_itens} itens autorizados</p>
                </div>
                {l.pendente ? <Badge color="yellow">Pendente</Badge> : <Badge color="green">Concluído</Badge>}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Tela 2: detalhe do lote (AP's e NF's) — só visualização ──
  return (
    <div>
      <button onClick={voltarLotes} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
        <ArrowLeft size={14} /> Voltar aos lotes
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">{loteAtual?.titulo}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGerarCapa}
            disabled={gerandoCapa || !loteDetalhe}
            className="flex items-center gap-1.5 text-sm text-gray-300 border border-surface-border rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            <FileText size={14} /> {gerandoCapa ? 'Gerando…' : 'Gerar Capa (AP\'s)'}
          </button>
          <button
            onClick={handleExportarLote}
            disabled={gerandoExport || !loteDetalhe}
            className="flex items-center gap-1.5 text-sm text-gray-300 border border-surface-border rounded-lg px-3 py-1.5 hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            <FolderOutput size={14} /> {gerandoExport ? 'Exportando…' : 'Exportar Lote'}
          </button>
          {podeApagarLote && (
            <button
              onClick={handleApagarLote}
              disabled={apagandoLote || !loteDetalhe}
              className="flex items-center gap-1.5 text-sm text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 hover:bg-red-500/10 transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} /> {apagandoLote ? 'Apagando…' : 'Apagar Lote'}
            </button>
          )}
        </div>
      </div>

      {loadingDetalhe || !loteDetalhe ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 shimmer rounded-xl" />)}</div>
      ) : (
        <div className="space-y-8">
          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">Autorizações de Pagamento</p>
            {loteDetalhe.autorizacoes.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma AP nesse lote.</p>
            ) : (
              <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
                {loteDetalhe.autorizacoes.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{a.beneficiario_nome}</p>
                      <p className="text-xs text-gray-500">{format(a.valor_total)} · {a.qtd_boletos} parcela{a.qtd_boletos !== 1 && 's'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.aprovado_central_por ? (
                        <Badge color="green">Aprovado pelo Escritório</Badge>
                      ) : a.aprovado_supervisor_por ? (
                        <Badge color="green">Liberada pelo Supervisor</Badge>
                      ) : (
                        <Badge color="blue">Aguardando Aprovação do Supervisor</Badge>
                      )}
                      <button onClick={() => visualizarAp(a)} disabled={processandoId === a.id} title="Visualizar"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40">
                        <Printer size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">Notas Fiscais</p>
            {loteDetalhe.notas_fiscais.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma nota fiscal nesse lote.</p>
            ) : (
              <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
                {loteDetalhe.notas_fiscais.map(n => (
                  <div key={n.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 last:border-0">
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{n.fornecedor_nome} <span className="text-xs text-gray-500">NF {n.numero_nf ?? '—'}</span></p>
                      <p className="text-xs text-gray-500">{format(n.valor_total)} · {n.qtd_boletos} boleto{n.qtd_boletos !== 1 && 's'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {n.aprovado_central_por ? (
                        <Badge color="green">Aprovado pelo Escritório</Badge>
                      ) : n.aprovado_supervisor_por ? (
                        <Badge color="green">Liberada pelo Supervisor</Badge>
                      ) : (
                        <Badge color="blue">Aguardando Aprovação do Supervisor</Badge>
                      )}
                      <button onClick={() => visualizarNf(n.nota_pdf_path)} disabled={!n.nota_pdf_path} title="Ver Nota"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <FileText size={13} />
                      </button>
                      <button onClick={() => visualizarNf(n.boletos_pdf_path)} disabled={!n.boletos_pdf_path} title="Ver Boleto(s)"
                        className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30">
                        <Receipt size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
