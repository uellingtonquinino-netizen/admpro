// NOVO: cálculo do percentual executado da EAP — reaproveitado tanto
// na tela da Estrutura (EstruturaObra.tsx) quanto no Painel de
// Acompanhamento (PainelObra.tsx). O percentual de um item-folha
// (sem filho) vem direto do acumulado dos incrementos lançados no
// Diário de Obra; o de um item-pai é a média dos filhos, ponderada
// pelo valor orçado de cada um — igual o peso já funciona.

export interface EapItemBanco {
  id:                     number
  parent_id:              number | null
  nome:                   string
  valor_orcado:           number
  unidade_medida:         string | null
  ordem:                  number
  data_inicio_prevista?:  string | null
  data_fim_prevista?:     string | null
}

export interface EapItemComExecucao extends EapItemBanco {
  filhos:               EapItemComExecucao[]
  percentualExecutado:  number // 0-100, sempre calculado
}

export function construirArvoreComExecucao(
  itens: EapItemBanco[],
  acumuladosPorItem: Record<number, number>
): EapItemComExecucao[] {
  const porId = new Map<number, EapItemComExecucao>(
    itens.map(i => [i.id, { ...i, filhos: [], percentualExecutado: 0 }])
  )
  const raizes: EapItemComExecucao[] = []
  for (const item of porId.values()) {
    if (item.parent_id !== null && porId.has(item.parent_id)) {
      porId.get(item.parent_id)!.filhos.push(item)
    } else {
      raizes.push(item)
    }
  }

  // Calcula de baixo pra cima (folha primeiro) — precisa que os
  // filhos já tenham o percentual calculado antes do pai.
  function calcular(item: EapItemComExecucao): number {
    if (item.filhos.length === 0) {
      // é folha — pega o acumulado direto dos lançamentos do Diário,
      // nunca passa de 100%.
      item.percentualExecutado = Math.min(100, acumuladosPorItem[item.id] ?? 0)
      return item.percentualExecutado
    }
    const valorTotalFilhos = item.filhos.reduce((s, f) => s + f.valor_orcado, 0)
    if (valorTotalFilhos === 0) { item.percentualExecutado = 0; return 0 }
    const soma = item.filhos.reduce((s, f) => s + calcular(f) * f.valor_orcado, 0)
    item.percentualExecutado = soma / valorTotalFilhos
    return item.percentualExecutado
  }
  for (const raiz of raizes) calcular(raiz)

  return raizes
}

// Percentual físico da obra INTEIRA — média das Fases (raízes),
// ponderada pelo valor orçado de cada uma.
export function percentualGeralObra(raizes: EapItemComExecucao[]): number {
  const valorTotal = raizes.reduce((s, f) => s + f.valor_orcado, 0)
  if (valorTotal === 0) return 0
  return raizes.reduce((s, f) => s + f.percentualExecutado * f.valor_orcado, 0) / valorTotal
}

// NOVO: curva PREVISTA — pra cada item-folha com data de início e
// fim planejadas, distribui o peso dele linearmente entre essas duas
// datas (antes da data de início, contribui 0%; depois da data de
// fim, contribui 100% do peso dele; no meio, proporcional aos dias
// já passados). Somando isso de todos os itens-folha, numa data
// qualquer, dá o percentual previsto da obra inteira naquele dia.
// Itens sem as duas datas preenchidas simplesmente não entram na
// conta (ainda não têm planejamento).
export function percentualPrevistoNaData(
  itensFolha: { valor_orcado: number; data_inicio_prevista?: string | null; data_fim_prevista?: string | null }[],
  valorTotalObra: number,
  dataAlvo: Date
): number {
  if (valorTotalObra === 0) return 0
  let soma = 0
  for (const item of itensFolha) {
    if (!item.data_inicio_prevista || !item.data_fim_prevista) continue
    const inicio = new Date(`${item.data_inicio_prevista}T00:00:00`)
    const fim    = new Date(`${item.data_fim_prevista}T00:00:00`)
    const peso   = item.valor_orcado / valorTotalObra
    if (dataAlvo <= inicio) continue
    if (dataAlvo >= fim) { soma += peso; continue }
    const totalDias = (fim.getTime() - inicio.getTime()) / 86400000
    const diasPassados = (dataAlvo.getTime() - inicio.getTime()) / 86400000
    soma += peso * (totalDias > 0 ? diasPassados / totalDias : 1)
  }
  return soma * 100
}
