import { documentoBase, cabecalhoComLogo, fmtData, hoje, nomeExibicaoEmpresa } from './base'

interface EmpresaInfo {
  nome: string
  razao_social?: string | null
  logo_url?: string | null
}

interface ParcelaCapa {
  valor:      number
  vencimento: string
}

export interface NfCapaItem {
  numero:          number
  numero_pedido:   string
  numero_nf:       string
  data_emissao_nf: string | null
  fornecedor_nome: string
  // Sempre 4 posições — a posição fica null quando a nota não tem
  // aquela parcela (colunas de Parc./Venc. correspondentes ficam
  // em branco na capa, sem inventar dado).
  parcelas:        (ParcelaCapa | null)[]
  valor_total:      number
}

// NOVO: "capa" das Notas Fiscais selecionadas — mesma ideia da capa
// de AP (planilha com total geral no final), mas com as colunas
// próprias da Nota Fiscal: pedido, número da NF, data de emissão da
// NF física, fornecedor e até 4 parcelas (as mesmas lançadas na
// gravação da nota) com seus vencimentos.
export function gerarCapaNotasFiscais(
  empresa: EmpresaInfo, titulo: string, itens: NfCapaItem[], formatMoeda: (v: number) => string,
): string {
  const colunas = [
    'Num', 'N° Pedido', 'N° Nota', 'Emissão da NF', 'Fornecedor',
    'Parc. 01', 'Venc. 01', 'Parc. 02', 'Venc. 02', 'Parc. 03', 'Venc. 03', 'Parc. 04', 'Venc. 04',
    'Valor da Nota',
  ]

  const total = itens.reduce((soma, i) => soma + i.valor_total, 0)

  // Só a coluna "Fornecedor" (índice 4) fica larga — texto livre. O
  // resto encolhe pro tamanho do próprio conteúdo, igual a capa de AP.
  const cabecalho = colunas.map((c, i) =>
    `<td class="label${i !== 4 ? ' col-encolhe' : ''}">${c}</td>`
  ).join('')

  const linhas = itens.length === 0
    ? `<tr><td colspan="${colunas.length}" style="text-align:center;color:#777;">Nenhuma nota selecionada.</td></tr>`
    : itens.map(i => {
        const parcelasCols = Array.from({ length: 4 }, (_, idx) => i.parcelas[idx] ?? null)
          .map(p => `
            <td class="col-encolhe" style="text-align:right;">${p ? formatMoeda(p.valor) : ''}</td>
            <td class="col-encolhe">${p ? fmtData(p.vencimento) : ''}</td>
          `).join('')

        return `
        <tr>
          <td class="col-encolhe">${i.numero}</td>
          <td class="col-encolhe">${i.numero_pedido || '—'}</td>
          <td class="col-encolhe">${i.numero_nf || '—'}</td>
          <td class="col-encolhe">${i.data_emissao_nf ? fmtData(i.data_emissao_nf) : '—'}</td>
          <td>${i.fornecedor_nome || '—'}</td>
          ${parcelasCols}
          <td class="col-encolhe" style="text-align:right;">${formatMoeda(i.valor_total)}</td>
        </tr>
      `
      }).join('')

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
        ${nomeExibicaoEmpresa(empresa)} &nbsp;•&nbsp; ${itens.length} nota(s) &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}
