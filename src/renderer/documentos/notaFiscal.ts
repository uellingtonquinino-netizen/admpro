import { documentoBase, cabecalhoComLogo, fmtData, hoje } from './base'

export interface DadosNotaFiscal {
  logoUrl?:        string | null
  empresaNome:     string
  numeroNota?:     string | null
  numeroPedido?:   string | null
  data:            string
  fornecedorNome:  string
  boletos:         { valor: number; vencimento: string }[]
}

export function gerarHtmlNotaFiscal(dados: DadosNotaFiscal): string {
  const total = dados.boletos.reduce((soma, b) => soma + b.valor, 0)

  const linhasBoletos = dados.boletos.map(b => `
    <tr>
      <td>R$ ${b.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      <td>${fmtData(b.vencimento)}</td>
    </tr>
  `).join('')

  const corpo = `
    ${cabecalhoComLogo('Nota Fiscal', dados.logoUrl)}
    <div class="subtitulo" style="margin-top:-8px;">${dados.empresaNome}</div>

    <table class="dados">
      <tr>
        <td class="label">Nº da Nota</td>
        <td>${dados.numeroNota || '—'}</td>
        <td class="label">Nº do Pedido</td>
        <td>${dados.numeroPedido || '—'}</td>
      </tr>
      <tr>
        <td class="label">Data</td>
        <td>${fmtData(dados.data)}</td>
        <td class="label">Fornecedor</td>
        <td>${dados.fornecedorNome}</td>
      </tr>
    </table>

    <p class="campo" style="margin-top:14px;"><label>Boletos:</label></p>
    <table class="dados">
      <tr><td class="label">Valor</td><td class="label">Vencimento</td></tr>
      ${linhasBoletos}
    </table>

    <p class="campo" style="margin-top:10px;">
      <label>Valor total:</label> R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
    </p>

    <p class="campo" style="margin-top:20px;"><label>Emitido em:</label> ${hoje()}</p>
  `

  return documentoBase({
    titulo:    'Nota Fiscal',
    corpoHtml: corpo,
    fontSize:  '12pt',
  })
}
