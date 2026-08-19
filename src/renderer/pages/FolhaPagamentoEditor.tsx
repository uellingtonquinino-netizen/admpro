import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEmpresaStore }      from '@store/empresa.store'
import { useAuthStore }         from '@store/auth.store'
import { toast }                from '@components/ui/ToastContainer'
import PageHeader               from '@components/layout/PageHeader'
import Button                   from '@components/ui/Button'
import Modal                     from '@components/ui/Modal'
import Input                     from '@components/ui/Input'
import { ArrowLeft, Save, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  horasParaDecimal, decimalParaHoraMinuto, paraTextoHora,
  calcularTotalItem, calcularResumoFolha, formatReais,
} from '@utils/folhaPagamentoCalculo'

interface ItemFolha {
  colaborador_id:    number | null
  colaborador_nome:  string
  matricula_esocial: string | null
  // NOVO: usado só pra calcular o resumo do valor da folha (não é
  // salvo no banco — cada item da folha não guarda salário).
  cpf:               string | null
  salario_base:      number | null
  h_premio:          string
  producao:          string
  vale_transporte:   string
  insalubridade:     string
  periculosidade:    string
  adc_noturno:       string
  he_50:             string
  he_80:             string
  he_100:            string
  he_110:            string
  atrasos:           string
  faltas:            string
  outros_eventos:    string
}

// Cada coluna: chave do item + rótulo mostrado no cabeçalho (igual à
// planilha original). A ordem aqui é a mesma ordem de exportação.
const COLUNAS: { chave: keyof ItemFolha; label: string }[] = [
  { chave: 'h_premio',        label: 'H Prêmio R$' },
  { chave: 'producao',        label: 'Produção' },
  { chave: 'vale_transporte', label: 'V. Transporte' },
  { chave: 'insalubridade',   label: 'Insalubridade' },
  { chave: 'periculosidade',  label: 'Periculosidade' },
  { chave: 'adc_noturno',     label: 'Adc Noturno' },
  { chave: 'he_50',           label: 'HE 50%' },
  { chave: 'he_80',           label: 'HE 80%' },
  { chave: 'he_100',          label: 'HE 100%' },
  { chave: 'he_110',          label: 'HE 110%' },
  { chave: 'atrasos',         label: 'Atrasos' },
  { chave: 'faltas',          label: 'Faltas' },
  { chave: 'outros_eventos',  label: 'Outros Eventos' },
]

function itemVazio(colaborador: { id: number; nome: string; matricula_esocial: string | null; cpf: string | null; salario_base: number | null }): ItemFolha {
  return {
    colaborador_id: colaborador.id,
    colaborador_nome: colaborador.nome,
    matricula_esocial: colaborador.matricula_esocial,
    cpf: colaborador.cpf,
    salario_base: colaborador.salario_base,
    h_premio: '', producao: '', vale_transporte: '', insalubridade: '', periculosidade: '',
    adc_noturno: '', he_50: '', he_80: '', he_100: '', he_110: '', atrasos: '', faltas: '', outros_eventos: '',
  }
}

// Só dígitos — pra comparar CPF sem depender de pontuação igual.
function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

// Maiúsculo, sem espaço duplicado nem nas pontas — pra comparar nome
// como reforço, quando o CPF não bate/não existe.
function normalizarNome(v: string | null | undefined): string {
  return (v ?? '').toUpperCase().trim().replace(/\s+/g, ' ')
}

function paraTexto(v: number | null): string {
  return v === null || v === undefined ? '' : String(v)
}

function mesAtualComoInput(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}


// NOVO: painel de preenchimento — parecido com a planilha Excel que a
// empresa já usa hoje (RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO).
// Já vem com todos os colaboradores ativos e o código (matrícula
// e-Social) de cada um, só falta preencher o mês de competência e os
// valores de cada evento.
export default function FolhaPagamentoEditor() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()
  const empresaId  = useEmpresaStore(s => s.empresaId)
  const usuario    = useAuthStore(s => s.usuario)
  const editando   = !!id

  const [mesCompetencia, setMesCompetencia] = useState(mesAtualComoInput())
  const [itens, setItens]     = useState<ItemFolha[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // NOVO: navegação por teclado (setas esquerda/direita) entre as
  // células, igual planilha — guarda uma referência de cada campo,
  // indexada por "linha-coluna".
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  // NOVO: referência da coluna "Nome" fixa, pra medir a largura REAL
  // dela (cresce conforme o nome mais comprido da lista — não dá pra
  // supor um número fixo).
  const colunaNomeRef = useRef<HTMLTableCellElement>(null)
  const cabecalhoRef = useRef<HTMLTableSectionElement>(null)

  const carregar = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      if (editando && id) {
        const [folha, colaboradores] = await Promise.all([
          window.api.folhaPagamento.buscarPorId(Number(id)),
          window.api.folhaPagamento.colaboradoresAtivos(empresaId),
        ])
        if (!folha) { toast.error('Folha não encontrada.'); navigate('/folha-pagamento'); return }
        // NOVO: o item salvo na folha não guarda CPF nem salário —
        // busca pelo colaborador_id na lista de ativos, só pra ter
        // isso disponível (importação de espelho + resumo do valor).
        const dadosPorColaboradorId = new Map<number, { cpf: string | null; salario_base: number | null }>(
          colaboradores.map((c: any) => [c.id, { cpf: c.cpf, salario_base: c.salario_base }])
        )
        setMesCompetencia(folha.mes_competencia.slice(0, 7))
        setItens(folha.itens.map((it: any) => ({
          colaborador_id: it.colaborador_id,
          colaborador_nome: it.colaborador_nome,
          matricula_esocial: it.matricula_esocial,
          cpf: it.colaborador_id ? dadosPorColaboradorId.get(it.colaborador_id)?.cpf ?? null : null,
          salario_base: it.colaborador_id ? dadosPorColaboradorId.get(it.colaborador_id)?.salario_base ?? null : null,
          h_premio: paraTexto(it.h_premio), producao: paraTexto(it.producao),
          vale_transporte: paraTexto(it.vale_transporte), insalubridade: paraTexto(it.insalubridade),
          periculosidade: paraTexto(it.periculosidade), adc_noturno: paraTextoHora(it.adc_noturno),
          he_50: paraTextoHora(it.he_50), he_80: paraTextoHora(it.he_80), he_100: paraTextoHora(it.he_100),
          he_110: paraTextoHora(it.he_110), atrasos: paraTextoHora(it.atrasos), faltas: paraTexto(it.faltas),
          outros_eventos: paraTexto(it.outros_eventos),
        })))
      } else {
        const colaboradores = await window.api.folhaPagamento.colaboradoresAtivos(empresaId)
        setItens(colaboradores.map(itemVazio))
      }
    } finally {
      setLoading(false)
    }
  }, [empresaId, editando, id, navigate])

  useEffect(() => { carregar() }, [carregar])

  function atualizarCampo(index: number, campo: keyof ItemFolha, valor: string) {
    setItens(prev => prev.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)))
  }

  // NOVO: seta esquerda/direita pula pro campo vizinho da mesma linha
  // — só quando o cursor já está na pontinha do texto (início pra ir
  // pra esquerda, fim pra ir pra direita), senão a seta continua
  // andando dentro do próprio texto, normal. Seta cima/baixo e Enter
  // pulam pra mesma coluna na linha de cima/baixo (Enter desce, igual
  // Excel/Sheets) — texto de uma linha só não usa cima/baixo pra
  // andar o cursor, então não precisa checar posição igual esquerda/
  // direita.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, linha: number, coluna: number) {
    const input = e.currentTarget
    const noInicio = input.selectionStart === 0 && input.selectionEnd === 0
    const noFim    = input.selectionStart === input.value.length && input.selectionEnd === input.value.length

    if (e.key === 'ArrowLeft' && noInicio && coluna > 0) {
      e.preventDefault()
      focarCelula(linha, coluna - 1)
    } else if (e.key === 'ArrowRight' && noFim && coluna < COLUNAS.length - 1) {
      e.preventDefault()
      focarCelula(linha, coluna + 1)
    } else if (e.key === 'ArrowUp' && linha > 0) {
      e.preventDefault()
      focarCelula(linha - 1, coluna)
    } else if ((e.key === 'ArrowDown' || e.key === 'Enter') && linha < itens.length - 1) {
      e.preventDefault()
      focarCelula(linha + 1, coluna)
    }
  }

  function focarCelula(linha: number, coluna: number) {
    const alvo = inputsRef.current[`${linha}-${coluna}`]
    const container = scrollRef.current
    if (!alvo || !container) return
    alvo.focus()
    alvo.select()

    // CORRIGIDO (de novo): a primeira versão supunha uma largura FIXA
    // pras colunas Código+Nome (70+220px) — mas a coluna Nome cresce
    // de verdade conforme o nome mais comprido da lista inteira (uma
    // tabela HTML usa a mesma largura em toda a coluna, do maior
    // conteúdo). Com nomes longos, a área realmente coberta ficava
    // maior que os 290px supostos, e a rolagem parava cedo demais.
    // Agora mede a largura REAL da coluna Nome (que já inclui, por
    // estar "colada" nela, o fim de onde termina a área fixa) direto
    // do navegador, sempre correto não importa o nome.
    const retanguloCelula     = alvo.getBoundingClientRect()
    const retanguloContainer  = container.getBoundingClientRect()
    const retanguloColunaNome = colunaNomeRef.current?.getBoundingClientRect()
    const fimDaAreaFixa       = retanguloColunaNome ? retanguloColunaNome.right : retanguloContainer.left

    const escondidaAEsquerda = fimDaAreaFixa - retanguloCelula.left
    const escondidaADireita  = retanguloCelula.right - retanguloContainer.right

    if (escondidaAEsquerda > 0) {
      container.scrollLeft -= escondidaAEsquerda
    } else if (escondidaADireita > 0) {
      container.scrollLeft += escondidaADireita
    }

    // NOVO: mesmo problema, só que na vertical — o cabeçalho fica
    // fixo (sticky) no topo, cobrindo uma faixa por cima das linhas.
    // Subindo com a seta, uma linha podia ficar escondida atrás dele
    // mesmo "tecnicamente visível" pro navegador. Desconta a altura
    // real do cabeçalho, do mesmo jeito que já faz com a coluna Nome.
    const retanguloCabecalho = cabecalhoRef.current?.getBoundingClientRect()
    const fimDaAreaFixaTopo  = retanguloCabecalho ? retanguloCabecalho.bottom : retanguloContainer.top

    const escondidaEmCima  = fimDaAreaFixaTopo - retanguloCelula.top
    const escondidaEmBaixo = retanguloCelula.bottom - retanguloContainer.bottom

    if (escondidaEmCima > 0) {
      container.scrollTop -= escondidaEmCima
    } else if (escondidaEmBaixo > 0) {
      container.scrollTop += escondidaEmBaixo
    }
  }

  // NOVO: importa um ou mais PDFs de espelho de ponto (Pontomais) —
  // lê nome/CPF pra achar a linha certa (CPF primeiro, nome como
  // reforço se não achar por CPF) e lança HE 80%/100% e a quantidade
  // de faltas na linha encontrada.
  // NOVO: se o MESMO colaborador aparecer mais de uma vez entre os
  // arquivos importados (bug conhecido do Pontomais, que às vezes
  // gera dois espelhos separados pra uma pessoa só), as horas e
  // faltas são SOMADAS entre as ocorrências, em vez da segunda
  // sobrescrever a primeira.
  const [importando, setImportando] = useState(false)

  // ALTERADO: agora também junta os avisos de cada PDF que contribuiu
  // pra esse colaborador (ex: 2 PDFs do mesmo CPF, um com aviso e
  // outro sem) — a tela de conferência mostra isso tudo junto.
  function consolidarPorColaborador(lidos: any[]) {
    const grupos = new Map<string, { nome: string | null; cpf: string | null; he80Decimal: number; he100Decimal: number; faltas: number; avisos: string[] }>()

    for (const lido of lidos) {
      const cpfDigits = somenteDigitos(lido.cpf)
      const chave = cpfDigits || `nome:${normalizarNome(lido.nome)}`
      const atual = grupos.get(chave) ?? { nome: lido.nome, cpf: lido.cpf, he80Decimal: 0, he100Decimal: 0, faltas: 0, avisos: [] as string[] }
      atual.he80Decimal  += horasParaDecimal(lido.he80  ?? '')
      atual.he100Decimal += horasParaDecimal(lido.he100 ?? '')
      atual.faltas        += lido.faltas
      atual.avisos.push(...(lido.avisos ?? []))
      grupos.set(chave, atual)
    }

    return Array.from(grupos.values()).map(g => ({
      nome: g.nome,
      cpf: g.cpf,
      he80: decimalParaHoraMinuto(g.he80Decimal),
      he100: decimalParaHoraMinuto(g.he100Decimal),
      faltas: g.faltas,
      avisos: g.avisos,
    }))
  }

  // NOVO: linha da tela de conferência — sempre aparece depois de
  // importar, mesmo sem nenhum aviso, pra bater o olho antes de
  // confirmar. Cada campo é editável na própria tela.
  interface LinhaRevisao {
    nome: string | null
    cpf: string | null
    he80: string
    he100: string
    faltas: string
    avisos: string[]
    indexNaLista: number | null // posição em `itens`, se achou o colaborador
  }
  const [revisao, setRevisao] = useState<LinhaRevisao[]>([])
  const [modalRevisaoAberto, setModalRevisaoAberto] = useState(false)
  const [arquivosComErro, setArquivosComErro] = useState<string[]>([])

  async function handleImportarEspelhos() {
    setImportando(true)
    try {
      const resultado = await window.api.folhaPagamento.importarEspelhosPonto()
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao importar os espelhos de ponto.'); return }

      const comErro: string[] = []
      const validos = resultado.itens.filter((lido: any) => !lido.erro)
      for (const lido of resultado.itens) if (lido.erro) comErro.push(`${lido.arquivo}: ${lido.erro}`)
      const consolidados = consolidarPorColaborador(validos)

      const linhas: LinhaRevisao[] = consolidados.map(c => {
        const cpfLido = somenteDigitos(c.cpf)
        const nomeLido = normalizarNome(c.nome)
        let index = cpfLido ? itens.findIndex(it => somenteDigitos(it.cpf) === cpfLido && cpfLido !== '') : -1
        if (index === -1) index = itens.findIndex(it => normalizarNome(it.colaborador_nome) === nomeLido && nomeLido !== '')

        const avisos = [...c.avisos]
        if (index === -1) avisos.push('Não encontrei esse colaborador na lista da folha — confira o nome/CPF antes de confirmar.')

        return {
          nome: c.nome, cpf: c.cpf, he80: c.he80, he100: c.he100, faltas: String(c.faltas),
          avisos, indexNaLista: index === -1 ? null : index,
        }
      })

      setRevisao(linhas)
      setArquivosComErro(comErro)
      setModalRevisaoAberto(true)
    } catch (erro) {
      console.error('Erro ao importar espelhos de ponto:', erro)
      toast.error(`Erro ao importar os espelhos de ponto: ${erro instanceof Error ? erro.message : String(erro)}`)
    } finally {
      setImportando(false)
    }
  }

  // NOVO: só agora, depois da conferência manual, os valores entram
  // de fato na folha — nada é gravado antes de passar por essa tela.
  function handleConfirmarRevisao() {
    let importados = 0
    setItens(prev => {
      const proximo = [...prev]
      for (const linha of revisao) {
        if (linha.indexNaLista === null) continue
        proximo[linha.indexNaLista] = {
          ...proximo[linha.indexNaLista],
          he_80: linha.he80, he_100: linha.he100, faltas: linha.faltas,
        }
        importados++
      }
      return proximo
    })
    setModalRevisaoAberto(false)
    if (importados > 0) toast.success(`${importados} colaborador(es) lançado(s) na folha.`)
    if (arquivosComErro.length) toast.error(`Erro ao ler: ${arquivosComErro.join(' | ')}`)
  }

  function atualizarLinhaRevisao(index: number, campo: 'he80' | 'he100' | 'faltas', valor: string) {
    setRevisao(prev => prev.map((l, i) => i === index ? { ...l, [campo]: valor } : l))
  }

  async function handleSalvar() {
    if (!empresaId || !mesCompetencia) { toast.error('Informe o mês de competência.'); return }
    setSalvando(true)
    try {
      const itensPayload = itens.map(it => ({
        colaborador_id: it.colaborador_id,
        colaborador_nome: it.colaborador_nome,
        matricula_esocial: it.matricula_esocial,
        h_premio: it.h_premio === '' ? null : Number(it.h_premio.replace(',', '.')),
        producao: it.producao === '' ? null : Number(it.producao.replace(',', '.')),
        vale_transporte: it.vale_transporte === '' ? null : Number(it.vale_transporte.replace(',', '.')),
        insalubridade: it.insalubridade === '' ? null : Number(it.insalubridade.replace(',', '.')),
        periculosidade: it.periculosidade === '' ? null : Number(it.periculosidade.replace(',', '.')),
        adc_noturno: it.adc_noturno === '' ? null : Number(it.adc_noturno.replace(',', '.')),
        he_50: it.he_50 === '' ? null : Number(it.he_50.replace(',', '.')),
        he_80: it.he_80 === '' ? null : Number(it.he_80.replace(',', '.')),
        he_100: it.he_100 === '' ? null : Number(it.he_100.replace(',', '.')),
        he_110: it.he_110 === '' ? null : Number(it.he_110.replace(',', '.')),
        atrasos: it.atrasos === '' ? null : Number(it.atrasos.replace(',', '.')),
        faltas: it.faltas === '' ? null : Number(it.faltas.replace(',', '.')),
        outros_eventos: it.outros_eventos === '' ? null : Number(it.outros_eventos.replace(',', '.')),
      }))

      if (editando && id) {
        await window.api.folhaPagamento.atualizar({
          id: Number(id), mes_competencia: `${mesCompetencia}-01`, itens: itensPayload,
        })
        toast.success('Folha atualizada.')
      } else {
        await window.api.folhaPagamento.criar({
          empresa_id: empresaId, mes_competencia: `${mesCompetencia}-01`,
          criado_por: usuario?.nome ?? null, itens: itensPayload,
        })
        toast.success('Folha criada.')
      }
      navigate('/folha-pagamento')
    } catch {
      toast.error('Erro ao salvar a folha.')
    } finally {
      setSalvando(false)
    }
  }

  const resumo = useMemo(() => calcularResumoFolha(itens, mesCompetencia), [itens, mesCompetencia])

  return (
    <div>
      <button
        onClick={() => navigate('/folha-pagamento')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <PageHeader
        title={editando ? 'Editar Folha de Pagamento' : 'Nova Folha de Pagamento'}
        subtitle="Preencha os valores de cada colaborador pra elaboração da folha"
      >
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400">Competência</label>
          <input
            type="month"
            value={mesCompetencia}
            onChange={e => setMesCompetencia(e.target.value)}
            className="bg-surface border border-surface-border rounded-xl px-3 py-2 text-sm text-gray-200"
          />
        </div>
        <Button
          variant="outline"
          icon={<Upload size={15} />}
          onClick={handleImportarEspelhos}
          loading={importando}
        >
          Importar Espelho de Ponto
        </Button>
        <Button icon={<Save size={15} />} onClick={handleSalvar} loading={salvando}>
          Salvar
        </Button>
      </PageHeader>

      {/* NOVO: resumo do valor da folha — estimativa pra conferência
          antes de mandar pro programa de folha, seguindo os
          princípios básicos de cálculo (salário-base ÷ 220 = valor
          da hora, horas extras com o percentual de cada uma,
          descontos de falta/atraso). Atualiza ao vivo conforme edita. */}
      {!loading && itens.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-surface-border rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Salários-base</p>
            <p className="text-lg font-semibold text-gray-200">{formatReais(resumo.totalSalarios)}</p>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">+ Adicionais</p>
            <p className="text-lg font-semibold text-emerald-400">{formatReais(resumo.totalAdicionais)}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">− Descontos</p>
            <p className="text-lg font-semibold text-red-400">{formatReais(resumo.totalDescontos)}</p>
          </div>
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total da folha (estimado)</p>
            <p className="text-lg font-semibold text-brand-400">{formatReais(resumo.totalGeral)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="h-64 shimmer rounded-xl" />
      ) : itens.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500 bg-surface border border-surface-border rounded-xl">
          Nenhum colaborador ativo encontrado nessa obra.
        </div>
      ) : (
        <div ref={scrollRef} className="bg-surface border border-surface-border rounded-xl overflow-x-auto overflow-y-auto max-h-[70vh]">
          <table className="text-sm border-collapse">
            <thead ref={cabecalhoRef} className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-surface-border">
                <th className="sticky left-0 z-20 bg-surface px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[70px]">Código</th>
                <th ref={colunaNomeRef} className="sticky left-[70px] z-20 bg-surface px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[220px] border-r border-surface-border">Nome</th>
                {/* NOVO: só exibição — salário + adicionais − descontos
                    desse colaborador. Não é salvo no banco nem entra
                    na exportação do Excel, é só conferência na tela. */}
                <th className="bg-surface px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[110px] border-r border-surface-border">Total</th>
                {COLUNAS.map(c => (
                  <th key={c.chave} className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wide min-w-[100px]">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((item, i) => (
                <tr key={item.colaborador_id ?? i} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1.5 text-gray-400 whitespace-nowrap">
                    {item.matricula_esocial || (
                      <span className="text-amber-500" title="Colaborador sem matrícula e-Social cadastrada">—</span>
                    )}
                  </td>
                  <td className="sticky left-[70px] z-10 bg-surface px-3 py-1.5 text-gray-200 whitespace-nowrap border-r border-surface-border">
                    {item.colaborador_nome}
                  </td>
                  <td className="px-3 py-1.5 text-right text-gray-300 whitespace-nowrap border-r border-surface-border">
                    {formatReais(calcularTotalItem(item, mesCompetencia).total)}
                  </td>
                  {COLUNAS.map((c, colIndex) => (
                    <td key={c.chave} className="px-1 py-1">
                      <input
                        ref={el => { inputsRef.current[`${i}-${colIndex}`] = el }}
                        type="text"
                        inputMode="decimal"
                        value={item[c.chave] as string}
                        onChange={e => atualizarCampo(i, c.chave, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, i, colIndex)}
                        className="w-full bg-transparent text-center text-gray-200 text-sm px-1 py-1 rounded
                                   border border-transparent hover:border-surface-border
                                   focus:border-brand-500 focus:outline-none transition-colors"
                        placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* NOVO: tela de conferência — sempre aparece depois de
          importar os espelhos, mesmo sem nenhum aviso. Nada é
          lançado na folha antes de passar por aqui. */}
      <Modal open={modalRevisaoAberto} onClose={() => setModalRevisaoAberto(false)} title="Conferir importação do Espelho de Ponto" size="xl">
        <div className="space-y-4">
          {arquivosComErro.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-400 uppercase tracking-wide mb-1">Arquivos com erro de leitura</p>
              {arquivosComErro.map((e, i) => <p key={i} className="text-xs text-gray-300">{e}</p>)}
            </div>
          )}

          {revisao.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Nenhum colaborador encontrado nos arquivos selecionados.</p>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto space-y-2.5">
              {revisao.map((linha, i) => (
                <div
                  key={i}
                  className={
                    linha.avisos.length > 0
                      ? 'bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5'
                      : 'bg-surface-hover border border-surface-border rounded-xl p-3.5'
                  }
                >
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {linha.avisos.length > 0
                        ? <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                        : <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{linha.nome ?? '(nome não identificado)'}</p>
                        <p className="text-xs text-gray-500">{linha.cpf ?? 'CPF não identificado'}</p>
                      </div>
                    </div>
                    {linha.indexNaLista !== null && (
                      <span className="text-[11px] text-emerald-400 shrink-0">
                        → {itens[linha.indexNaLista]?.colaborador_nome}
                      </span>
                    )}
                  </div>

                  {linha.avisos.length > 0 && (
                    <div className="mb-2.5 space-y-0.5">
                      {linha.avisos.map((a, ai) => (
                        <p key={ai} className="text-xs text-amber-300">⚠ {a}</p>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2.5">
                    <Input label="H.E. 80%" value={linha.he80} onChange={e => atualizarLinhaRevisao(i, 'he80', e.target.value)} placeholder="0,00" />
                    <Input label="H.E. 100%" value={linha.he100} onChange={e => atualizarLinhaRevisao(i, 'he100', e.target.value)} placeholder="0,00" />
                    <Input label="Faltas" value={linha.faltas} onChange={e => atualizarLinhaRevisao(i, 'faltas', e.target.value)} placeholder="0" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
          <Button variant="ghost" onClick={() => setModalRevisaoAberto(false)}>Cancelar</Button>
          <Button onClick={handleConfirmarRevisao} disabled={revisao.length === 0}>Confirmar e Lançar na Folha</Button>
        </div>
      </Modal>
    </div>
  )
}
