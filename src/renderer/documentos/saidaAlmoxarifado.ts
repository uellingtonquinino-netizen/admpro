import { documentoBase, cabecalhoComLogo, fmtData, hoje } from './base'

export interface ItemSaidaAlmoxarifado {
  produtoCodigo: string
  produtoNome:   string
  quantidade:    number
  unidade?:      string | null
}

export interface DadosSaidaAlmoxarifado {
  logoUrl?:          string | null
  empresaNome:       string
  data:              string
  itens:             ItemSaidaAlmoxarifado[]
  retiradoPorNome:   string
  setor?:            string | null
  solicitadoPorNome?: string | null
  liberadoPor?:      string | null
}

export function gerarHtmlSaidaAlmoxarifado(dados: DadosSaidaAlmoxarifado): string {
  const linhasItens = dados.itens.map(it => `
    <tr>
      <td>${it.produtoCodigo}</td>
      <td>${it.produtoNome}</td>
      <td style="text-align:right;">${it.quantidade}${it.unidade ? ` ${it.unidade}` : ''}</td>
    </tr>
  `).join('')

  const corpo = `
    ${cabecalhoComLogo('Comprovante de Retirada de Material', dados.logoUrl)}
    <div class="subtitulo" style="margin-top:-8px;">${dados.empresaNome}</div>

    <table class="dados">
      <tr>
        <td class="label">Data</td>
        <td>${fmtData(dados.data)}</td>
        <td class="label">Setor</td>
        <td>${dados.setor || '—'}</td>
      </tr>
      <tr>
        <td class="label">Retirado por</td>
        <td colspan="3">${dados.retiradoPorNome}</td>
      </tr>
      <tr>
        <td class="label">Solicitado por</td>
        <td colspan="3">${dados.solicitadoPorNome || '—'}</td>
      </tr>
    </table>

    <table class="dados" style="margin-top:10px;">
      <tr>
        <td class="label">Código</td>
        <td class="label">Material/Ferramenta</td>
        <td class="label" style="text-align:right;">Quantidade</td>
      </tr>
      ${linhasItens}
    </table>

    <div class="assinaturas">
      <div class="assinatura">${dados.retiradoPorNome}<br />Retirado por</div>
      <div class="assinatura">${dados.liberadoPor || '—'}<br />Almoxarifado</div>
    </div>

    <p class="campo" style="margin-top:20px;"><label>Emitido em:</label> ${hoje()}</p>
  `

  return documentoBase({
    titulo:    'Comprovante de Retirada',
    corpoHtml: corpo,
    fontSize:  '12pt',
  })
}
