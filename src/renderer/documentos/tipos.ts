import { documentoBase, fmtData, hoje, cabecalhoComLogo, chk, type ColaboradorDoc, type EmpresaDoc } from './base'
import { numeroPorExtenso } from '../utils/numeroPorExtenso'
import { formatCPF, formatCNPJ } from '../utils/documentValidators'
import { proximoDiaUtil } from '../utils/proximoDiaUtil'

export interface CampoExtra {
  key:      string
  label:    string
  type:     'text' | 'date' | 'number' | 'textarea' | 'select' | 'multiselect' | 'horas_extras' | 'hora'
  options?: string[]
  default?: string
}

export interface TipoDocumento {
  id:           string
  label:        string
  campos:       CampoExtra[]
  paisagem?:    boolean
  gerarHtml:    (c: ColaboradorDoc, empresa: EmpresaDoc, extras: Record<string, string>) => string
}

const CAMPOS_LOCAL_DATA: CampoExtra[] = [
  { key: 'local', label: 'Cidade - UF', type: 'text', default: '' },
]

// "Categoria" no sentido trabalhista do termo (não confundir com
// Cor/Raça) — deriva do Tipo de contrato já cadastrado, em vez de
// pedir de novo a cada documento gerado.
function categoriaPorContrato(tipo?: string | null): string {
  const mapa: Record<string, string> = {
    'CLT': 'Empregado',
    'Temporário': 'Empregado (Temporário)',
    'Estágio': 'Estagiário',
    'PJ': 'Prestador de Serviço (PJ)',
  }
  return (tipo && mapa[tipo]) || tipo || '—'
}

// Endereço residencial em uma linha só, no mesmo espírito do modelo
// original (rua, número, bairro — cidade/UF — CEP).
function enderecoCompleto(c: ColaboradorDoc): string {
  const linha1 = [c.endereco, c.numero ? `Nº ${c.numero}` : null, c.bairro].filter(Boolean).join(', ')
  const cidadeUf = [c.cidade, c.estado].filter(Boolean).join(' - ')
  const partes = [linha1, cidadeUf].filter(Boolean)
  if (partes.length === 0) return '—'
  return partes.join(' — ') + (c.cep ? ` — CEP: ${c.cep}` : '')
}

function cabecalhoColaborador(c: ColaboradorDoc, numeroVia?: number) {
  const viaLabel = numeroVia === 1 ? '1° VIA' : numeroVia === 2 ? '2° VIA' : ''
  return `
    ${viaLabel ? `<p style="font-weight:700;margin-bottom:6px;">${viaLabel}</p>` : ''}
    <p class="campo-linha"><label>NOME:</label> <span class="preenchido">${c.nome}</span></p>
    <p class="campo-linha"><label>FUNÇÃO:</label> <span class="preenchido">${c.funcao ?? '—'}</span></p>
    <p class="campo-linha"><label>CTPS:</label> <span class="preenchido">${c.ctps ?? '—'}</span> <label>SÉRIE:</label> <span class="preenchido">${c.ctps_serie ?? '—'}</span></p>
  `
}

// Rodapé de assinaturas + testemunhas usado em advertência e suspensão
function rodapeDisciplinar(local: string) {
  return `
    <p style="margin-top:24px;">${local || '_______________'} &nbsp; ${hoje()}</p>
    <div class="assinaturas">
      <div class="assinatura">Ass.: e carimbo da empresa</div>
      <div class="assinatura">Ass. do empregado<br>Ciente: ${hoje()}</div>
    </div>
    <div class="assinaturas" style="margin-top:60px;">
      <div class="assinatura">Testemunha I &nbsp; CPF: _______________</div>
      <div class="assinatura">Testemunha II &nbsp; CPF: _______________</div>
    </div>
  `
}

export const TIPOS_DOCUMENTO: TipoDocumento[] = [

  // ── 1. Ficha de EPI ─────────────────────────────────────
  {
    id: 'ficha_epi',
    label: 'Ficha de Controle e Entrega de EPI',
    paisagem: true,
    campos: [
      { key: 'responsavel', label: 'Responsável pela entrega', type: 'text' },
    ],
    gerarHtml: (c, empresa, ex) => {
      // Larguras vêm do Excel de referência (lidas em tempo real antes de
      // chamar esta função — ver GerarDocumentoModal.tsx). Caso a leitura
      // falhe por algum motivo, usa como reserva os mesmos valores já
      // lidos do arquivo original enviado (não são uma estimativa nova).
      const FALLBACK: Record<string, number> = {
        data_entrega: 8.42, qtd: 3.22, descricao: 23.00, ca: 12.61,
        a: 2.21, s: 2.21, p: 2.21, d: 2.21,
        assinatura: 20.55, devolucao: 8.42, rubrica: 14.94,
      }
      let larguras = FALLBACK
      try {
        if (ex.larguras_colunas) {
          const lidas = JSON.parse(ex.larguras_colunas)
          if (lidas && typeof lidas === 'object') larguras = lidas
        }
      } catch { /* mantém FALLBACK */ }

      const w = (chave: string) => `${(larguras[chave] ?? FALLBACK[chave]).toFixed(2)}%`

      // Cabeçalho da tabela de itens — repetido nas duas páginas, já
      // que cada uma tem sua própria caixa com borda.
      const cabecalhoTabela = `
        <colgroup>
          <col style="width:${w('data_entrega')}">
          <col style="width:${w('qtd')}">
          <col style="width:${w('descricao')}">
          <col style="width:${w('ca')}">
          <col style="width:${w('a')}">
          <col style="width:${w('s')}">
          <col style="width:${w('p')}">
          <col style="width:${w('d')}">
          <col style="width:${w('assinatura')}">
          <col style="width:${w('devolucao')}">
          <col style="width:${w('rubrica')}">
        </colgroup>
        <tr>
          <td class="label" style="width:${w('data_entrega')}">Data entrega</td>
          <td class="label" style="width:${w('qtd')}">Qtd</td>
          <td class="label" style="width:${w('descricao')}">Descrição</td>
          <td class="label" style="width:${w('ca')}">CA n°</td>
          <td class="label chk-col" style="width:${w('a')}">A</td>
          <td class="label chk-col" style="width:${w('s')}">S</td>
          <td class="label chk-col" style="width:${w('p')}">P</td>
          <td class="label chk-col" style="width:${w('d')}">D</td>
          <td class="label" style="width:${w('assinatura')}">Assinatura</td>
          <td class="label" style="width:${w('devolucao')}">Devolução<br><span style="font-weight:400;">Data</span></td>
          <td class="label" style="width:${w('rubrica')}">Rubrica</td>
        </tr>
      `
      const linhaVazia = `
        <tr>
          <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
          <td class="chk-col">&nbsp;</td><td class="chk-col">&nbsp;</td><td class="chk-col">&nbsp;</td><td class="chk-col">&nbsp;</td>
          <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
        </tr>
      `

      return documentoBase({
      titulo: 'Ficha de EPI',
      paisagem: true,
      corpoHtml: `
        <div class="form-outer" style="font-size:10.5px;page-break-after:always;">
          ${cabecalhoComLogo('Ficha de Controle e Entrega de Equipamento de Proteção Individual', empresa.logo_url)}
          <table class="dados epi-cabecalho">
            <tr>
              <td class="label">Nome</td><td>${c.nome}</td>
              <td class="label">CPF</td><td>${formatCPF(c.cpf) || '—'}</td>
              <td class="label">Data de admissão</td><td>${fmtData(c.data_admissao)}</td>
              <td class="label" rowspan="2">Responsável pela<br>entrega do EPI</td>
              <td rowspan="2">${ex.responsavel ?? '—'}</td>
            </tr>
            <tr>
              <td class="label">Função</td><td>${c.funcao ?? '—'}</td>
              <td class="label">Nascimento</td><td>${fmtData(c.nascimento)}</td>
              <td class="label">Data de demissão</td><td>${fmtData(c.data_demissao)}</td>
            </tr>
          </table>

          <div class="box" style="margin:6px 0;padding:6px 10px;font-size:9.5px;line-height:1.3;">
            <strong>DECLARO</strong> ter recebido o(s) Equipamento(s) de Proteção Individual - EPI's, abaixo
            especificado(s), nos termos dos artigos 166 e 167 da CLT, com redação dada pela Lei Federal
            n° 6.514/77, objetivando a proteção da incolumidade física, bem como a neutralização de agentes
            insalubres conforme o art. 191, inciso II, da norma jurídica mencionada, e ainda o treinamento
            para o uso correto do(s) mesmo(s). <strong>COMPROMETO-ME</strong> a utilizá-los sempre para os
            fins a que se destinam, estando ciente que o não uso incorrerá contra a minha pessoa em ato
            faltoso, sujeitando-me às penalidades legais. <strong>RESPONSABILIZO-ME</strong> por sua guarda,
            conservação, uso correto e devolução ao SESMT em qualquer estado que se encontre o equipamento,
            indenizando a empresa no caso de perda, extravio ou danos por uso incorreto (art. 462, § 1°, da
            CLT), e pela comunicação ao superior hierárquico ou Técnico em Segurança do Trabalho caso ocorra
            qualquer alteração que o torne impróprio para o uso.
          </div>

          <table class="dados epi-itens">
            ${cabecalhoTabela}
            ${Array.from({ length: 20 }).map(() => linhaVazia).join('')}
          </table>
        </div>

        <div class="form-outer" style="font-size:10.5px;">
          <table class="dados epi-itens">
            ${cabecalhoTabela}
            ${Array.from({ length: 30 }).map(() => linhaVazia).join('')}
          </table>
          <p style="font-size:9px;color:#555;margin:4px 0;">A = Admissão &nbsp; S = Substituição &nbsp; P = Perda &nbsp; D = Dolo</p>
          <p class="campo-linha" style="margin-top:4px;">
            <label>Data:</label> ____/____/________
            <label style="margin-left:24px;">Assinatura do funcionário:</label>
            <span class="preenchido"></span>
          </p>
        </div>
      `,
      })
    },
  },

  // ── 2. Aviso Prévio Indenizado ──────────────────────────
  {
    id: 'aviso_previo',
    label: 'Aviso Prévio Indenizado',
    campos: [
      ...CAMPOS_LOCAL_DATA,
      { key: 'dias_prazo', label: 'Dias para comparecer (ciência de pagamento)', type: 'number', default: '9' },
    ],
    gerarHtml: (c, empresa, ex) => {
      const dias = Number(ex.dias_prazo || 9)
      const prazo = new Date()
      prazo.setDate(prazo.getDate() + dias)
      const prazoFmt = prazo.toLocaleDateString('pt-BR')

      return documentoBase({
        titulo: 'Aviso Prévio Indenizado',
        corpoHtml: `
        <div class="titulo">Aviso Prévio Indenizado</div>
        <p class="campo"><label>Ao empregado:</label> ${c.nome}</p>
        <p class="campo"><label>CTPS:</label> ${c.ctps ?? '—'} &nbsp; <label>Série:</label> ${c.ctps_serie ?? '—'}</p>
        <p class="texto-corpo">Nesta,</p>
        <p class="texto-corpo">
          Comunicamos á V. Sª. nossa iniciativa de rescindir seu contrato de trabalho, para o que lhe
          damos o presente AVISO-PRÉVIO que será indenizado pelo valor correspondente, nos moldes do
          Art. 487, parágrafo 1° da CONSOLIDAÇÃO DAS LEIS DE TRABALHO.
        </p>
        <p style="margin-top:24px;">${ex.local || '_______________'} &nbsp; ${hoje()}</p>
        <div class="assinaturas">
          <div class="assinatura">Ass.: e carimbo da empresa</div>
          <div class="assinatura">Ass. do empregado<br>Ciente: ${hoje()}</div>
        </div>

        <div class="box" style="margin-top:30px;">
          <p style="font-weight:700;text-align:center;margin-bottom:8px;">
            Declaração de Ciência de Pagamento
          </p>
          <p class="texto-corpo" style="margin:0;">
            Estou ciente que devo comparecer à empresa até o dia ${prazoFmt} para confirmar o recebimento
            das minhas verbas rescisórias, feito dentro dos prazos legais. O não comparecimento na data
            acima automaticamente dará a minha ciência.
          </p>
          <div class="assinaturas">
            <div class="assinatura">Ass. do empregado</div>
          </div>
        </div>
      `,
      })
    },
  },

  // ── 3. Ordem de Saída ───────────────────────────────────
  {
    id: 'ordem_saida',
    label: 'Ordem de Saída',
    campos: [
      { key: 'hora_saida', label: 'Hora de saída', type: 'hora' },
      { key: 'hora_retorno', label: 'Hora do retorno', type: 'hora' },
      { key: 'motivo', label: 'Motivo', type: 'select', options: ['Pessoal', 'Saúde', 'A serviço', 'Outros'] },
      { key: 'solicitado_por', label: 'Solicitado por', type: 'text' },
      { key: 'autorizado_por', label: 'Autorizado por', type: 'text' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      titulo: 'Ordem de Saída',
      corpoHtml: `
        <div class="form-outer">
          ${cabecalhoComLogo('Ordem de Saída', empresa.logo_url)}
          <p class="campo-linha"><label>Nome:</label> <span class="preenchido">${c.nome}</span></p>
          <p class="campo-linha"><label>Função:</label> <span class="preenchido">${c.funcao ?? '—'}</span></p>
          <p class="campo-linha"><label>Data:</label> <span class="preenchido">${hoje()}</span></p>
          <p class="campo-linha">
            <label>Hora de saída:</label> <span class="preenchido">${ex.hora_saida ?? '—'}</span>
            <label style="margin-left:16px;">Hora do retorno:</label> <span class="preenchido">${ex.hora_retorno ?? '—'}</span>
          </p>
          <p class="campo-linha">
            <label>Motivo:</label>
            &nbsp;PESSOAL ${chk(ex.motivo === 'Pessoal')}
            &nbsp;SAÚDE ${chk(ex.motivo === 'Saúde')}
            &nbsp;A SERVIÇO ${chk(ex.motivo === 'A serviço')}
            &nbsp;OUTROS ${chk(ex.motivo === 'Outros')}
          </p>
          <p class="campo-linha"><label>Solicitado por:</label> <span class="preenchido">${ex.solicitado_por ?? ''}</span></p>
          <p class="campo-linha"><label>Autorizado por:</label> <span class="preenchido">${ex.autorizado_por ?? ''}</span></p>
          <p class="campo-linha"><label>Ass. funcionário</label> <span class="preenchido"></span></p>
        </div>
      `,
    }),
  },

  // ── 4. ASO — Guia de Autorização de Atendimento ─────────
  {
    id: 'aso',
    label: 'Guia de Autorização de Atendimento (ASO)',
    campos: [
      { key: 'tipo_exame', label: 'Tipo', type: 'multiselect',
        options: ['Admissional', 'Demissional', 'Periódico', 'Mudança de função', 'Retorno ao trabalho', 'Outros'] },
      { key: 'exames', label: 'Exames', type: 'multiselect',
        options: ['Avaliação Clínica', 'Hemogr. Completo', 'Audiometria', 'Raio X Tórax',
          'Raio X Coluna Lombar', 'Espirometria', 'Eletrocardiograma', 'Acuidade Visual',
          'Eletroencefalograma', 'Glicemia'] },
      { key: 'contato', label: 'Contato', type: 'text' },
    ],
    gerarHtml: (c, empresa, ex) => {
      const tipos  = (ex.tipo_exame ?? '').split(',').filter(Boolean)
      const exames = (ex.exames ?? '').split(',').filter(Boolean)
      const marcado = (lista: string[], nome: string) => chk(lista.includes(nome))

      return documentoBase({
        titulo: 'Guia ASO',
        corpoHtml: `
        <div class="form-outer">
          ${cabecalhoComLogo('Guia de Autorização de Atendimento', empresa.logo_url)}
          <p style="font-weight:700;margin-bottom:2px;">
            ${empresa.nome}${empresa.cnpj ? ` &nbsp;CNPJ: ${formatCNPJ(empresa.cnpj)}` : ''}
          </p>
          <p style="margin-bottom:10px;">OBRA: ${empresa.endereco || empresa.nome}</p>

          <p class="campo-linha"><label>COLABORADOR:</label> <span class="preenchido">${c.nome}</span></p>
          <div class="grid-3">
            <p class="campo-linha"><label>NASC:</label> <span class="preenchido">${fmtData(c.nascimento)}</span></p>
            <p class="campo-linha"><label>CPF:</label> <span class="preenchido">${formatCPF(c.cpf) || '—'}</span></p>
            <p class="campo-linha"><label>RG:</label> <span class="preenchido">${c.rg ?? '—'}</span></p>
          </div>
          <div class="grid-2">
            <p class="campo-linha"><label>FUNÇÃO:</label> <span class="preenchido">${c.funcao ?? '—'}</span></p>
            <p class="campo-linha"><label>SETOR:</label> <span class="preenchido">${c.setor ?? '—'}</span></p>
          </div>
          <p class="campo-linha" style="margin-top:8px;"><label>DATA:</label> <span class="preenchido">${hoje()}</span></p>

          <div class="grid-2" style="margin-top:8px;">
            <div>
              <p>${marcado(tipos, 'Admissional')} ADMISSIONAL</p>
              <p>${marcado(tipos, 'Demissional')} DEMISSIONAL</p>
              <p>${marcado(tipos, 'Periódico')} PERIÓDICO</p>
            </div>
            <div>
              <p>${marcado(tipos, 'Mudança de função')} MUDANÇA DE FUNÇÃO</p>
              <p>${marcado(tipos, 'Retorno ao trabalho')} RETORNO AO TRABALHO</p>
              <p>${marcado(tipos, 'Outros')} OUTROS</p>
            </div>
          </div>

          <p style="text-align:center;font-weight:700;margin:10px 0 6px;">EXAMES</p>
          <div class="grid-3" style="font-size:11pt;">
            <div>
              <p>${marcado(exames, 'Avaliação Clínica')} AVALIAÇÃO CLÍNICA</p>
              <p>${marcado(exames, 'Hemogr. Completo')} HEMOGR. COMPLETO</p>
              <p>${marcado(exames, 'Audiometria')} AUDIOMETRIA</p>
              <p>${marcado(exames, 'Glicemia')} GLICEMIA</p>
            </div>
            <div>
              <p>${marcado(exames, 'Raio X Tórax')} RAIO X TÓRAX</p>
              <p>${marcado(exames, 'Raio X Coluna Lombar')} RAIO X COLUNA LOMBAR</p>
              <p>${marcado(exames, 'Espirometria')} ESPIROMETRIA</p>
            </div>
            <div>
              <p>${marcado(exames, 'Eletrocardiograma')} ELETROCARDIOGRAMA</p>
              <p>${marcado(exames, 'Acuidade Visual')} ACUIDADE VISUAL</p>
              <p>${marcado(exames, 'Eletroencefalograma')} ELETROENCEFALOGRAMA</p>
            </div>
          </div>

          <p class="campo-linha" style="margin-top:10px;"><label>AUTORIZADO:</label> <span class="preenchido">${ex.autorizado_nome ?? '—'}</span></p>
          <p class="campo-linha"><label>CONTATO:</label> <span class="preenchido">${ex.contato ?? '—'}</span></p>
        </div>
      `,
      })
    },
  },

  // ── 5. Movimentação de Pessoal (Mudança de Cargo) ──────
  {
    id: 'mudanca_cargo',
    label: 'Movimentação de Pessoal',
    campos: [
      { key: 'tipo_movimentacao', label: 'Tipo de movimentação', type: 'multiselect',
        options: ['Admissão (Substituição)', 'Demissão / Desligamento', 'Transferência',
          'Mudança de Função / Cargo', 'Promoção com aumento salarial', 'Promoção sem aumento salarial',
          'Aumento de Salário', 'Contratação de Estagiário', 'Aumento da bolsa estágio', 'Ajuste Salarial'] },
      { key: 'local_atual', label: 'Local atual (Campo/ADM)', type: 'text', default: 'Campo' },
      { key: 'alimentacao_atual', label: 'Alimentação atual (R$)', type: 'number' },
      { key: 'beneficio_atual', label: 'Benefício atual (R$)', type: 'number' },
      { key: 'veiculo_atual', label: 'Veículo + combustível (atual, R$)', type: 'number' },
      { key: 'funcao_nova', label: 'Função proposta', type: 'text' },
      { key: 'salario_novo', label: 'Salário proposto (R$)', type: 'number' },
      { key: 'a_partir_de', label: 'A partir de', type: 'date' },
      { key: 'local_novo', label: 'Local proposto (Campo/ADM)', type: 'text' },
      { key: 'ajuda_custo', label: 'Ajuda de custo (proposta, R$)', type: 'number' },
      { key: 'beneficio_novo', label: 'Benefício proposto (R$)', type: 'number' },
    ],
    gerarHtml: (c, empresa, ex) => {
      const tipos = (ex.tipo_movimentacao ?? '').split(',').filter(Boolean)
      const marcado = (nome: string) => chk(tipos.includes(nome))
      const salarioAtual = c.salario_base ?? 0
      const alimentacaoAtual = Number(ex.alimentacao_atual || 0)
      const veiculoAtual      = Number(ex.veiculo_atual || 0)
      const beneficioAtual    = Number(ex.beneficio_atual || 0)
      const salarioNovo       = Number(ex.salario_novo || 0)
      const ajudaCusto        = Number(ex.ajuda_custo || 0)
      const beneficioNovo     = Number(ex.beneficio_novo || 0)
      // CORRIGIDO: o total não somava o Benefício (ficava "valor de fora")
      const totalAtual = salarioAtual + alimentacaoAtual + veiculoAtual + beneficioAtual
      const totalNovo  = salarioNovo + ajudaCusto + beneficioNovo
      // CORRIGIDO: valores monetários agora sempre formatados com separador
      // de milhar e 2 casas decimais (ex: 1.000,00), não só o total.
      const rs = (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

      return documentoBase({
        titulo: 'Movimentação de Pessoal',
        margem: '10mm 12mm',
        corpoHtml: `
        <div class="form-outer">
          <div class="cabecalho-logo">
            ${empresa.logo_url ? `<img src="${empresa.logo_url}" />` : ''}
            <div class="titulo">Movimentação de Pessoal</div>
            <div style="text-align:right;font-size:11px;">
              <p><strong>Obra:</strong> ${empresa.nome}</p>
              <p><strong>Data:</strong> ${hoje()}</p>
            </div>
          </div>

          <div class="box grid-2" style="column-gap:24px;">
            ${[
              'Admissão (Substituição)', 'Transferência', 'Promoção com aumento salarial',
              'Aumento de Salário', 'Aumento da bolsa estágio',
            ].map(op => `<p>${marcado(op)} ${op}</p>`).join('')}
            ${[
              'Demissão / Desligamento', 'Mudança de Função / Cargo', 'Promoção sem aumento salarial',
              'Contratação de Estagiário', 'Ajuste Salarial',
            ].map(op => `<p>${marcado(op)} ${op}</p>`).join('')}
          </div>

          <p style="font-weight:700;background:#f2f2f2;padding:4px 8px;margin-top:10px;">
            INFORMAÇÕES INICIAIS (DADOS ATUAIS)
          </p>
          <table class="dados">
            <colgroup>
              <col style="width:16%"><col style="width:34%">
              <col style="width:16%"><col style="width:34%">
            </colgroup>
            <tr>
              <td class="label">Nome Completo</td><td>${c.nome}</td>
              <td class="label">Salário</td><td>${rs(salarioAtual)}</td>
            </tr>
            <tr>
              <td class="label">Função Atual</td><td>${c.funcao ?? '—'}</td>
              <td class="label">Alimentação</td><td>${rs(alimentacaoAtual)}</td>
            </tr>
            <tr>
              <td class="label">Data de Admissão</td><td>${fmtData(c.data_admissao)}</td>
              <td class="label">Benefício</td><td>${rs(beneficioAtual)}</td>
            </tr>
            <tr>
              <td class="label">Local (Campo/ADM)</td><td>${ex.local_atual ?? '—'}</td>
              <td class="label">Veículo + Combustível</td><td>${rs(veiculoAtual)}</td>
            </tr>
            <tr>
              <td class="label" colspan="3">TOTAL</td><td>R$ ${totalAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
          </table>

          <p style="font-weight:700;background:#f2f2f2;padding:4px 8px;margin-top:10px;">
            PROPOSTA (Preencher em caso de alteração contratual)
          </p>
          <table class="dados">
            <colgroup>
              <col style="width:16%"><col style="width:34%">
              <col style="width:16%"><col style="width:34%">
            </colgroup>
            <tr>
              <td class="label">Função Proposta</td><td>${ex.funcao_nova ?? '—'}</td>
              <td class="label">Salário Proposto</td><td>${rs(salarioNovo)}</td>
            </tr>
            <tr>
              <td class="label">A partir de</td><td>${fmtData(ex.a_partir_de)}</td>
              <td class="label">Ajuda de Custo</td><td>${rs(ajudaCusto)}</td>
            </tr>
            <tr>
              <td class="label">Local (Campo/ADM)</td><td>${ex.local_novo ?? '—'}</td>
              <td class="label">Benefício</td><td>${rs(beneficioNovo)}</td>
            </tr>
            <tr>
              <td class="label" colspan="3">TOTAL</td><td>R$ ${totalNovo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
          </table>

          <table class="dados" style="margin-top:14px;">
            <tr>
              <td class="label">Solicitante - RH</td>
              <td class="label">Solicitante - ENC. CAMPO</td>
              <td class="label">Autorização - Engenheiro</td>
              <td class="label">Aprovação - Diretoria</td>
            </tr>
            <tr><td>Nome:</td><td>Nome:</td><td>Nome:</td><td>Nome:</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
          </table>
        </div>
      `,
      })
    },
  },

  // ── 6. Comunicado de Dispensa — término contrato experiência ──
  {
    id: 'dispensa_experiencia',
    label: 'Comunicado de Dispensa (término de experiência)',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'data_termino', label: 'Data do término previsto', type: 'date' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      duasVias: true,
      titulo: 'Comunicado de Dispensa — Término de Experiência',
      fontSize: '11pt',
      corpoHtml: (via) => `
        <div class="titulo" style="text-align:left;font-size:15pt;">
          Comunicado de Dispensa no Término de Contrato de Experiência
        </div>
        ${cabecalhoColaborador(c, via)}
        <p style="margin:10px 0;">${ex.local || '_______________'} &nbsp; ${hoje()}</p>
        <p class="texto-corpo">
          Pelo presente, o notificamos que, a partir da data de entrega deste, não mais serão utilizados
          os seus serviços por nossa firma, e por isso avisá-lo, nos termos e para os efeitos do disposto
          no Art. 445, parágrafo único, da CLT. Estamos encerrando seu contrato de experiência no término
          previsto, dia ${fmtData(ex.data_termino)}, o prazo acordado.
        </p>
        <div class="assinaturas" style="margin-top:60px;">
          <div class="assinatura">Departamento Pessoal</div>
          <div class="assinatura">${c.nome}</div>
        </div>
      `,
    }),
  },

  // ── 7. Autorização de Retirada de EPI's ─────────────────
  {
    id: 'retirada_epi',
    label: "Autorização de Retirada de EPI's",
    campos: [
      { key: 'itens', label: 'Itens (um por linha)', type: 'textarea',
        default: 'Conjunto de uniforme\nPar de botas de segurança\nÓculos de segurança\nCapacete' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      titulo: "Autorização de Retirada de EPI's",
      corpoHtml: `
        <div class="titulo">Autorização de Retirada de EPI's</div>
        <p class="campo"><label>Nome:</label> ${c.nome}</p>
        <p class="campo"><label>Função:</label> ${c.funcao ?? '—'}</p>
        <p class="campo"><label>Data:</label> ${hoje()}</p>
        <table class="dados">
          <tr><td class="label">Descrição do EPI</td></tr>
          ${(ex.itens || '').split('\n').filter(Boolean).map(i => `<tr><td>${i}</td></tr>`).join('')}
        </table>
        <div class="assinaturas">
          <div class="assinatura">Departamento Pessoal</div>
        </div>
      `,
    }),
  },

  // ── 8. Rescisão Antecipada de Contrato de Experiência ───
  {
    id: 'rescisao_antecipada',
    label: 'Rescisão Antecipada de Contrato de Experiência',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'data_encerramento', label: 'Data de encerramento', type: 'date' },
      { key: 'data_ultimo_dia', label: 'Último dia de serviço', type: 'date' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      duasVias: true,
      titulo: 'Rescisão Antecipada de Contrato de Experiência',
      fontSize: '11pt',
      corpoHtml: (via) => `
        <div class="titulo" style="text-align:left;font-size:15pt;">
          Rescisão Antecipada de Contrato de Experiência pelo Empregador
        </div>
        ${cabecalhoColaborador(c, via)}
        <p style="margin:10px 0;">${ex.local || '_______________'} &nbsp; ${hoje()}</p>
        <p class="texto-corpo">
          Vimos pelo presente comunicar-lhe que por não mais convir a esta empresa mantê-lo no nosso
          quadro de funcionários, estamos antecipando o encerramento do seu contrato de experiência com
          data de encerramento para ${fmtData(ex.data_encerramento)}. Sendo assim, a partir de
          ${fmtData(ex.data_ultimo_dia)}, não serão mais necessários seus serviços.
        </p>
        <div class="assinaturas" style="margin-top:60px;">
          <div class="assinatura">Departamento Pessoal</div>
          <div class="assinatura">${c.nome}</div>
        </div>
      `,
    }),
  },

  // ── 9. Advertência Disciplinar ──────────────────────────
  {
    id: 'advertencia',
    label: 'Advertência Disciplinar',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'motivo', label: 'Descrição da conduta', type: 'textarea' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      titulo: 'Advertência Disciplinar',
      corpoHtml: `
        <div class="titulo">Advertência Disciplinar</div>
        <p class="campo"><label>Ao empregado:</label> ${c.nome}</p>
        <p class="campo"><label>CTPS:</label> ${c.ctps ?? '—'} &nbsp; <label>Série:</label> ${c.ctps_serie ?? '—'}</p>
        <p class="texto-corpo">
          Vimos pela presente advertí-lo quanto a seguinte conduta: ${ex.motivo || '_______________'}.
          Esclarecemos que a reincidência em procedimentos análogos poderá, por sua repetição, configurar
          justa causa para a rescisão do contrato de trabalho. Pedimos que a partir desta, observe as
          normas reguladoras da relação de emprego, para que não tenhamos, no futuro, de tomar as
          enérgicas medidas que nos são facultadas pela legislação vigente. Solicitamos pois, o seu
          ciente na cópia deste.
        </p>
        ${rodapeDisciplinar(ex.local)}
      `,
    }),
  },

  // ── 10. Suspensão Disciplinar ────────────────────────────
  {
    id: 'suspensao',
    label: 'Suspensão Disciplinar',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'dias', label: 'Dias de suspensão', type: 'number', default: '2' },
      { key: 'motivo', label: 'Descrição da ocorrência', type: 'textarea' },
    ],
    gerarHtml: (c, empresa, ex) => {
      // NOVO: data de retorno calculada automaticamente — conta a partir
      // do dia seguinte à emissão, pelo número de dias de suspensão. Se
      // cair em sábado, domingo ou feriado, avança para o próximo dia útil.
      const dias = Number(ex.dias || 0)
      let retorno = new Date()
      retorno.setDate(retorno.getDate() + 1 + dias)
      retorno = proximoDiaUtil(retorno)
      const retornoFmt = retorno.toLocaleDateString('pt-BR')

      return documentoBase({
      titulo: 'Suspensão Disciplinar',
      corpoHtml: `
        <div class="titulo">Comunicado de Suspensão Disciplinar</div>
        <p class="campo"><label>Ao empregado:</label> ${c.nome}</p>
        <p class="campo"><label>CTPS:</label> ${c.ctps ?? '—'} &nbsp; <label>Série:</label> ${c.ctps_serie ?? '—'}</p>
        <p class="texto-corpo">
          Vimos pela presente aplicar-lhe a pena de suspensão disciplinar, por ${ex.dias || '__'} (dias)
          a partir desta data, em razão da seguinte ocorrência: ${ex.motivo || '_______________'}.
          Esclarecemos que a reincidência em procedimentos análogos poderá, por sua repetição, configurar
          justa causa para a rescisão do contrato de trabalho. Reassumindo suas funções em
          ${retornoFmt}, observe as normas reguladoras da relação de emprego, para que não
          tenhamos, no futuro, de tomar as enérgicas medidas que nos são facultadas pela legislação
          vigente. Solicitamos pois, o seu ciente na cópia deste.
        </p>
        ${rodapeDisciplinar(ex.local)}
      `,
      })
    },
  },

  // ── 12. Declaração de Trabalho ───────────────────────────
  {
    id: 'declaracao_trabalho',
    label: 'Declaração de Trabalho',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'jornada', label: 'Jornada de trabalho', type: 'text', default: 'das 7:00h às 17:00h, de segunda a sexta-feira' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      titulo: 'Declaração de Trabalho',
      corpoHtml: `
        <div class="titulo">Declaração de Trabalho</div>
        <p class="texto-corpo">
          Declaramos para os devidos fins que o(a) Sr.(ª) ${c.nome}, inscrito(a) no CPF sob o n°
          ${formatCPF(c.cpf) || '_______________'} e portador(a) do RG de n° ${c.rg ?? '_______________'}, é
          funcionário(a) da empresa ${empresa.nome}${empresa.cnpj ? `, CNPJ ${formatCNPJ(empresa.cnpj)}` : ''},
          exercendo atividades de ${c.funcao ?? '_______________'}, cumprindo jornada de trabalho
          ${ex.jornada || '_______________'}, podendo ser convocado eventualmente para trabalhar aos
          sábados, sendo isto facultado ao mesmo.
        </p>
        <p style="margin-top:24px;">${ex.local || '_______________'} , ${hoje()}</p>
        <div class="assinaturas" style="margin-top:70px;">
          <div class="assinatura">${empresa.nome}${empresa.cnpj ? ` — ${formatCNPJ(empresa.cnpj)}` : ''}</div>
        </div>
      `,
    }),
  },

  // ── 13. Recibo de Pagamento ───────────────────────────────
  {
    id: 'recibo_pagamento',
    label: 'Recibo de Pagamento',
    campos: [
      { key: 'local', label: 'Cidade - UF', type: 'text' },
      { key: 'valor', label: 'Valor (R$)', type: 'number' },
      { key: 'referente', label: 'Referente a', type: 'text' },
    ],
    gerarHtml: (c, empresa, ex) => documentoBase({
      titulo: 'Recibo de Pagamento',
      corpoHtml: `
        <div class="form-outer">
          <div class="cabecalho-logo">
            ${empresa.logo_url ? `<img src="${empresa.logo_url}" />` : ''}
            <div class="titulo" style="text-align:left;">Recibo de Pagamento</div>
            <div style="font-size:12pt;">N° <span class="preenchido" style="display:inline-block;min-width:40px;">${ex.numero ?? ''}</span></div>
          </div>
          <p class="campo-linha" style="font-weight:600;">${empresa.nome}${empresa.cnpj ? ` — CNPJ: ${formatCNPJ(empresa.cnpj)}` : ''}</p>
          <p class="campo-linha">
            <label>RECEBI (EMOS) DE:</label> <span class="preenchido">${c.nome}</span>
            <label>CPF</label> <span class="preenchido" style="flex:0.5;">${formatCPF(c.cpf) || '—'}</span>
          </p>
          <p class="campo-linha">
            <label>A IMPORTÂNCIA DE:</label>
            <span class="preenchido">R$ ${Number(ex.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              &nbsp; ${numeroPorExtenso(Number(ex.valor || 0))}</span>
          </p>
          <p class="campo-linha">
            <label>REFERENTE A:</label> <span class="preenchido">${ex.referente || '—'}</span>
          </p>
          <p class="campo-linha" style="margin-top:14px;">
            <span>${ex.local || '_______________'} &nbsp; ${hoje()}</span>
            <label style="margin-left:24px;">ASS:</label> <span class="preenchido"></span>
          </p>
        </div>
      `,
    }),
  },

  // ── 14. Comunicado de Dispensa ao Setor Pessoal (Requerimento de Dispensa) ──
  {
    id: 'requerimento_dispensa',
    label: 'Comunicado de Dispensa ao Setor Pessoal (Requerimento de Dispensa)',
    campos: [
      { key: 'data_demissao', label: 'Data da demissão', type: 'date' },
      { key: 'tipo_demissao', label: 'Tipo de demissão', type: 'select', options: [
        'Despedida sem justa causa', 'Despedida por justa causa',
        'Rescisão antecipada pelo empregador do contrato de experiência',
        'Rescisão antecipada pelo empregado do contrato de experiência',
        'Pedido de dispensa', 'Término de contrato de experiência',
        'Rescisão por falecimento do empregado', 'Acordo entre as partes',
      ] },
      { key: 'motivo', label: 'Motivo da dispensa', type: 'textarea' },
      { key: 'dias_trabalhados', label: 'Dias trabalhados no mês', type: 'number' },
      { key: 'faltas', label: 'Faltas', type: 'number', default: '0' },
      { key: 'ferias_vencidas', label: 'Férias vencidas?', type: 'select', options: ['Não', 'Sim'] },
      { key: 'valor_producao', label: 'Valor Produção (R$)', type: 'number', default: '0' },
      { key: 'horas_extras', label: 'Horas Extras', type: 'horas_extras',
        options: ['50%', '70%', '80%', '100%', '110%'] },
      { key: 'aviso_previo', label: 'Aviso prévio', type: 'select', options: ['Indenizado', 'Trabalhado', 'Dispensado'] },
      { key: 'observacoes', label: 'Observações para o setor pessoal', type: 'textarea' },
    ],
    gerarHtml: (c, empresa, ex) => {
      // Formato armazenado: "50%|04:35;70%|02:00" (percentual|horas, separados por ;)
      const horasExtras = (ex.horas_extras ?? '')
        .split(';')
        .filter(Boolean)
        .map(par => {
          const [percentual, horas] = par.split('|')
          return { percentual, horas }
        })

      // NOVO: vencimento da experiência calculado a partir da data de
      // admissão + dias de experiência do próprio cadastro do colaborador
      // (o dia da admissão conta como o 1° dia do período), em vez de
      // depender de um campo separado nem sempre preenchido.
      let vencimentoExperiencia = c.data_vencimento_experiencia
      if (c.data_admissao && c.dias_experiencia) {
        const admissao = new Date(`${c.data_admissao}T00:00:00`)
        admissao.setDate(admissao.getDate() + c.dias_experiencia - 1)
        vencimentoExperiencia = admissao.toISOString().slice(0, 10)
      }

      return documentoBase({
      titulo: 'Comunicado de Dispensa ao Setor Pessoal',
      corpoHtml: `
        ${cabecalhoComLogo('Comunicado de Dispensa de Funcionário ao Setor Pessoal', empresa.logo_url)}
        <table class="dados cols-ajustadas">
          <tr><td class="label">Obra</td><td colspan="3">${empresa.nome}</td></tr>
          <tr><td class="label">Nome</td><td colspan="3">${c.nome}</td></tr>
          <tr><td class="label">Função</td><td colspan="3">${c.funcao ?? '—'}</td></tr>
          <tr>
            <td class="label">Data de admissão</td><td>${fmtData(c.data_admissao)}</td>
            <td class="label">Data da demissão</td><td>${fmtData(ex.data_demissao)}</td>
          </tr>
          <tr>
            <td class="label">Vencimento da experiência</td><td>${fmtData(vencimentoExperiencia)}</td>
            <td class="label">Tipo de demissão</td><td>${ex.tipo_demissao ?? '—'}</td>
          </tr>
        </table>

        <p class="campo"><label>Motivo da dispensa:</label></p>
        <p class="texto-corpo">${ex.motivo || '—'}</p>

        <div class="box">
          <p style="font-weight:600;margin-bottom:8px;">Pagamentos e descontos</p>
          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">Dias trabalhados</td><td>${ex.dias_trabalhados ?? '—'}</td>
              <td class="label">Faltas</td><td>${ex.faltas ?? '0'}</td>
            </tr>
            <tr>
              <td class="label">Férias vencidas</td><td>${ex.ferias_vencidas ?? 'Não'}</td>
              <td class="label">Valor Produção</td><td>R$ ${Number(ex.valor_producao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td class="label">Aviso prévio</td><td colspan="3">${ex.aviso_previo ?? '—'}</td>
            </tr>
            ${horasExtras.map(he => `
              <tr>
                <td class="label">Horas Extras ${he.percentual}</td><td colspan="3">${he.horas || '—'}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        <p class="campo"><label>Observações para o setor pessoal:</label></p>
        <p class="texto-corpo">${ex.observacoes || '—'}</p>

        <p style="font-size:10px;color:#666;margin-top:16px;">
          Este comunicado é uma solicitação de desligamento ao setor pessoal para fins de cálculo da
          rescisão contratual, nos termos da CLT. Os valores definitivos de verbas rescisórias devem
          ser conferidos e calculados pelo setor responsável antes do pagamento.
        </p>

        <div class="assinaturas">
          <div class="assinatura">Solicitante</div>
          <div class="assinatura">Setor Pessoal</div>
        </div>
      `,
      })
    },
  },

  // ── 15. Ficha de Registro do Empregado ──────────────────
  {
    id: 'ficha_registro',
    label: 'Ficha de Registro do Empregado',
    campos: [
      ...CAMPOS_LOCAL_DATA,
      { key: 'horario_trabalho_inicio',   label: 'Horário de trabalho — início',   type: 'hora', default: '07:00' },
      { key: 'horario_trabalho_fim',      label: 'Horário de trabalho — fim',      type: 'hora', default: '17:00' },
      { key: 'horario_intervalo_inicio',  label: 'Horário de intervalo — início',  type: 'hora', default: '12:00' },
      { key: 'horario_intervalo_fim',     label: 'Horário de intervalo — fim',     type: 'hora', default: '13:00' },
    ],
    gerarHtml: (c, empresa, ex) => {
      const sim_nao = (v: unknown) => v ? 'Sim' : 'Não'
      const rs = (v?: number | null) => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

      return documentoBase({
        titulo: 'Ficha de Registro do Empregado',
        margem: '0mm',
        fontSize: '9pt',
        lineHeight: 1.05,
        corpoHtml: `
        <style>
          /* ALTERADO: table.dados td vem com font-size:12pt fixo no
             documento base (documentos/base.ts) — sobrescreve aqui
             pra respeitar o tamanho 9 pedido. Espaçamento apertado
             de novo (estava faltando pouco pra fechar em 1 página). */
          .form-outer { padding: 4px 6px; }
          table.dados td { font-size: 9pt; padding: 1px 6px; }
          p.secao { font-weight:700; background:#f2f2f2; padding:1px 6px; margin:4px 0 1px; }
          table.dados { margin: 0 0 4px; }
          .box { padding: 2px 6px; margin: 1px 0 4px; }
          .assinaturas { margin-top: 6px; }
          .cabecalho-logo { margin-bottom: 2px; padding-bottom: 2px; }
          .cabecalho-logo img { max-height: 34px; }
          .titulo { font-size: 12pt; }
        </style>
        <div class="form-outer">
          <div class="cabecalho-logo">
            ${empresa.logo_url ? `<img src="${empresa.logo_url}" />` : ''}
            <div class="titulo">Ficha de Registro do Empregado</div>
          </div>

          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">Empregador</td><td colspan="3">${empresa.razao_social || empresa.nome}</td>
            </tr>
            <tr>
              <td class="label">CNPJ</td><td>${empresa.cnpj ? formatCNPJ(empresa.cnpj) : '—'}</td>
              <td class="label">Matrícula eSocial</td><td>${c.matricula_esocial || '—'}</td>
            </tr>
            <tr>
              <td class="label">Endereço</td><td colspan="3">${empresa.endereco || '—'}</td>
            </tr>
          </table>

          <p class="secao">DADOS PESSOAIS</p>
          <table class="dados cols-ajustadas">
            <tr><td class="label">Nome</td><td colspan="3">${c.nome}</td></tr>
            <tr>
              <td class="label">Data de nascimento</td><td>${fmtData(c.nascimento)}</td>
              <td class="label">Naturalidade</td><td>${c.naturalidade || '—'}</td>
            </tr>
            <tr>
              <td class="label">Nacionalidade</td><td>${c.nacionalidade || '—'}</td>
              <td class="label">Estado civil</td><td>${c.estado_civil || '—'}</td>
            </tr>
            <tr>
              <td class="label">Sexo</td><td>${c.sexo || '—'}</td>
              <td class="label">Cor/Raça</td><td>${c.cor_raca || '—'}</td>
            </tr>
            <tr>
              <td class="label">Grau de instrução</td><td>${c.escolaridade || '—'}</td>
              <td class="label">Deficiência</td><td>${sim_nao(c.pcd)}</td>
            </tr>
            <tr>
              <td class="label">Nome do pai</td><td colspan="3">${c.nome_pai || '—'}</td>
            </tr>
            <tr>
              <td class="label">Nome da mãe</td><td colspan="3">${c.nome_mae || '—'}</td>
            </tr>
            <tr>
              <td class="label">Telefone</td><td colspan="3">${c.telefone || '—'}</td>
            </tr>
          </table>

          <p class="secao">DOCUMENTOS</p>
          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">CPF</td><td>${c.cpf ? formatCPF(c.cpf) : '—'}</td>
              <td class="label">Cédula de Identidade (RG)</td><td>${c.rg || '—'}</td>
            </tr>
            <tr>
              <td class="label">Órgão/UF emissor</td><td>${c.rg_orgao_emissor || '—'}</td>
              <td class="label">Data de emissão</td><td>${fmtData(c.rg_data_emissao)}</td>
            </tr>
            <tr>
              <td class="label">CTPS</td><td>${c.ctps || '—'}</td>
              <td class="label">Série / UF</td><td>${c.ctps_serie || '—'} ${c.ctps_uf ? '/ ' + c.ctps_uf : ''}</td>
            </tr>
            <tr>
              <td class="label">Data de expedição da CTPS</td><td>${fmtData(c.ctps_data_expedicao)}</td>
              <td class="label">PIS/NIS</td><td>${c.pis || '—'}</td>
            </tr>
            <tr>
              <td class="label">Título Eleitoral</td><td>${c.titulo_numero || '—'}</td>
              <td class="label">Zona / Seção</td><td>${c.titulo_zona || '—'} / ${c.titulo_secao || '—'}</td>
            </tr>
            <tr>
              <td class="label">Doc. militar (Reservista)</td><td>${c.reservista || '—'}</td>
              <td class="label">Cart. Nac. Habilitação</td><td>${c.cnh_numero ? `${c.cnh_numero} (Cat. ${c.cnh_categoria || '—'})` : '—'}</td>
            </tr>
            <tr>
              <td class="label">Inscr. Órgão de Classe</td><td colspan="3">&nbsp;</td>
            </tr>
          </table>

          <p class="secao">RESIDÊNCIA</p>
          <table class="dados cols-ajustadas">
            <tr><td class="label">Endereço</td><td>${enderecoCompleto(c)}</td></tr>
          </table>

          <p class="secao">DADOS CONTRATUAIS</p>
          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">Categoria</td><td>${categoriaPorContrato(c.tipo_contrato)}</td>
              <td class="label">C.B.O.</td><td>${c.cbo || '—'}</td>
            </tr>
            <tr>
              <td class="label">Cargo</td><td>${c.funcao || '—'}</td>
              <td class="label">Função</td><td>${c.funcao || '—'}</td>
            </tr>
            <tr>
              <td class="label">Data de Admissão</td><td>${fmtData(c.data_admissao)}</td>
              <td class="label">Salário</td><td>${rs(c.salario_base)} / Mês</td>
            </tr>
            <tr>
              <td class="label">Horário de Trabalho</td><td>das ${ex.horario_trabalho_inicio || '—'} às ${ex.horario_trabalho_fim || '—'}</td>
              <td class="label">Horário de Intervalo</td><td>das ${ex.horario_intervalo_inicio || '—'} às ${ex.horario_intervalo_fim || '—'}</td>
            </tr>
          </table>

          <p class="secao">DADOS BANCÁRIOS / PIS / FGTS</p>
          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">Banco</td><td>${c.banco || '—'}</td>
              <td class="label">Agência</td><td>${c.agencia || '—'}</td>
            </tr>
            <tr>
              <td class="label">Operação</td><td>${c.operacao || '—'}</td>
              <td class="label">Conta</td><td>${c.conta ? `${c.conta}${c.conta_digito ? '-' + c.conta_digito : ''}` : '—'}</td>
            </tr>
            <tr>
              <td class="label">Data de Opção do FGTS</td><td>&nbsp;</td>
              <td class="label">Conta vinculada no banco</td><td>&nbsp;</td>
            </tr>
          </table>

          <p class="secao">BENEFICIÁRIOS / DEPENDENTES</p>
          <table class="dados cols-ajustadas">
            <tr><td class="label">Nome</td><td class="label">Parentesco</td><td class="label">Nascimento</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
          </table>

          <p class="secao">ALTERAÇÕES DE SALÁRIO, CARGO E/OU FUNÇÃO</p>
          <table class="dados cols-ajustadas">
            <tr><td class="label">Data</td><td class="label">Alteração</td><td class="label">Novo valor</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
          </table>

          <p class="secao">FÉRIAS</p>
          <table class="dados cols-ajustadas">
            <tr><td class="label">Período Aquisitivo</td><td class="label">Período de Gozo</td><td class="label">Abono Pecuniário</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
            <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
          </table>

          <p class="secao">OBSERVAÇÕES (advertências, suspensões, transferências etc.)</p>
          <div class="box" style="min-height:10px;">&nbsp;</div>

          <p class="secao">ACIDENTES DE TRABALHO, DOENÇAS OU DOENÇAS PROFISSIONAIS</p>
          <div class="box" style="min-height:6px;">&nbsp;</div>

          <p class="secao">RESCISÃO DE CONTRATO DE TRABALHO</p>
          <table class="dados cols-ajustadas">
            <tr>
              <td class="label">Tipo do desligamento</td><td>${c.tipo_demissao || '&nbsp;'}</td>
              <td class="label">Data da saída</td><td>${c.data_demissao ? fmtData(c.data_demissao) : '&nbsp;'}</td>
            </tr>
            <tr>
              <td class="label">Data aviso indenizado</td><td>&nbsp;</td>
              <td class="label">Data projeção</td><td>&nbsp;</td>
            </tr>
          </table>

          <p class="secao">CONTRIBUIÇÃO SINDICAL</p>
          <div class="box" style="min-height:6px;">&nbsp;</div>

          <p style="margin-top:3px;">${ex.local || empresa.nome} &nbsp; ${hoje()}</p>
          <div class="assinaturas">
            <div class="assinatura">Ass.: e carimbo do empregador</div>
            <div class="assinatura">Ass. do empregado</div>
          </div>
        </div>
      `,
      })
    },
  },

]

export function getTipoDocumento(id: string): TipoDocumento | undefined {
  return TIPOS_DOCUMENTO.find(t => t.id === id)
}
