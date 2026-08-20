import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { useAuthStore }         from '@store/auth.store'
import { useFiltrosPeriodoStore } from '@store/filtrosPeriodo.store'
import { useDebounce }          from '@hooks/useDebounce'
import { useCurrency }          from '@hooks/useCurrency'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import { formatDate }           from '@utils/format'
import Button                   from '@components/ui/Button'
import Badge                    from '@components/ui/Badge'
import Input                    from '@components/ui/Input'
import FiltroPeriodo            from '@components/ui/FiltroPeriodo'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import NotaFiscalModal          from '@components/lancamentos/NotaFiscalModal'
import { gerarCapaNotasFiscais, NfCapaItem } from '../documentos/capaNotasFiscais'
import { Plus, Search, Receipt, Pencil, Trash2, FileText, CheckCircle2, Archive, Send, Wallet, Users, FolderClosed, FolderMinus, ChevronDown, ChevronUp } from 'lucide-react'

interface NotaFiscal {
  id:               number
  numero_pedido:    string | null
  data:             string
  numero_nf:        string | null
  fornecedor_nome:  string
  valor_total:      number
  qtd_boletos:      number
  nota_pdf_path:    string | null
  boletos_pdf_path: string | null
  aprovado_por:     string | null
  aprovado_em:      string | null
  aprovado_supervisor_por: string | null
  aprovado_central_por: string | null
  lote_id:          number | null
}

// NOVO: um lote "aberto" dessa obra (fechado pelo ADM, ainda não
// mandado pro Supervisor) — agora pode existir mais de um ao mesmo
// tempo, cada um com seu número (Lote 01, Lote 02...).
interface LoteAberto {
  id:            number
  numero:        number
  titulo:        string
  total_itens:   number
  nao_aprovados: number
}

// ALTERADO: segue o mesmo padrão da Autorização de Pagamento — sem
// gerar documento nenhum (a nota é física, escaneada); visualiza os
// PDFs anexados (nota e boleto, separados), segue o mesmo fluxo de
// aprovação do Gestor, e agora também tem filtro por período e
// geração de lote (copia os PDFs das notas selecionadas pra uma
// pasta, prontos pro financeiro).
export default function NotasFiscais() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const usuario    = useAuthStore(s => s.usuario)
  const somenteLeitura = usuario?.perfil === 'gestor'
  // NOVO: por padrão só o Gestor aprova — ADM só se o Master tiver
  // marcado a permissão extra "aprovar-documentos" pra ele.
  const podeAprovar = usuario?.perfil !== 'admin' || !!usuario?.permissoes_extras?.includes('aprovar-documentos')
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [notas, setNotas]     = useState<NotaFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca]     = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando]   = useState<any | null>(null)
  const [abrindoId, setAbrindoId] = useState<number | null>(null)
  const [autorizandoId, setAutorizandoId] = useState<number | null>(null)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [gerandoLote, setGerandoLote]   = useState(false)
  const [gerandoCapa, setGerandoCapa]   = useState(false)
  const [resumo, setResumo] = useState<{ total: number; valorTotal: number; porFornecedor: { nome: string; total: number }[] } | null>(null)

  // ALTERADO: agora pode ter vários lotes abertos ao mesmo tempo
  // (cada "Fechar Lote" cria um novo, numerado).
  const [lotesAbertos, setLotesAbertos] = useState<LoteAberto[]>([])
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<number>>(new Set())
  const [fechandoLote, setFechandoLote]   = useState(false)
  const [enviandoLoteId, setEnviandoLoteId] = useState<number | null>(null)
  const [tirandoDoLoteId, setTirandoDoLoteId] = useState<number | null>(null)
  const [loteDestino, setLoteDestino]     = useState('')
  const [enviandoParaLote, setEnviandoParaLote] = useState(false)

  const filtroNfSalvo    = useFiltrosPeriodoStore(s => s.notasFiscais)
  const setFiltroNfSalvo = useFiltrosPeriodoStore(s => s.setFiltroNotasFiscais)
  const [dataInicio, setDataInicio] = useState(filtroNfSalvo.dataInicio)
  const [dataFim, setDataFim] = useState(filtroNfSalvo.dataFim)

  const buscaDebounced = useDebounce(busca, 350)

  const fetchNotas = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.notasFiscais.listar({
        empresa_id: empresaId,
        busca:      buscaDebounced || undefined,
        dataInicio: dataInicio || undefined,
        dataFim:    dataFim || undefined,
      })
      setNotas(data)
    } catch (erro) {
      console.error('Erro ao carregar as notas fiscais.', erro)
      toast.error(`Erro ao carregar as notas fiscais: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setLoading(false)
    }
  }, [empresaId, buscaDebounced, dataInicio, dataFim])

  useEffect(() => { fetchNotas() }, [fetchNotas])
  useEffect(() => { setSelecionados(new Set()) }, [buscaDebounced, dataInicio, dataFim])

  const carregarResumo = useCallback(() => {
    if (!empresaId) return
    window.api.notasFiscais.resumo({ empresa_id: empresaId, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }).then(setResumo)
  }, [empresaId, dataInicio, dataFim])
  useEffect(() => { carregarResumo() }, [carregarResumo])

  // ALTERADO: agora usa o endpoint dedicado (pode ter mais de um
  // lote aberto por vez).
  const carregarLotesAbertos = useCallback(() => {
    if (!empresaId) return
    window.api.lotes.listarAbertos(empresaId).then(setLotesAbertos)
  }, [empresaId])
  useEffect(() => { carregarLotesAbertos() }, [carregarLotesAbertos])

  // ALTERADO: "solto" é quem não está em nenhum lote aberto (nem em
  // algum já enviado).
  const idsLotesAbertos = new Set(lotesAbertos.map(l => l.id))
  const itensSoltos = notas.filter(n => !n.lote_id || !idsLotesAbertos.has(n.lote_id))

  function alternarSelecao(id: number) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      return novo
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados(prev =>
      prev.size === itensSoltos.length ? new Set() : new Set(itensSoltos.map(n => n.id))
    )
  }

  function handleNova() {
    setEditando(null)
    setModalOpen(true)
  }

  async function handleEditar(n: NotaFiscal) {
    const completa = await window.api.notasFiscais.buscarPorId(n.id)
    setEditando(completa)
    setModalOpen(true)
  }

  async function handleExcluir(n: NotaFiscal) {
    const ok = await confirm({
      title:   'Excluir nota fiscal',
      message: `Deseja excluir a NF ${n.numero_nf ?? ''} de "${n.fornecedor_nome}"? A despesa lançada no Financeiro também será removida.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.notasFiscais.excluir(n.id)
      toast.success('Nota fiscal excluída.')
      fetchNotas()
      carregarResumo()
      carregarLotesAbertos()
    } catch (erro) {
      console.error('Erro ao excluir.', erro)
      toast.error(`Erro ao excluir: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
  }

  // NOVO: abre o PDF já pronto (nota escaneada, ou boleto) no leitor
  // padrão — nada é gerado aqui, só abre o que já foi salvo.
  // CORRIGIDO: a aprovação (Gestor, Supervisor ou Central) limpa
  // nota_pdf_path de propósito no banco (mesmo princípio da AP —
  // evita reaproveitar um PDF gerado ANTES da aprovação, sem o
  // carimbo certo). Só que, diferente da AP, essa tela nunca sabia
  // REGERAR quando encontrava vazio — só mostrava "Nenhum arquivo
  // anexado", mesmo a nota estando aprovada e com o anexo original
  // ainda lá. Agora, pra categoria "nota" especificamente, se estiver
  // vazio E a NF já tiver sido aprovada, gera de novo (com carimbo)
  // antes de abrir — só falha de verdade se não tiver anexo nenhum.
  async function handleAbrirPdf(caminho: string | null, id: number, categoria: 'nota' | 'boleto' = 'boleto') {
    setAbrindoId(id)
    try {
      let caminhoFinal = caminho
      if (!caminhoFinal && categoria === 'nota') {
        const completa = await window.api.notasFiscais.buscarPorId(id)
        if (!completa?.anexos_nota?.length) { toast.error('Nenhum arquivo anexado nessa categoria.'); return }

        const resultado = await window.api.documentos.gerarPdfsSeparados({
          notaArquivos: completa.anexos_nota, boletoArquivos: [], pastaId: `NF_${id}`, empresa_id: empresaId ?? undefined,
        })
        if (!resultado.ok || !resultado.notaPdfPath) { toast.error('Erro ao gerar o arquivo da nota.'); return }

        if (completa.aprovado_por && completa.aprovado_em) {
          await window.api.documentos.carimbarPrimeiraPagina({
            caminhoPdf: resultado.notaPdfPath, aprovadoPor: completa.aprovado_por, aprovadoEm: completa.aprovado_em,
            carimboBase64: completa.aprovado_por_carimbo_url ?? null, posicao: 'inferior-esquerdo', tamanho: 'pequeno',
          })
        }

        await window.api.notasFiscais.salvarCaminhosPdf({ id, nota_pdf_path: resultado.notaPdfPath, boletos_pdf_path: null })
        caminhoFinal = resultado.notaPdfPath
        fetchNotas() // atualiza a lista, pro botão já vir habilitado da próxima vez
      }
      if (!caminhoFinal) { toast.error('Nenhum arquivo anexado nessa categoria.'); return }

      const resultado = await window.api.documentos.abrirArquivo(caminhoFinal)
      if (!resultado.ok) toast.error('Não foi possível abrir o arquivo. Ele pode ter sido movido ou apagado.')
    } catch (erro) {
      console.error('Erro ao abrir o PDF.', erro)
      toast.error(`Erro ao abrir o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setAbrindoId(null)
    }
  }

  // NOVO: autoriza a Nota Fiscal — mesmo fluxo da AP.
  async function handleAutorizar(n: NotaFiscal) {
    if (!usuario) return
    setAutorizandoId(n.id)
    try {
      await window.api.notasFiscais.aprovar({ id: n.id, aprovado_por: usuario.nome, usuario_id: usuario.id })

      // ALTERADO: não carimba mais aqui — a aprovação já limpa
      // nota_pdf_path no banco (de propósito), então qualquer PDF
      // carimbado nesse momento ficaria "órfão" (o banco não aponta
      // mais pra ele). O carimbo agora acontece sob demanda, só
      // quando alguém realmente for VER a nota (ver handleAbrirPdf).

      toast.success('Nota Fiscal autorizada.')
      fetchNotas()
    } catch (erro) {
      console.error('Erro ao autorizar a nota fiscal.', erro)
      toast.error(`Erro ao autorizar a nota fiscal: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setAutorizandoId(null)
    }
  }

  // NOVO: gera o lote — copia os PDFs (nota e boleto, os que
  // existirem) de cada NF selecionada pra uma pasta escolhida na
  // hora, prontos pro financeiro. Mesma ideia da AP.
  async function handleGerarLote() {
    if (selecionados.size === 0) return
    setGerandoLote(true)
    try {
      const arquivos: { origem: string; nomeArquivo: string }[] = []

      for (const id of selecionados) {
        const n = notas.find(x => x.id === id)
        if (!n) continue
        if (n.nota_pdf_path) {
          arquivos.push({ origem: n.nota_pdf_path, nomeArquivo: `NF ${id} - ${n.fornecedor_nome} - Nota` })
        }
        if (n.boletos_pdf_path) {
          arquivos.push({ origem: n.boletos_pdf_path, nomeArquivo: `NF ${id} - ${n.fornecedor_nome} - Boletos` })
        }
      }

      if (arquivos.length === 0) {
        toast.error('Nenhuma das notas selecionadas tem PDF anexado ainda.')
        return
      }

      const resultado = await window.api.documentos.gerarLote(arquivos)
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao gerar o lote.'); return }

      toast.success(`${resultado.copiados} de ${resultado.total} arquivo(s) copiados para a pasta.`)
      setSelecionados(new Set())
    } catch (erro) {
      console.error('Erro ao gerar o lote.', erro)
      toast.error(`Erro ao gerar o lote: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setGerandoLote(false)
    }
  }

  // NOVO: gera a "capa" das Notas Fiscais selecionadas — mesma ideia
  // da capa de AP: uma planilha com todas as notas e o total geral no
  // final. A "Emissão" que aparece aqui é a Emissão da NF (o segundo
  // campo de data do modal) — as parcelas são as mesmas lançadas na
  // gravação da nota; quando tem menos de 4, as colunas extras ficam
  // em branco.
  async function handleGerarCapa() {
    if (!empresaId || selecionados.size === 0) return
    setGerandoCapa(true)
    try {
      const dados = await window.api.notasFiscais.capaPorIds(Array.from(selecionados))
      if (dados.length === 0) { toast.error('Não foi possível carregar as notas selecionadas.'); return }

      const itens: NfCapaItem[] = dados.map((d: any, i: number) => ({
        numero:          i + 1,
        numero_pedido:   d.numero_pedido ?? '',
        numero_nf:       d.numero_nf ?? '',
        data_emissao_nf: d.data_emissao_nf,
        fornecedor_nome: d.fornecedor_nome,
        parcelas:        d.boletos.map((b: { valor: number; vencimento: string }) => b),
        valor_total:     d.valor_total,
      }))

      const empresaAtual = await window.api.empresas.buscarPorId(empresaId)
      const titulo = `PROTOCOLO DE NOTAS FISCAIS de ${formatDate(dataInicio)} a ${formatDate(dataFim)}`
      const html = gerarCapaNotasFiscais(
        { nome: empresaAtual.nome, logo_url: empresaAtual.logo_url }, titulo, itens, format,
      )
      const resultado = await window.api.documentos.imprimir({ html, nomeArquivo: titulo, landscape: true })
      if (!resultado.ok && !resultado.canceled) toast.error('Erro ao gerar a capa.')
    } catch (erro) {
      console.error('Erro ao gerar a capa.', erro)
      toast.error(`Erro ao gerar a capa: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setGerandoCapa(false)
    }
  }

  // NOVO: "Fechar Lote" — só organiza as Notas selecionadas junto do
  // lote aberto dessa obra (cria um se ainda não tiver nenhum). Não
  // manda pro Supervisor ainda — isso é um passo separado.
  async function handleFecharLote() {
    if (!empresaId || selecionados.size === 0) return
    const podeFecharSemAutorizar = usuario?.permissoes_extras?.includes('fechar-lote-nao-autorizado')
    if (!podeFecharSemAutorizar) {
      const semAutorizar = notas.filter(n => selecionados.has(n.id) && !n.aprovado_por)
      if (semAutorizar.length > 0) {
        toast.error('Uma ou mais Notas Fiscais selecionadas ainda não foram autorizadas.')
        return
      }
    }
    setFechandoLote(true)
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresaId)
      const { titulo } = await window.api.lotes.fecharLote({
        empresa_id:   empresaId,
        empresa_nome: empresaAtual.nome,
        criado_por:   usuario?.nome ?? null,
        usuario_id:   usuario?.id ?? null,
        ap_ids:       [],
        nf_ids:       Array.from(selecionados),
      })
      toast.success(`Lote organizado: ${titulo}`)
      setSelecionados(new Set())
      fetchNotas()
      carregarLotesAbertos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao fechar o lote.')
    } finally {
      setFechandoLote(false)
    }
  }

  // NOVO: manda o lote já fechado pro Supervisor.
  // NOVO: pede confirmação antes — estava enviando direto no clique,
  // sem chance de desfazer/conferir antes (mesma correção da AP).
  async function handleEnviarLote(loteId: number) {
    const ok = await confirm({
      title:   'Enviar lote para o Supervisor',
      message: 'Deseja enviar este lote para aprovação do Supervisor? Depois de enviado, ele sai daqui e entra no fluxo normal de aprovação.',
    })
    if (!ok) return

    setEnviandoLoteId(loteId)
    try {
      await window.api.lotes.enviarParaSupervisor({ lote_ids: [loteId] })
      toast.success('Lote enviado ao Supervisor.')
      fetchNotas()
      carregarLotesAbertos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o lote.')
    } finally {
      setEnviandoLoteId(null)
    }
  }

  // NOVO: "Enviar para o Lote" — junta as Notas selecionadas a um
  // lote já existente (escolhido no seletor), em vez de criar um novo.
  async function handleEnviarParaLote() {
    if (!empresaId || selecionados.size === 0 || !loteDestino) return
    const podeSemAutorizar = usuario?.permissoes_extras?.includes('fechar-lote-nao-autorizado')
    if (!podeSemAutorizar) {
      const semAutorizar = notas.filter(n => selecionados.has(n.id) && !n.aprovado_por)
      if (semAutorizar.length > 0) {
        toast.error('Uma ou mais Notas Fiscais selecionadas ainda não foram autorizadas.')
        return
      }
    }
    setEnviandoParaLote(true)
    try {
      await window.api.lotes.adicionarAoLote({
        lote_id:    Number(loteDestino),
        usuario_id: usuario?.id ?? null,
        ap_ids:     [],
        nf_ids:     Array.from(selecionados),
      })
      toast.success('Adicionado ao lote.')
      setSelecionados(new Set())
      setLoteDestino('')
      fetchNotas()
      carregarLotesAbertos()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar ao lote.')
    } finally {
      setEnviandoParaLote(false)
    }
  }

  // NOVO: "Tirar do Lote" — remove uma Nota do lote em que está. Se
  // era a última, o lote deixa de existir (backend já cuida disso).
  async function handleTirarDoLote(n: NotaFiscal) {
    setTirandoDoLoteId(n.id)
    try {
      await window.api.lotes.tirarDoLote({ item_tipo: 'nf', item_id: n.id })
      toast.success('Retirado do lote.')
      fetchNotas()
      carregarLotesAbertos()
    } catch (erro) {
      console.error('Erro ao tirar do lote.', erro)
      toast.error(`Erro ao tirar do lote: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setTirandoDoLoteId(null)
    }
  }

  function handleSaved() {
    setModalOpen(false)
    fetchNotas()
    carregarResumo()
    carregarLotesAbertos()
  }

  // NOVO: uma linha da tabela, reaproveitada tanto na lista solta
  // quanto dentro do card do lote aberto.
  function renderLinha(n: NotaFiscal, comCheckbox: boolean) {
    const noLoteAbertoAgora = !!n.lote_id && idsLotesAbertos.has(n.lote_id)

    return (
      <tr key={n.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
        <td className="px-4 py-3">
          {comCheckbox && (
            <input
              type="checkbox"
              checked={selecionados.has(n.id)}
              onChange={() => alternarSelecao(n.id)}
              className="accent-brand-500"
            />
          )}
        </td>
        <td className="px-4 py-3 text-gray-400">{formatDate(n.data)}</td>
        <td className="px-4 py-3 text-gray-200 font-medium">{n.fornecedor_nome}</td>
        <td className="px-4 py-3 text-gray-400">{n.numero_nf ?? '—'}</td>
        <td className="px-4 py-3 text-gray-400">{n.numero_pedido ?? '—'}</td>
        <td className="px-4 py-3 text-gray-400">{n.qtd_boletos}</td>
        <td className="px-4 py-3 text-gray-200 font-medium">{format(n.valor_total)}</td>
        <td className="px-4 py-3">
          {noLoteAbertoAgora ? (
            <Badge color="blue">No lote — não enviado</Badge>
          ) : n.lote_id ? (
            n.aprovado_central_por ? (
              <Badge color="green">Aprovado pelo Escritório</Badge>
            ) : n.aprovado_supervisor_por ? (
              <Badge color="green">Liberada pelo Supervisor</Badge>
            ) : (
              <Badge color="blue">Aguardando Aprovação do Supervisor</Badge>
            )
          ) : n.aprovado_por ? (
            <Badge color="green">Aprovado</Badge>
          ) : (
            <Badge color="yellow">Pendente</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => handleAbrirPdf(n.nota_pdf_path, n.id, 'nota')}
              disabled={abrindoId === n.id}
              title="Ver Nota Fiscal"
              className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30"
            >
              <FileText size={13} />
            </button>
            <button
              onClick={() => handleAbrirPdf(n.boletos_pdf_path, n.id)}
              disabled={abrindoId === n.id || !n.boletos_pdf_path}
              title={n.boletos_pdf_path ? 'Ver Boleto(s)' : 'Nenhum boleto anexado'}
              className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-30"
            >
              <Receipt size={13} />
            </button>
            {!n.aprovado_por && podeAprovar && (
              <button
                onClick={() => handleAutorizar(n)}
                disabled={autorizandoId === n.id}
                title="Autorizar"
                className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
              >
                <CheckCircle2 size={13} />
              </button>
            )}
            {!somenteLeitura && noLoteAbertoAgora && (
              <button
                onClick={() => handleTirarDoLote(n)}
                disabled={tirandoDoLoteId === n.id}
                title="Tirar do lote"
                className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              >
                <FolderMinus size={13} />
              </button>
            )}
            {!somenteLeitura && (
              <>
                <button
                  onClick={() => handleEditar(n)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleExcluir(n)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Notas Fiscais</h1>
            <p className="text-sm text-gray-400 mt-0.5">Lançamento de notas com um ou mais boletos</p>
          </div>
          <FiltroPeriodo
            dataInicio={dataInicio}
            dataFim={dataFim}
            onBuscar={(inicio, fim) => {
              setDataInicio(inicio); setDataFim(fim)
              setFiltroNfSalvo({ dataInicio: inicio, dataFim: fim })
            }}
            className="ml-2"
          />
        </div>
        <div className="flex items-center gap-2">
          {selecionados.size > 0 && (
            <Button variant="outline" icon={<FileText size={15} />} onClick={handleGerarCapa} loading={gerandoCapa}>
              Gerar Capa ({selecionados.size})
            </Button>
          )}
          {selecionados.size > 0 && (
            <Button variant="outline" icon={<Archive size={15} />} onClick={handleGerarLote} loading={gerandoLote}>
              Gerar Lote ({selecionados.size})
            </Button>
          )}
          {!somenteLeitura && selecionados.size > 0 && (
            <Button variant="outline" icon={<FolderClosed size={15} />} onClick={handleFecharLote} loading={fechandoLote}>
              Fechar Lote ({selecionados.size})
            </Button>
          )}
          {!somenteLeitura && selecionados.size > 0 && lotesAbertos.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={loteDestino}
                onChange={e => setLoteDestino(e.target.value)}
                className="input !py-2 !text-sm !w-auto"
              >
                <option value="">Enviar para o lote…</option>
                {lotesAbertos.map(l => (
                  <option key={l.id} value={l.id}>{l.titulo} ({l.total_itens} {l.total_itens === 1 ? 'item' : 'itens'})</option>
                ))}
              </select>
              <Button variant="outline" size="sm" disabled={!loteDestino} onClick={handleEnviarParaLote} loading={enviandoParaLote}>
                Enviar
              </Button>
            </div>
          )}
          {!somenteLeitura && (
            <Button icon={<Plus size={15} />} onClick={handleNova}>
              Nova nota
            </Button>
          )}
        </div>
      </div>

      {/* Cards de resumo — mesmo padrão da Autorização de Pagamento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <Receipt size={15} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Total de Notas Fiscais</p>
          <p className="text-2xl font-bold text-white">{resumo?.total ?? '—'}</p>
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Wallet size={15} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Total em R$</p>
          <p className="text-2xl font-bold text-emerald-400">
            {resumo ? format(resumo.valorTotal) : '—'}
          </p>
        </div>

        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
              <Users size={15} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-2">Total por Fornecedor</p>
          {!resumo || resumo.porFornecedor.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhuma nota fiscal lançada ainda.</p>
          ) : (
            <div className="space-y-1 max-h-[84px] overflow-y-auto pr-1">
              {resumo.porFornecedor.map(f => (
                <p key={f.nome} className="text-xs text-gray-300 flex justify-between gap-2">
                  <span className="truncate">{f.nome}</span>
                  <span className="text-purple-300 font-medium shrink-0">{format(f.total)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ALTERADO: agora pode ter vários lotes abertos ao mesmo tempo
          — cada um organizado pelo ADM (Fechar Lote / Enviar para o
          Lote), ainda não mandado pro Supervisor. */}
      {lotesAbertos.map(lote => {
        const itensDesseLote = notas.filter(n => n.lote_id === lote.id)
        if (itensDesseLote.length === 0) return null
        const expandido = lotesExpandidos.has(lote.id)
        return (
          <div key={lote.id} className="bg-brand-500/5 border border-brand-500/30 rounded-xl mb-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                onClick={() => setLotesExpandidos(prev => {
                  const novo = new Set(prev)
                  novo.has(lote.id) ? novo.delete(lote.id) : novo.add(lote.id)
                  return novo
                })}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
              >
                {expandido ? <ChevronUp size={15} className="text-brand-400 shrink-0" /> : <ChevronDown size={15} className="text-brand-400 shrink-0" />}
                <FolderClosed size={15} className="text-brand-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{lote.titulo}</p>
                    {lote.nao_aprovados === 0 ? (
                      <Badge color="green">Concluído</Badge>
                    ) : (
                      <Badge color="yellow">Há documento{lote.nao_aprovados !== 1 && 's'} para autorizar</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {itensDesseLote.length} nota{itensDesseLote.length !== 1 && 's'} organizada{itensDesseLote.length !== 1 && 's'} — ainda não enviado ao Supervisor
                  </p>
                </div>
              </button>
              {!somenteLeitura && (
                <Button size="sm" icon={<Send size={13} />} onClick={() => handleEnviarLote(lote.id)} loading={enviandoLoteId === lote.id}>
                  Enviar para Supervisor
                </Button>
              )}
            </div>
            {expandido && (
              <div className="border-t border-brand-500/20 overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {itensDesseLote.map(n => renderLinha(n, false))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      <div className="mb-4">
        <Input
          icon={<Search size={14} />}
          placeholder="Buscar por fornecedor, N° da NF ou N° do pedido…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="w-80"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : itensSoltos.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma nota fiscal lançada"
          description="Ao lançar uma nota, o valor total já entra automaticamente nas despesas do mês correspondente."
          action={somenteLeitura ? undefined : { label: 'Nova nota', onClick: handleNova }}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="px-4 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={itensSoltos.length > 0 && selecionados.size === itensSoltos.length}
                    onChange={alternarSelecionarTodos}
                    className="accent-brand-500"
                  />
                </th>
                {['Data', 'Fornecedor', 'N° NF', 'N° Pedido', 'Boletos', 'Valor total', 'Situação', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itensSoltos.map(n => renderLinha(n, true))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <NotaFiscalModal
          nota={editando}
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
