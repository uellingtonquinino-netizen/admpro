import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { useAuthStore }         from '@store/auth.store'
import { useFiltrosPeriodoStore } from '@store/filtrosPeriodo.store'
import { useCurrency }          from '@hooks/useCurrency'
import { useDebounce }          from '@hooks/useDebounce'
import { useConfirm }           from '@hooks/useConfirm'
import { toast }                from '@components/ui/ToastContainer'
import Button                   from '@components/ui/Button'
import Badge                    from '@components/ui/Badge'
import Input                    from '@components/ui/Input'
import FiltroPeriodo            from '@components/ui/FiltroPeriodo'
import ConfirmDialog            from '@components/ui/ConfirmDialog'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import EmitirAPModal            from '@components/fornecedores/EmitirAPModal'
import EditarApModal            from '@components/fornecedores/EditarApModal'
import { gerarHtmlAP }          from '../documentos/ap'
import { gerarCapaLote, ApCapaItem } from '../documentos/capaLote'
import { aplicarCarimbosAP }    from '../utils/carimbosAp'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'
import { formatDate }           from '@utils/format'
import {
  Search, Plus, Pencil, Trash2, FileText, Wallet, Users, Printer, CheckCircle2, Archive, Send, FolderClosed, FolderMinus, ChevronDown, ChevronUp,
} from 'lucide-react'

interface ApRegistro {
  id:                 number
  beneficiario_tipo:  'fornecedor' | 'colaborador'
  beneficiario_nome:  string
  descricao:          string | null
  valor_total:        number
  qtd_boletos:        number
  observacoes:        string | null
  solicitante:        string | null
  autorizado_por:     string | null
  aprovado_por:       string | null
  aprovado_em:        string | null
  aprovado_supervisor_por: string | null
  aprovado_central_por: string | null
  lote_id:            number | null
  created_at:         string
}

interface Resumo {
  total:        number
  valorTotal:   number
  porFornecedor: { nome: string; total: number }[]
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

// NOVO: página dedicada de Autorizações de Pagamento — reúne tudo o
// que estava só no modal de histórico, mais os cards de resumo e o
// botão de emitir uma nova AP direto por aqui.
export default function AutorizacaoPagamento() {
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const usuario    = useAuthStore(s => s.usuario)
  const somenteLeitura = usuario?.perfil === 'gestor'
  const { format } = useCurrency()
  const { confirm, dialogProps } = useConfirm()

  const [items, setItems]         = useState<ApRegistro[]>([])
  const [resumo, setResumo]       = useState<Resumo | null>(null)
  const [loading, setLoading]     = useState(true)
  const [busca, setBusca]         = useState('')
  const [novaOpen, setNovaOpen]   = useState(false)
  const [editando, setEditando]   = useState<any | null>(null)
  const [carregandoEdicao, setCarregandoEdicao] = useState(false)
  const [imprimindoId, setImprimindoId] = useState<number | null>(null)
  const [autorizandoId, setAutorizandoId] = useState<number | null>(null)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [gerandoLote, setGerandoLote]   = useState(false)
  const [gerandoCapa, setGerandoCapa]   = useState(false)

  // ALTERADO: agora pode ter vários lotes abertos ao mesmo tempo
  // (cada "Fechar Lote" cria um novo, numerado) — cada um fica
  // destacado no topo, com os itens dele juntos em vez de soltos.
  const [lotesAbertos, setLotesAbertos] = useState<LoteAberto[]>([])
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<number>>(new Set())
  const [fechandoLote, setFechandoLote]   = useState(false)
  const [enviandoLoteId, setEnviandoLoteId] = useState<number | null>(null)
  const [tirandoDoLoteId, setTirandoDoLoteId] = useState<number | null>(null)
  const [loteDestino, setLoteDestino]     = useState('')
  const [enviandoParaLote, setEnviandoParaLote] = useState(false)

  const filtroApSalvo   = useFiltrosPeriodoStore(s => s.ap)
  const setFiltroApSalvo = useFiltrosPeriodoStore(s => s.setFiltroAp)
  const [dataInicio, setDataInicio] = useState(filtroApSalvo.dataInicio)
  const [dataFim, setDataFim] = useState(filtroApSalvo.dataFim)

  const buscaDebounced = useDebounce(busca, 350)

  const carregar = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    window.api.ap.listar({
      empresa_id: empresaId, page: 1, perPage: 200,
      busca:      buscaDebounced || undefined,
      dataInicio: dataInicio || undefined,
      dataFim:    dataFim || undefined,
    })
      .then((r: { items: ApRegistro[] }) => setItems(r.items))
      .finally(() => setLoading(false))
  }, [empresaId, buscaDebounced, dataInicio, dataFim])

  const carregarResumo = useCallback(() => {
    if (!empresaId) return
    window.api.ap.resumo({ empresa_id: empresaId, dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }).then(setResumo)
  }, [empresaId, dataInicio, dataFim])

  // ALTERADO: agora usa o endpoint dedicado de lotes abertos (pode
  // ter mais de um), em vez de filtrar a lista inteira da obra.
  const carregarLotesAbertos = useCallback(() => {
    if (!empresaId) return
    window.api.lotes.listarAbertos(empresaId).then(setLotesAbertos)
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarResumo() }, [carregarResumo])
  useEffect(() => { carregarLotesAbertos() }, [carregarLotesAbertos])
  useEffect(() => { setSelecionados(new Set()) }, [buscaDebounced, dataInicio, dataFim])

  function atualizarTudo() {
    carregar()
    carregarResumo()
    carregarLotesAbertos()
  }

  function alternarSelecao(id: number) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      return novo
    })
  }

  // ALTERADO: agora considera TODOS os lotes abertos, não só um —
  // "solto" é quem não está em nenhum deles (nem em algum já enviado).
  const idsLotesAbertos = new Set(lotesAbertos.map(l => l.id))
  const itensSoltos = items.filter(a => !a.lote_id || !idsLotesAbertos.has(a.lote_id))

  function alternarSelecionarTodos() {
    setSelecionados(prev =>
      prev.size === itensSoltos.length ? new Set() : new Set(itensSoltos.map(a => a.id))
    )
  }

  async function handleEditar(a: ApRegistro) {
    setCarregandoEdicao(true)
    try {
      const completa = await window.api.ap.buscarPorId(a.id)
      setEditando(completa)
    } catch {
      toast.error('Erro ao carregar a AP.')
    } finally {
      setCarregandoEdicao(false)
    }
  }

  async function handleExcluir(a: ApRegistro) {
    const ok = await confirm({
      title:   'Excluir Autorização de Pagamento',
      message: `Deseja excluir a AP de "${a.beneficiario_nome}"? A despesa lançada no Financeiro também será removida.`,
      danger:  true,
    })
    if (!ok) return
    try {
      await window.api.ap.excluir(a.id)
      toast.success('AP excluída.')
      atualizarTudo()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  // Monta os dados/HTML da AP a partir do registro completo — usado
  // tanto pra imprimir/visualizar quanto pra regravar o PDF ao aprovar.
  async function montarHtmlAP(completa: any): Promise<string> {
    const empresaAtual = await window.api.empresas.buscarPorId(empresaId!)

    let documento = ''
    let banco: string | null = null, agencia: string | null = null
    let conta: string | null = null, contaDigito: string | null = null
    let ehBoleto = false
    if (completa.beneficiario_tipo === 'fornecedor') {
      const f = await window.api.fornecedores.buscarPorId(completa.beneficiario_id)
      documento = f.cnpj ? `CNPJ: ${formatCNPJ(f.cnpj)}` : `CPF: ${formatCPF(f.cpf) || '—'}`
      ehBoleto = f.forma_pagamento === 'boleto'
      banco = f.banco ?? null; agencia = f.agencia ?? null
      conta = f.conta ?? null; contaDigito = f.conta_digito ?? null
    } else {
      const c = await window.api.colaboradores.buscarPorId(completa.beneficiario_id)
      documento = `CPF: ${formatCPF(c.cpf) || '—'}`
      banco = c.banco ?? null; agencia = c.agencia ?? null
      conta = c.conta ?? null; contaDigito = c.conta_digito ?? null
    }

    return gerarHtmlAP({
      // ALTERADO: Centro de Custo mostra a Razão Social da obra (o
      // nome jurídico do CNPJ) — é o que o modelo real da empresa usa
      // ali, diferente do "Nome da obra" (organização interna).
      centroCusto:      empresaAtual.razao_social || empresaAtual.nome,
      logoUrl:          empresaAtual.logo_url,
      beneficiarioNome: completa.beneficiario_nome,
      documento,
      descricao:        completa.descricao ?? '',
      boletos:          completa.boletos.map((b: { valor: number; vencimento: string }) => b),
      boleto:           ehBoleto,
      banco, agencia, conta, contaDigito,
      observacoes:      completa.observacoes ?? '',
      solicitante:      completa.solicitante ?? '',
      autorizadoPor:    completa.autorizado_por ?? '',
    })
  }

  // ALTERADO: para o GESTOR, sempre abre a AP pra visualizar (nunca
  // manda direto pro diálogo de impressão) — ele só confere e depois
  // volta ao programa pra autorizar. Independe de ter anexo ou não.
  // Para o ADM continua como estava: com anexo abre o arquivo pronto,
  // sem anexo vai direto pro diálogo de impressão.
  // CORRIGIDO: o bug real da assinatura sumindo era aqui — toda vez
  // que alguém clicava pra visualizar/imprimir, o PDF era regerado do
  // zero (mesmo já tendo um pronto e carimbado), apagando qualquer
  // assinatura que já tivesse sido aplicada. Agora, se já existe um
  // arquivo salvo, SEMPRE abre ele — nunca regera. Só gera (e salva,
  // pra da próxima vez já abrir direto) na primeiríssima vez, quando
  // ainda não existe nenhum arquivo.
  async function handleImprimir(a: ApRegistro) {
    if (!empresaId) return
    setImprimindoId(a.id)
    try {
      const completa = await window.api.ap.buscarPorId(a.id)
      const nomeArquivo = `AP - ${completa.beneficiario_nome}`

      if (completa.pdf_path) {
        const resultado = await window.api.documentos.abrirArquivo(completa.pdf_path)
        if (!resultado.ok) toast.error('Não foi possível abrir o arquivo salvo. Ele pode ter sido movido ou apagado.')
        return
      }

      const html = await montarHtmlAP(completa)
      const resultado = await window.api.documentos.salvarPdfInterno({
        html, nomeArquivo, anexos: completa.anexos ?? [], pastaId: `AP_${a.id}`,
      })
      if (resultado.ok) {
        await window.api.ap.salvarCaminhoPdf({ id: a.id, pdf_path: resultado.filePath })
        const abriu = await window.api.documentos.abrirArquivo(resultado.filePath)
        if (!abriu.ok) toast.error('Não foi possível abrir o arquivo pra visualização.')
      } else {
        toast.error('Erro ao gerar o arquivo pra visualização.')
      }
    } catch {
      toast.error('Erro ao preparar a impressão.')
    } finally {
      setImprimindoId(null)
    }
  }

  // NOVO: autoriza a AP (carimba quem aprovou e quando) e já regrava
  // o PDF/documento com o carimbo, pra quem for imprimir depois já
  // ver a aprovação registrada.
  async function handleAutorizar(a: ApRegistro) {
    if (!empresaId || !usuario) return
    setAutorizandoId(a.id)
    try {
      const { aprovado_em } = await window.api.ap.aprovar({ id: a.id, aprovado_por: usuario.nome, usuario_id: usuario.id })

      const completa = await window.api.ap.buscarPorId(a.id)
      completa.aprovado_por = usuario.nome
      completa.aprovado_em  = aprovado_em

      const html = await montarHtmlAP(completa)
      const resultado = await window.api.documentos.salvarPdfInterno({
        html, nomeArquivo: `AP - ${completa.beneficiario_nome}`, anexos: completa.anexos ?? [], pastaId: `AP_${a.id}`,
      })
      if (resultado.ok) {
        await window.api.ap.salvarCaminhoPdf({ id: a.id, pdf_path: resultado.filePath })
        // Carimbo do Gestor (canto esquerdo) e do Supervisor (canto
        // direito, se já tiver aprovado antes) — mesmo tamanho, lado
        // a lado.
        const carimbo = await aplicarCarimbosAP(resultado.filePath, completa)
        if (!carimbo.ok) toast.error(carimbo.erros.join(' '))
      }

      toast.success('AP autorizada.')
      atualizarTudo()
    } catch {
      toast.error('Erro ao autorizar a AP.')
    } finally {
      setAutorizandoId(null)
    }
  }

  // NOVO: gera o lote — copia o PDF de cada AP selecionada pra uma
  // pasta escolhida na hora, pronta pra mandar pro financeiro. Cada
  // AP continua como arquivo próprio (do jeito que a empresa já usa),
  // só que juntadas numa pasta de uma vez. Se alguma AP selecionada
  // ainda não tiver o PDF pronto salvo, gera na hora antes de copiar.
  async function handleGerarLote() {
    if (!empresaId || selecionados.size === 0) return
    setGerandoLote(true)
    try {
      const arquivos: { origem: string; nomeArquivo: string }[] = []

      for (const id of selecionados) {
        const completa = await window.api.ap.buscarPorId(id)
        let caminho = completa.pdf_path

        if (!caminho) {
          const html = await montarHtmlAP(completa)
          const resultado = await window.api.documentos.salvarPdfInterno({
            html, nomeArquivo: `AP - ${completa.beneficiario_nome}`,
            anexos: completa.anexos ?? [], pastaId: `AP_${id}`,
          })
          if (resultado.ok) {
            await window.api.ap.salvarCaminhoPdf({ id, pdf_path: resultado.filePath })
            caminho = resultado.filePath
          }
        }

        if (caminho) {
          arquivos.push({ origem: caminho, nomeArquivo: `AP ${id} - ${completa.beneficiario_nome}` })
        }
      }

      if (arquivos.length === 0) {
        toast.error('Não foi possível preparar nenhuma AP selecionada.')
        return
      }

      const resultado = await window.api.documentos.gerarLote(arquivos)
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao gerar o lote.'); return }

      toast.success(`${resultado.copiados} de ${resultado.total} AP's copiadas para a pasta.`)
      setSelecionados(new Set())
    } catch {
      toast.error('Erro ao gerar o lote.')
    } finally {
      setGerandoLote(false)
    }
  }

  // NOVO: gera a mesma "capa" (planilha com todas as colunas e o
  // total no final) que já existe na tela de lote — só que aqui pra
  // qualquer seleção de AP's, sem precisar ter enviado pro Supervisor.
  async function handleGerarCapa() {
    if (!empresaId || selecionados.size === 0) return
    setGerandoCapa(true)
    try {
      const dados = await window.api.ap.capaPorIds(Array.from(selecionados))
      if (dados.length === 0) { toast.error('Não foi possível carregar as AP\'s selecionadas.'); return }

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

      const empresaAtual = await window.api.empresas.buscarPorId(empresaId)
      const titulo = `PROTOCOLO DE AP's de ${formatDate(dataInicio)} a ${formatDate(dataFim)}`
      const html = gerarCapaLote(
        { nome: empresaAtual.nome, logo_url: empresaAtual.logo_url }, titulo, itens, format,
      )
      const resultado = await window.api.documentos.imprimir({ html, nomeArquivo: titulo, landscape: true })
      if (!resultado.ok && !resultado.canceled) toast.error('Erro ao gerar a capa.')
    } catch {
      toast.error('Erro ao gerar a capa.')
    } finally {
      setGerandoCapa(false)
    }
  }

  // NOVO: "Fechar Lote" — só organiza as AP's selecionadas junto do
  // lote aberto dessa obra (cria um se ainda não tiver nenhum). Não
  // manda pro Supervisor ainda — isso é um passo separado, feito
  // quando o ADM quiser, no card do lote.
  async function handleFecharLote() {
    if (!empresaId || selecionados.size === 0) return
    const podeFecharSemAutorizar = usuario?.permissoes_extras?.includes('fechar-lote-nao-autorizado')
    if (!podeFecharSemAutorizar) {
      const semAutorizar = items.filter(a => selecionados.has(a.id) && !a.aprovado_por)
      if (semAutorizar.length > 0) {
        toast.error('Uma ou mais AP\'s selecionadas ainda não foram autorizadas.')
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
        ap_ids:       Array.from(selecionados),
        nf_ids:       [],
      })
      toast.success(`Lote organizado: ${titulo}`)
      setSelecionados(new Set())
      atualizarTudo()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao fechar o lote.')
    } finally {
      setFechandoLote(false)
    }
  }

  // NOVO: manda o lote já fechado pro Supervisor — a partir daqui
  // ele deixa de aparecer aqui destacado (some pra dentro do fluxo
  // normal de aprovação, acompanhável em Lotes Enviados).
  async function handleEnviarLote(loteId: number) {
    setEnviandoLoteId(loteId)
    try {
      await window.api.lotes.enviarParaSupervisor({ lote_ids: [loteId] })
      toast.success('Lote enviado ao Supervisor.')
      atualizarTudo()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o lote.')
    } finally {
      setEnviandoLoteId(null)
    }
  }

  // NOVO: "Enviar para o Lote" — junta as AP's selecionadas a um
  // lote já existente (escolhido no seletor), em vez de criar um novo.
  async function handleEnviarParaLote() {
    if (!empresaId || selecionados.size === 0 || !loteDestino) return
    const podeSemAutorizar = usuario?.permissoes_extras?.includes('fechar-lote-nao-autorizado')
    if (!podeSemAutorizar) {
      const semAutorizar = items.filter(a => selecionados.has(a.id) && !a.aprovado_por)
      if (semAutorizar.length > 0) {
        toast.error('Uma ou mais AP\'s selecionadas ainda não foram autorizadas.')
        return
      }
    }
    setEnviandoParaLote(true)
    try {
      await window.api.lotes.adicionarAoLote({
        lote_id:    Number(loteDestino),
        usuario_id: usuario?.id ?? null,
        ap_ids:     Array.from(selecionados),
        nf_ids:     [],
      })
      toast.success('Adicionado ao lote.')
      setSelecionados(new Set())
      setLoteDestino('')
      atualizarTudo()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar ao lote.')
    } finally {
      setEnviandoParaLote(false)
    }
  }

  // NOVO: "Tirar do Lote" — remove uma AP do lote em que está. Se
  // era a última, o lote deixa de existir (backend já cuida disso).
  async function handleTirarDoLote(a: ApRegistro) {
    setTirandoDoLoteId(a.id)
    try {
      await window.api.lotes.tirarDoLote({ item_tipo: 'ap', item_id: a.id })
      toast.success('Retirado do lote.')
      atualizarTudo()
    } catch {
      toast.error('Erro ao tirar do lote.')
    } finally {
      setTirandoDoLoteId(null)
    }
  }

  // NOVO: uma linha da tabela, reaproveitada tanto na lista solta
  // quanto dentro do card do lote aberto. `comCheckbox=false` tira a
  // caixinha de selecionar — não faz sentido pra quem já está
  // organizado num lote.
  function renderLinha(a: ApRegistro, comCheckbox: boolean) {
    // CORRIGIDO: a.lote_id sozinho não bastava mais pra saber se já
    // foi ENVIADO — desde que "Fechar Lote" existe, dá pra ter
    // lote_id preenchido sem nunca ter ido pro Supervisor ainda.
    const noLoteAbertoAgora = !!a.lote_id && idsLotesAbertos.has(a.lote_id)

    return (
      <tr key={a.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
        <td className="px-4 py-3">
          {comCheckbox && (
            <input
              type="checkbox"
              checked={selecionados.has(a.id)}
              onChange={() => alternarSelecao(a.id)}
              className="accent-brand-500"
            />
          )}
        </td>
        <td className="px-4 py-3 text-gray-200">{a.beneficiario_nome}</td>
        <td className="px-4 py-3">
          <Badge color={a.beneficiario_tipo === 'fornecedor' ? 'blue' : 'purple'}>
            {a.beneficiario_tipo === 'fornecedor' ? 'Fornecedor' : 'Colaborador'}
          </Badge>
        </td>
        <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{a.descricao ?? '—'}</td>
        <td className="px-4 py-3 text-gray-400">{a.qtd_boletos}</td>
        <td className="px-4 py-3 text-gray-200">{format(a.valor_total)}</td>
        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(a.created_at.slice(0, 10))}</td>
        <td className="px-4 py-3">
          {noLoteAbertoAgora ? (
            <Badge color="blue">No lote — não enviado</Badge>
          ) : a.lote_id ? (
            a.aprovado_central_por ? (
              <Badge color="green">Aprovado pelo Escritório</Badge>
            ) : a.aprovado_supervisor_por ? (
              <Badge color="green">Liberada pelo Supervisor</Badge>
            ) : (
              <Badge color="blue">Aguardando Aprovação do Supervisor</Badge>
            )
          ) : a.aprovado_por ? (
            <Badge color="green">Aprovado</Badge>
          ) : (
            <Badge color="yellow">Pendente</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={() => handleImprimir(a)}
              disabled={imprimindoId === a.id}
              title={somenteLeitura ? 'Visualizar' : 'Imprimir'}
              className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-40"
            >
              <Printer size={13} />
            </button>
            {!a.aprovado_por && (
              <button
                onClick={() => handleAutorizar(a)}
                disabled={autorizandoId === a.id}
                title="Autorizar"
                className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
              >
                <CheckCircle2 size={13} />
              </button>
            )}
            {!somenteLeitura && noLoteAbertoAgora && (
              <button
                onClick={() => handleTirarDoLote(a)}
                disabled={tirandoDoLoteId === a.id}
                title="Tirar do lote"
                className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              >
                <FolderMinus size={13} />
              </button>
            )}
            {!somenteLeitura && (
              <>
                <button
                  onClick={() => handleEditar(a)}
                  disabled={carregandoEdicao}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => handleExcluir(a)}
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
            <h1 className="text-xl font-semibold text-white">Autorização de Pagamento</h1>
            <p className="text-sm text-gray-400 mt-0.5">Emissão e histórico de AP's</p>
          </div>
          {/* ALTERADO: filtro por período (data de EMISSÃO) agora só
              busca ao clicar na lupa ou apertar Enter. Vem
              pré-preenchido da última terça-feira até a próxima
              (editável). */}
          <FiltroPeriodo
            dataInicio={dataInicio}
            dataFim={dataFim}
            onBuscar={(inicio, fim) => {
              setDataInicio(inicio); setDataFim(fim)
              setFiltroApSalvo({ dataInicio: inicio, dataFim: fim })
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
            <Button icon={<Plus size={15} />} onClick={() => setNovaOpen(true)}>
              Nova Autorização de Pagamento
            </Button>
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <FileText size={15} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Total de AP's</p>
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
            <p className="text-xs text-gray-400">Nenhuma AP emitida ainda.</p>
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
          Lote), ainda não mandado pro Supervisor. Cada um com o mesmo
          tanto de ação que qualquer AP solta tem. */}
      {lotesAbertos.map(lote => {
        const itensDesseLote = items.filter(a => a.lote_id === lote.id)
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
                    {itensDesseLote.length} AP{itensDesseLote.length !== 1 && "'s"} organizada{itensDesseLote.length !== 1 && 's'} — ainda não enviado ao Supervisor
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
                    {itensDesseLote.map(a => renderLinha(a, false))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      <Input
        icon={<Search size={14} />}
        placeholder="Buscar por nome, valor ou descrição do serviço…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="mb-4"
      />

      {loading ? (
        <SkeletonTable rows={6} />
      ) : itensSoltos.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma AP encontrada"
          description={busca ? 'Ajuste a busca acima.' : 'Clique em "Nova Autorização de Pagamento" para emitir a primeira.'}
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
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
                {['Beneficiário', 'Tipo', 'Descrição', 'Parcelas', 'Valor total', 'Data', 'Situação', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itensSoltos.map(a => renderLinha(a, true))}
            </tbody>
          </table>
        </div>
      )}

      {novaOpen && (
        <EmitirAPModal onClose={() => { setNovaOpen(false); atualizarTudo() }} />
      )}

      {editando && (
        <EditarApModal
          registro={editando}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); atualizarTudo() }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
