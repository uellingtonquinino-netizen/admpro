import { documentoBase, cabecalhoComLogo, fmtData, hoje } from './base'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'

interface EmpresaInfo {
  nome: string
  logo_url?: string | null
}

export interface ApCapaItem {
  numero:            number
  data_emissao:      string
  nome_razao_social: string
  documento:         string  // CNPJ ou CPF, já formatado
  banco:             string
  agencia:           string
  operacao:          string
  conta:             string
  descricao:         string
  vencimento:        string | null
  valor_total:       number
}

// NOVO: "capa" do lote — uma lista só, em formato de planilha, com
// todas as AP's selecionadas e o total geral no final. Pensada pra
// ir junto (ou no lugar) dos PDFs individuais quando o lote é
// enviado/exportado.
export function gerarCapaLote(empresa: EmpresaInfo, tituloLote: string, itens: ApCapaItem[], formatMoeda: (v: number) => string): string {
  const colunas = [
    'Num', 'Data Emissão', 'Nome / Razão Social', 'CNPJ / CPF',
    'Banco', 'Agência', 'OP', 'Conta', 'Descrição', 'Vencimento', 'Valor Total',
  ]

  const total = itens.reduce((soma, i) => soma + i.valor_total, 0)

  const cabecalho = colunas.map((c, i) =>
    `<td class="label${i !== 2 && i !== 8 ? ' col-encolhe' : ''}">${c}</td>`
  ).join('')

  const linhas = itens.length === 0
    ? `<tr><td colspan="${colunas.length}" style="text-align:center;color:#777;">Nenhuma AP nesse lote.</td></tr>`
    : itens.map(i => `
        <tr>
          <td class="col-encolhe">${i.numero}</td>
          <td class="col-encolhe">${fmtData(i.data_emissao)}</td>
          <td>${i.nome_razao_social || '—'}</td>
          <td class="col-encolhe">${i.documento || '—'}</td>
          <td class="col-encolhe">${i.banco || '—'}</td>
          <td class="col-encolhe">${i.agencia || '—'}</td>
          <td class="col-encolhe">${i.operacao || '—'}</td>
          <td class="col-encolhe">${i.conta || '—'}</td>
          <td>${i.descricao || '—'}</td>
          <td class="col-encolhe">${i.vencimento ? fmtData(i.vencimento) : '—'}</td>
          <td class="col-encolhe" style="text-align:right;">${formatMoeda(i.valor_total)}</td>
        </tr>
      `).join('')

  const linhaTotal = `
    <tr class="linha-total">
      <td colspan="${colunas.length - 1}" style="text-align:right;font-weight:bold;">TOTAL GERAL</td>
      <td class="col-encolhe" style="text-align:right;font-weight:bold;">${formatMoeda(total)}</td>
    </tr>
  `

  const corpo = `
    <table class="dados dados-autofit">
      <tr>${cabecalho}</tr>
      ${linhas}
      ${linhaTotal}
    </table>
  `

  return documentoBase({
    titulo: tituloLote,
    fontSize: '9pt',
    paisagem: true,
    margem: '8mm 8mm',
    corpoHtml: `
      <style>
        body, table.dados-autofit td { font-family: 'Calibri Light', Calibri, Arial, sans-serif; font-weight: bold; }
        .titulo { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; }
        table.dados-autofit { width: 100%; table-layout: auto; border-collapse: collapse; font-size: 9pt; }
        table.dados-autofit td { font-size: 9pt; white-space: nowrap; padding: 4px 8px; border: 1px solid #888; }
        table.dados-autofit td:not(.col-encolhe) { white-space: normal; overflow-wrap: break-word; word-break: normal; }
        table.dados-autofit td.col-encolhe { width: 1%; }
        table.dados-autofit tr.linha-total td { border-top: 2px solid #333; padding-top: 8px; }
      </style>
      ${cabecalhoComLogo(tituloLote, empresa.logo_url)}
      <p style="text-align:center;color:#555;margin-top:-6px;margin-bottom:14px;">
        ${empresa.nome} &nbsp;•&nbsp; ${itens.length} AP(s) &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}

// NOVO: Autorização de Pagamento em Lote — mesmo estilo visual da
// capa acima, mas 1 valor por beneficiário (sem vencimento avulso,
// já que o pagamento em lote é sempre à vista/mesma data).
export interface ApLoteCapaItem {
  numero:      number
  nome:        string
  documento:   string  // CNPJ ou CPF, já formatado
  descricao:   string
  valor:       number
  banco:       string
  agencia:     string
  operacao:    string
  conta:       string
  tipo_conta:  string
}

export function gerarCapaAPLote(
  empresa: EmpresaInfo, titulo: string, dataEmissao: string, itens: ApLoteCapaItem[], formatMoeda: (v: number) => string
): string {
  const colunas = ['Num', 'Nome', 'CNPJ / CPF', 'Descrição', 'Banco', 'Agência', 'OP', 'Conta', 'Tipo', 'Valor']
  const total = itens.reduce((soma, i) => soma + i.valor, 0)

  const cabecalho = colunas.map((c, i) =>
    `<td class="label${i !== 1 && i !== 3 ? ' col-encolhe' : ''}">${c}</td>`
  ).join('')

  const linhas = itens.length === 0
    ? `<tr><td colspan="${colunas.length}" style="text-align:center;color:#777;">Nenhum beneficiário nesse lote.</td></tr>`
    : itens.map(i => `
        <tr>
          <td class="col-encolhe">${i.numero}</td>
          <td>${i.nome || '—'}</td>
          <td class="col-encolhe">${i.documento || '—'}</td>
          <td>${i.descricao || '—'}</td>
          <td class="col-encolhe">${i.banco || '—'}</td>
          <td class="col-encolhe">${i.agencia || '—'}</td>
          <td class="col-encolhe">${i.operacao || '—'}</td>
          <td class="col-encolhe">${i.conta || '—'}</td>
          <td class="col-encolhe">${i.tipo_conta || '—'}</td>
          <td class="col-encolhe" style="text-align:right;">${formatMoeda(i.valor)}</td>
        </tr>
      `).join('')

  const linhaTotal = `
    <tr class="linha-total">
      <td colspan="${colunas.length - 1}" style="text-align:right;font-weight:bold;">TOTAL GERAL</td>
      <td class="col-encolhe" style="text-align:right;font-weight:bold;">${formatMoeda(total)}</td>
    </tr>
  `

  const corpo = `
    <table class="dados dados-autofit">
      <tr>${cabecalho}</tr>
      ${linhas}
      ${linhaTotal}
    </table>
  `

  return documentoBase({
    titulo,
    fontSize: '9pt',
    paisagem: true,
    margem: '8mm 8mm',
    corpoHtml: `
      <style>
        body, table.dados-autofit td { font-family: 'Calibri Light', Calibri, Arial, sans-serif; font-weight: bold; }
        .titulo { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; }
        table.dados-autofit { width: 100%; table-layout: auto; border-collapse: collapse; font-size: 9pt; }
        table.dados-autofit td { font-size: 9pt; white-space: nowrap; padding: 4px 8px; border: 1px solid #888; }
        table.dados-autofit td:not(.col-encolhe) { white-space: normal; overflow-wrap: break-word; word-break: normal; }
        table.dados-autofit td.col-encolhe { width: 1%; }
        table.dados-autofit tr.linha-total td { border-top: 2px solid #333; padding-top: 8px; }
      </style>
      ${cabecalhoComLogo(titulo, empresa.logo_url)}
      <p style="text-align:center;color:#555;margin-top:-6px;margin-bottom:14px;">
        ${empresa.nome} &nbsp;•&nbsp; Emissão ${fmtData(dataEmissao)} &nbsp;•&nbsp; ${itens.length} beneficiário(s) &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}
