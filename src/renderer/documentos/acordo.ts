import { documentoBase, cabecalhoComLogo, hoje } from './base'
import { formatCPF } from '../utils/documentValidators'

export interface ColaboradorLinha {
  nome: string
  cpf:  string | null
}

export interface ItemCompensacao {
  dataTrabalho: string  // já formatada, ex: "30/05/2026 (sábado)"
  dataFolga:    string
}

export interface DadosAcordo {
  logoUrl?:        string | null
  empresaNome:     string
  empresaCnpj?:    string | null
  empresaEndereco?: string | null
  ramoAtividade:   string
  obra:            string
  cidadeObra:      string
  itens:           ItemCompensacao[]
  local:           string
  colaboradores:   ColaboradorLinha[]
}

export function gerarHtmlAcordo(d: DadosAcordo): string {
  const corpo = `
    ${cabecalhoComLogo('Acordo de Compensação', d.logoUrl)}

    <p class="texto-corpo">
      A ${d.empresaNome}${d.empresaCnpj ? `, CNPJ – ${d.empresaCnpj}` : ''}${d.empresaEndereco ? `,
      estabelecida a ${d.empresaEndereco}` : ''}. Com o ramo de atividade de ${d.ramoAtividade}, e, os
      funcionários abaixo descritos da Obra ${d.obra}:
    </p>

    <p class="texto-corpo" style="text-align:center;font-weight:600;">Acordam entre si o seguinte:</p>

    ${d.itens.map((item, i) => `
      <p class="texto-corpo" style="font-weight:600;">
        ${i + 1}. Trabalharei no dia ${item.dataTrabalho}, para compensação do dia ${item.dataFolga}, onde estarei de folga.
      </p>
    `).join('')}

    <p class="texto-corpo" style="font-weight:600;">
      Estou ciente de que a minha ausência em um dia compensatório acarretará na computação de falta
      no dia compensado, onde não haverá expediente.
    </p>

    <p class="campo" style="margin:14px 0;">${d.local || d.cidadeObra} &nbsp;&nbsp; ${hoje()}</p>

    <div style="margin-top:24px;">
      ${d.colaboradores.map(c => `
        <div style="border-top:1px solid #333;padding-top:4px;margin-top:22px;text-align:center;">
          ${c.nome} &nbsp;&nbsp; CPF: ${formatCPF(c.cpf) || '_______________'}
        </div>
      `).join('')}
    </div>
  `

  return documentoBase({
    titulo:    'Acordo de Compensação',
    corpoHtml: corpo,
  })
}
