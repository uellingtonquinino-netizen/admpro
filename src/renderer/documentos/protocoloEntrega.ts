import { documentoBase, cabecalhoComLogo, hoje, type ColaboradorDoc, type EmpresaDoc } from './base'
import { formatCPF } from '../utils/documentValidators'

export interface DadosProtocolo {
  quantidade:     string   // campo livre — pode vir "2" ou "2 pares", etc.
  item:           string
  valorUnitario:  number
  dataEntrega?:   string   // dd/mm/aaaa — padrão: hoje
  local?:         string   // cidade/UF onde é assinado — padrão: cidade da empresa
}

function formatMoeda(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Extrai só a parte numérica do início de "quantidade" (aceita "2",
// "2 pares", "2x" etc.) — usado pra calcular o valor total do
// desconto. Se não conseguir reconhecer um número, assume 1 (melhor
// mostrar um total conservador do que quebrar a geração do documento).
function quantidadeNumerica(quantidade: string): number {
  const match = /^\s*(\d+(?:[.,]\d+)?)/.exec(quantidade)
  if (!match) return 1
  return Number(match[1].replace(',', '.')) || 1
}

// NOVO: bloco de UM colaborador — usado tanto sozinho (documento
// individual, mesmo padrão dos outros ~15 documentos de RH) quanto
// repetido vários (ou todos) colaboradores, um atrás do outro, cada
// um dentro da própria caixa (delineado por borda), em ordem
// alfabética — ver ProtocoloEntregaModal.tsx.
export function gerarBlocoProtocolo(c: ColaboradorDoc, empresa: EmpresaDoc, d: DadosProtocolo): string {
  const dataEntrega = d.dataEntrega || hoje()
  const local = d.local || '_______________'
  const valorTotal = quantidadeNumerica(d.quantidade) * d.valorUnitario

  return `
    <div class="box" style="page-break-inside:avoid;">
      <p class="campo-linha"><label>NOME:</label> <span class="preenchido">${c.nome}</span></p>
      <p class="campo-linha"><label>FUNÇÃO:</label> <span class="preenchido">${c.funcao ?? '—'}</span></p>
      <p class="campo-linha"><label>CPF:</label> <span class="preenchido">${formatCPF(c.cpf) || '—'}</span></p>

      <p class="texto-corpo" style="margin:10px 0;">
        Declaro ter recebido da ${empresa.razao_social || empresa.nome} dia ${dataEntrega},
        <strong>${d.quantidade} ${d.item}</strong> no valor unitário de <strong>${formatMoeda(d.valorUnitario)}</strong>
        para uso pessoal no canteiro de obras e estou ciente de que sou responsável pela sua guarda e
        conservação, e que a não devolução do(s) mesmo(s) quando solicitado pela empresa acarretará no
        desconto do valor total de <strong>${formatMoeda(valorTotal)}</strong>.
      </p>

      <p class="campo" style="margin:14px 0 26px;">${local} &nbsp;&nbsp; ${dataEntrega}</p>

      <div class="assinatura-linha">
        <div class="linha-ass"></div>
        Assinatura do colaborador
      </div>
    </div>
  `
}

// Documento individual — mesmo padrão dos outros tipos de documento
// (chamado a partir de GerarDocumentoModal, um colaborador por vez).
export function gerarHtmlProtocoloEntrega(c: ColaboradorDoc, empresa: EmpresaDoc, d: DadosProtocolo): string {
  const corpo = `
    ${cabecalhoComLogo('Protocolo de Entrega', empresa.logo_url)}
    ${gerarBlocoProtocolo(c, empresa, d)}
  `
  return documentoBase({ titulo: 'Protocolo de Entrega', corpoHtml: corpo })
}

// Vários/todos os colaboradores — um bloco atrás do outro, em ordem
// alfabética, cada um na própria caixa. Um cabeçalho só, no topo.
export function gerarHtmlProtocoloEntregaMultiplo(
  colaboradores: ColaboradorDoc[], empresa: EmpresaDoc, d: DadosProtocolo
): string {
  const ordenados = [...colaboradores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const corpo = `
    ${cabecalhoComLogo('Protocolo de Entrega', empresa.logo_url)}
    ${ordenados.map(c => gerarBlocoProtocolo(c, empresa, d)).join('')}
  `
  return documentoBase({ titulo: 'Protocolo de Entrega', corpoHtml: corpo })
}
