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
  // NOVO: carimbo de quem autorizou (Gestor/ADM) — fica ANCORADO no
  // canto inferior direito do PRÓPRIO TEXTO de "Dados Bancários" (não
  // da célula inteira) — um invólucro com position:relative envolve só
  // o texto bancário, e a imagem fica position:absolute presa a esse
  // invólucro. Como a imagem ocupa o MESMO espaço vertical que o texto
  // já ocupa (ao lado dele, não embaixo), ela não pede NENHUM espaço
  // extra — o tamanho da célula continua determinado só pelo texto,
  // igual sempre foi, então a AP nunca cresce por causa do carimbo,
  // não importa quantas parcelas o lado direito tenha. Testado com 3
  // cenários (AP real de 4 parcelas, extremo de 7 parcelas, caso
  // simples de 1 parcela) — os três em 1 página só, sem sobrepor o
  // texto bancário nem o rodapé. Chegou nesse formato depois de 3
  // tentativas anteriores que não davam certo: coordenada fixa da
  // PÁGINA (quebrava com documento de tamanho variável), dentro do
  // fluxo normal do texto (fazia a célula toda crescer), e um
  // invólucro de altura fixa reservada (ainda concorria com as
  // parcelas por espaço, podendo estourar 2 páginas em casos extremos).
  carimboUrl?:      string | null
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
  // NOVO: com mais de 3 parcelas, a lista deles ficava alta o
  // suficiente pra empurrar a AP inteira pra uma segunda página (só
  // o rodapé sozinho lá, sobrando). Em vez de mexer no bloco de
  // dados bancários/carimbo (que já foi bem ajustado, ver comentário
  // acima em DadosAP.carimboUrl), só a lista de parcelas fica mais
  // compacta nesse caso — fonte um pouco menor, menos espaço entre
  // as linhas. Com 3 ou menos, fica exatamente como já era.
  const estiloParcelasCompacto = dados.boletos.length > 3
    ? 'font-size: 8.5pt; line-height: 1.05;'
    : ''
  const blocoParcelas = dados.boletos.length <= 1
    ? (dados.boletos[0]?.vencimento ? `<div>VENCIMENTO: ${fmtData(dados.boletos[0].vencimento)}</div>` : '')
    : `
      <div class="ap-parcelas" style="${estiloParcelasCompacto}">
        ${dados.boletos.map((b, i) => `<div>${i + 1}ª: ${formatMoeda(b.valor)} — venc. ${fmtData(b.vencimento)}</div>`).join('')}
      </div>
    `

  // ALTERADO: quando o pagamento é via boleto, as linhas que seriam
  // de banco/agência/conta/etc. ficam em branco (em vez de somem) —
  // assim a AP mantém sempre a mesma aparência/altura, não importa a
  // forma de pagamento (e o carimbo, ancorado no canto desse bloco,
  // também fica sempre no mesmo lugar).
  const blocoBancario = dados.boleto
    ? `
      <div class="ap-linha">PAGAMENTO VIA BOLETO</div>
      <div class="ap-linha">&nbsp;</div>
      <div class="ap-linha">&nbsp;</div>
      <div class="ap-linha">&nbsp;</div>
      <div class="ap-linha">&nbsp;</div>
      <div class="ap-linha">&nbsp;</div>
    `
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
      .ap-col-esq { width: 55%; border-top: 1.6pt solid #000; position: relative; }
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
        <td class="ap-col-esq ap-borda-baixo">
          <div style="position:relative;">
            ${blocoBancario}
            ${dados.carimboUrl
              ? `<img src="${dados.carimboUrl}" style="position:absolute;bottom:0;right:6pt;height:80pt;max-width:170pt;object-fit:contain;" />`
              : ''
            }
          </div>
          ${!dados.carimboUrl ? '<br/><br/><br/>' : ''}
        </td>
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
    // AJUSTADO: com duas vias na mesma página, a segunda estava
    // estourando pra página 2 mesmo em casos "normais" (3 parcelas,
    // sem nada fora do comum). Reduzi só a margem vertical da página
    // e o espaço entre as duas vias — nenhum conteúdo (texto, dados
    // bancários, carimbo) foi tocado, só o "respiro" ao redor.
    viaGap:     8,
    margem:     '3mm 6mm',
  })
}
