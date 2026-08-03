import { documentoBase, fmtData } from './base'
import { numeroPorExtenso }     from '../utils/numeroPorExtenso'

export interface BoletoAP {
  valor:      number
  vencimento: string
}

// ALTERADO: modelo reconstruído pra ficar igual ao Excel real da
// empresa (AP_CARLA_SANDRA.xlsm) — layout em caixa com duas colunas,
// bordas exatamente onde o modelo tem. `banco`/`agencia`/`conta` vêm
// separados agora (em vez de um texto único já montado) porque o
// modelo mostra cada dado numa linha própria, sob "CONTA PRA
// DEPÓSITO:". `boleto: true` troca esse bloco por um aviso de boleto.
export interface DadosAP {
  centroCusto:      string  // Razão Social da obra — ver AutorizacaoPagamento.tsx
  logoUrl?:         string | null
  beneficiarioNome: string
  documento:        string  // "CNPJ: ..." ou "CPF: ..."
  descricao:        string
  boletos:          BoletoAP[]
  boleto?:          boolean
  banco?:           string | null
  agencia?:         string | null
  conta?:           string | null
  contaDigito?:     string | null
  // Alternativa aos campos acima — texto livre já pronto (usado nas
  // telas de emitir/editar AP, onde o ADM pode ajustar o texto à mão
  // depois do preenchimento automático a partir do cadastro).
  dadosBancariosTexto?: string
  observacoes:      string
  solicitante:      string
  autorizadoPor:    string
  dataEmissao?:     string  // já formatada dd/mm/aaaa — padrão: hoje
}

function multilinha(txt: string): string {
  return (txt || '').split('\n').map(l => l.trim()).filter(Boolean).join('<br/>')
}

export function gerarHtmlAP(dados: DadosAP): string {
  const total = dados.boletos.reduce((soma, b) => soma + b.valor, 0)
  const formatMoeda = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  const dataEmissao = dados.dataEmissao || new Date().toLocaleDateString('pt-BR')

  // Uma parcela: valor, extenso, depois o vencimento.
  // Mais de uma: uma linha por parcela, com vencimento em cada uma.
  const blocoParcelas = dados.boletos.length <= 1
    ? (dados.boletos[0]?.vencimento ? `<div>VENCIMENTO: ${fmtData(dados.boletos[0].vencimento)}</div>` : '')
    : `
      <div class="ap-parcelas">
        ${dados.boletos.map((b, i) => `<div>${i + 1}ª: ${formatMoeda(b.valor)} — venc. ${fmtData(b.vencimento)}</div>`).join('')}
      </div>
    `

  const blocoBancario = dados.boleto
    ? `<div class="ap-linha">PAGAMENTO VIA BOLETO</div>`
    : dados.dadosBancariosTexto !== undefined
    ? `<div class="ap-linha">CONTA PRA DEPÓSITO:</div>${multilinha(dados.dadosBancariosTexto) || '<div class="ap-linha">—</div>'}`
    : `
      <div class="ap-linha">CONTA PRA DEPÓSITO:</div>
      <div class="ap-linha">${dados.banco || '—'}</div>
      <div class="ap-linha">AG: ${dados.agencia || '—'}</div>
      <div class="ap-linha">CONTA CORRENTE: ${dados.conta ? dados.conta + (dados.contaDigito ? '-' + dados.contaDigito : '') : '—'}</div>
      <div class="ap-linha">${dados.beneficiarioNome}</div>
      <div class="ap-linha">${dados.documento}</div>
    `

  const corpo = `
    <style>
      /* Modelo replicado do Excel real da empresa (AP_CARLA_SANDRA.xlsm)
         — não reaproveita table.dados (que vem com 12pt fixo do
         documento base); tem o próprio tamanho de fonte, igual ao
         modelo original. */
      .ap-tabela { width: 100%; border-collapse: collapse; border: 1.6pt solid #000;
                   font-family: Arial, sans-serif; font-size: 9.5pt; table-layout: fixed; }
      .ap-tabela td { border-left: 1.6pt solid #000; border-right: 1.6pt solid #000;
                      padding: 3px 8px; vertical-align: top; }
      .ap-titulo td { text-align: center; font-size: 10pt; padding: 6px 8px 2px;
                       border-top: 1.6pt solid #000; border-bottom: 1.6pt solid #000; }
      .ap-titulo .ap-subtitulo { display: block; margin-top: 1px; }
      .ap-centro-custo td { font-weight: bold; border-top: 1.6pt solid #000;
                             border-bottom: 1.6pt solid #000; padding: 5px 8px; }
      .ap-razao td { font-weight: bold; font-size: 10.5pt; padding-top: 6px; }
      .ap-doc td { border-bottom: 1.6pt solid #000; padding-bottom: 6px; }
      .ap-col-esq { width: 55%; border-top: 1.6pt solid #000; }
      .ap-col-dir { width: 45%; border-top: 1.6pt solid #000; }
      .ap-borda-baixo { border-bottom: 1.6pt solid #000; }
      .ap-valor-caixa { font-weight: bold; font-size: 12.5pt; text-align: right;
                         padding: 3px 0; margin-bottom: 14px; }
      .ap-valor-extenso-label { font-weight: bold; }
      .ap-header-esq, .ap-header-dir { font-weight: bold; font-size: 10.5pt;
                                        border-top: 1.6pt solid #000; padding: 5px 8px 3px; }
      .ap-linha { margin-bottom: 1px; }
      .ap-parcelas { margin-top: 4px; font-weight: bold; }
      .ap-rodape { border-top: 1.6pt solid #000; border-bottom: 1.6pt solid #000; padding: 5px 8px; }
    </style>
    <table class="ap-tabela">
      <tr class="ap-titulo"><td colspan="2">
        <div style="display:flex;align-items:center;">
          ${dados.logoUrl ? `<img src="${dados.logoUrl}" style="height:96px;max-width:360px;object-fit:contain;object-position:left;margin-right:8px;" />` : ''}
          <div style="flex:1;text-align:center;">
            AUTORIZAÇÃO DE PAGAMENTO
            <span class="ap-subtitulo">FORNECEDORES / EMPREITEIROS / PROFISSIONAIS LIBERAIS</span>
          </div>
        </div>
      </td></tr>
      <tr class="ap-centro-custo"><td colspan="2">CENTRO DE CUSTO: ${dados.centroCusto}</td></tr>
      <tr class="ap-razao"><td colspan="2">RAZÃO SOCIAL / NOME: ${dados.beneficiarioNome}</td></tr>
      <tr class="ap-doc"><td colspan="2">${dados.documento}</td></tr>
      <tr>
        <td class="ap-col-esq ap-borda-baixo">
          <strong>DESCRIÇÃO&nbsp;&nbsp;DOS SERVIÇOS / MATERIAS:</strong><br/>
          ${multilinha(dados.descricao) || '—'}
        </td>
        <td class="ap-col-dir ap-borda-baixo">
          <div class="ap-valor-caixa">${formatMoeda(total)}</div>
          <div class="ap-valor-extenso-label">VALOR POR EXTENSO:</div>
          <div>${numeroPorExtenso(total)}</div>
          ${blocoParcelas}
        </td>
      </tr>
      <tr>
        <td class="ap-header-esq">DADOS BANCARIOS:</td>
        <td class="ap-header-dir">OBSERVAÇÕES:</td>
      </tr>
      <tr>
        <td class="ap-col-esq ap-borda-baixo">${blocoBancario}<br/><br/><br/></td>
        <td class="ap-col-dir ap-borda-baixo">${multilinha(dados.observacoes) || '—'}</td>
      </tr>
      <tr>
        <td class="ap-rodape" colspan="2">
          SOLICITANTE: ${dados.solicitante || '—'}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;DATA DE EMISSÃO: ${dataEmissao}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;AUTORIZADO POR: ${dados.autorizadoPor || '—'}
        </td>
      </tr>
    </table>
  `

  return documentoBase({
    titulo:     'Autorização de Pagamento',
    corpoHtml:  corpo,
    duasVias:   true,
    fontSize:   '9.5pt',
    lineHeight: 1.2,
    viaGap:     14,
    margem:     '5mm 6mm',
  })
}
