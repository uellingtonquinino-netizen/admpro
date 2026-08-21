import { documentoBase, cabecalhoComLogo, fmtData, hoje, nomeExibicaoEmpresa } from './base'

interface EmpresaInfo {
  nome: string
  razao_social?: string | null
  logo_url?: string | null
}

function tabela(colunas: string[], linhas: string[][]): string {
  const cabecalho = colunas.map((c, i) =>
    `<td class="label${i > 0 ? ' col-encolhe' : ''}">${c}</td>`
  ).join('')
  const corpo = linhas.length === 0
    ? `<tr><td colspan="${colunas.length}" style="text-align:center;color:#777;">Nenhum registro encontrado.</td></tr>`
    : linhas.map(l => `<tr>${l.map((v, i) =>
        `<td${i > 0 ? ' class="col-encolhe"' : ''}>${v || '—'}</td>`
      ).join('')}</tr>`).join('')

  return `
    <table class="dados dados-autofit">
      <tr>${cabecalho}</tr>
      ${corpo}
    </table>
  `
}

function envolver(titulo: string, empresa: EmpresaInfo, subtitulo: string, corpo: string): string {
  return documentoBase({
    titulo,
    fontSize: '12pt',
    paisagem: true,
    margem: '10mm',
    corpoHtml: `
      <style>
        body, table.dados-autofit td { font-family: 'Calibri Light', Calibri, Arial, sans-serif; }
        .titulo { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; }
        table.dados-autofit { width: 100%; table-layout: auto; border-collapse: collapse; }
        table.dados-autofit td { font-size: 11pt; white-space: nowrap; padding: 5px 10px; border: 1px solid #999; }
        table.dados-autofit td:first-child { white-space: normal; overflow-wrap: break-word; word-break: normal; }
        table.dados-autofit td.col-encolhe { width: 1%; }
        table.dados-autofit td.label { font-weight: bold; background: #eee; }
      </style>
      ${cabecalhoComLogo(titulo, empresa.logo_url)}
      <p style="text-align:center;color:#555;margin-top:-6px;margin-bottom:14px;">
        ${nomeExibicaoEmpresa(empresa)} &nbsp;•&nbsp; ${subtitulo} &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}

// NOVO: Relatórios Financeiros detalhados (pedido do usuário) —
// Despesas por Data, Por Fornecedor, Por Colaborador e Consolidado
// (AP + Nota Fiscal + Folha de Pagamento).

export function gerarRelatorioDespesasPorData(
  empresa: EmpresaInfo, itens: any[], periodo: string, formatMoeda: (v: number) => string
): string {
  const linhas = itens.map(l => [fmtData(l.data), l.descricao, l.fornecedor_nome || '—', formatMoeda(Number(l.valor))])
  const total = itens.reduce((s, l) => s + Number(l.valor), 0)
  return envolver(
    'Despesas por Data',
    empresa,
    `${periodo} — ${itens.length} lançamento(s) — Total ${formatMoeda(total)}`,
    tabela(['Data', 'Descrição', 'Fornecedor', 'Valor'], linhas)
  )
}

export function gerarRelatorioPorFornecedor(
  empresa: EmpresaInfo, itens: any[], periodo: string, formatMoeda: (v: number) => string
): string {
  const linhas = itens.map(f => [f.fornecedor_nome, f.documento || '—', String(f.quantidade), formatMoeda(Number(f.total))])
  const total = itens.reduce((s, f) => s + Number(f.total), 0)
  return envolver(
    'Despesas por Fornecedor',
    empresa,
    `${periodo} — ${itens.length} fornecedor(es) — Total ${formatMoeda(total)}`,
    tabela(['Fornecedor', 'CNPJ/CPF', 'Lançamentos', 'Total'], linhas)
  )
}

export function gerarRelatorioPorColaborador(
  empresa: EmpresaInfo, itens: any[], periodo: string, formatMoeda: (v: number) => string
): string {
  const linhas = itens.map(c => [c.colaborador_nome, String(c.quantidade), formatMoeda(Number(c.total))])
  const total = itens.reduce((s, c) => s + Number(c.total), 0)
  return envolver(
    'Pagamentos a Colaboradores (Autorização de Pagamento)',
    empresa,
    `${periodo} — ${itens.length} colaborador(es) — Total ${formatMoeda(total)}`,
    tabela(['Colaborador', 'AP\'s', 'Total'], linhas)
  )
}

export function gerarRelatorioConsolidado(
  empresa: EmpresaInfo,
  dados: { totalAP: number; quantidadeAP: number; totalNF: number; quantidadeNF: number; totalFolha: number; quantidadeFolha: number; totalGeral: number },
  periodo: string,
  formatMoeda: (v: number) => string
): string {
  const linhas = [
    ['Autorizações de Pagamento', String(dados.quantidadeAP), formatMoeda(dados.totalAP)],
    ['Notas Fiscais', String(dados.quantidadeNF), formatMoeda(dados.totalNF)],
    ['Folha de Pagamento (salário + adicionais)', String(dados.quantidadeFolha) + ' folha(s)', formatMoeda(dados.totalFolha)],
  ]
  return envolver(
    'Relatório Consolidado',
    empresa,
    `${periodo} — Total geral ${formatMoeda(dados.totalGeral)}`,
    tabela(['Origem', 'Quantidade', 'Total'], linhas) + `
      <p style="margin-top:14px;font-size:10pt;color:#666;">
        * Folha de Pagamento soma o salário-base cadastral de cada colaborador (na data de hoje) +
        os adicionais lançados na folha (prêmio, horas extras, insalubridade etc.) − atrasos e faltas.
      </p>
    `
  )
}
