// Empresa mínima necessária para montar o cabeçalho dos documentos
export interface EmpresaDoc {
  nome:          string
  razao_social?: string | null  // NOVO: nome jurídico (CNPJ) — diferente do nome da obra
  cnpj?:         string | null
  endereco?:     string | null
  logo_url?:     string | null
}

export interface ColaboradorDoc {
  id:                number
  nome:              string
  cpf?:              string | null
  rg?:               string | null
  rg_orgao_emissor?: string | null
  rg_data_emissao?:  string | null
  nascimento?:       string | null
  naturalidade?:     string | null
  estado_civil?:     string | null
  nacionalidade?:    string | null
  sexo?:             string | null
  nome_mae?:         string | null
  nome_pai?:         string | null
  funcao?:           string | null
  cbo?:              string | null
  setor?:            string | null
  tipo_contrato?:    string | null
  ctps?:             string | null
  ctps_serie?:       string | null
  ctps_uf?:          string | null
  ctps_data_expedicao?: string | null
  data_admissao?:    string | null
  data_demissao?:    string | null
  dias_experiencia?: number | null
  data_vencimento_experiencia?: string | null
  salario_base?:     number | null
  [key: string]:     unknown
}

export function fmtData(iso?: string | null): string {
  if (!iso) return '____/____/________'
  // CORRIGIDO: `new Date(iso).toLocaleDateString()` interpreta a string
  // ISO como UTC e depois converte para o fuso local — em fusos negativos
  // (como o do Brasil) isso pode exibir o dia anterior ao real. Extrai
  // os componentes diretamente da string para evitar esse deslocamento.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (match) {
    const [, ano, mes, dia] = match
    return `${dia}/${mes}/${ano}`
  }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

export function hoje(): string {
  return new Date().toLocaleDateString('pt-BR')
}

// Envolve o conteúdo de um documento com o CSS de impressão A4 e um
// rodapé opcional de assinatura. `duasVias` repete o conteúdo duas
// vezes na mesma página, como no modelo original de AP.
export function documentoBase(opts: {
  titulo:      string
  corpoHtml:   string | ((numeroVia: number) => string)
  duasVias?:   boolean
  paisagem?:   boolean
  fontSize?:   string   // ex: '11pt' — padrão 12pt
  lineHeight?: number    // padrão 1.5
  viaGap?:     number    // px de espaço entre 1ª e 2ª via — padrão 34
  margem?:     string    // ex: '10mm 12mm' — padrão 14mm 16mm
}): string {
  const { titulo, corpoHtml, duasVias, paisagem, fontSize = '12pt', lineHeight = 1.5, viaGap = 34, margem = '14mm 16mm' } = opts

  const via = (numero: number) => `
    <div class="via">
      ${typeof corpoHtml === 'function' ? corpoHtml(numero) : corpoHtml}
    </div>
  `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>${titulo}</title>
<style>
  @page { size: A4 ${paisagem ? 'landscape' : 'portrait'}; margin: ${margem}; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, 'Segoe UI', Helvetica, sans-serif;
    color: #1a1a1a;
    font-size: ${fontSize};
    line-height: ${lineHeight};
  }
  .titulo {
    text-align: center;
    font-weight: 700;
    font-size: 18pt;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .subtitulo {
    text-align: center;
    font-weight: 600;
    font-size: 13pt;
    text-transform: uppercase;
    margin-bottom: 14px;
    color: #444;
  }
  .campo { margin-bottom: 8px; }
  .campo label { font-weight: 600; }
  .linha { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 8px; }
  .box {
    border: 1px solid #999;
    border-radius: 4px;
    padding: 10px 12px;
    margin: 10px 0;
  }
  .texto-corpo { text-align: justify; margin: 14px 0; }
  .assinaturas {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    gap: 24px;
  }
  .assinatura {
    flex: 1;
    text-align: center;
    border-top: 1px solid #333;
    padding-top: 4px;
    font-size: 1em;
  }
  .via { padding-bottom: 10px; }
  .via + .via {
    border-top: 1px dashed #999;
    margin-top: ${viaGap}px;
    padding-top: ${viaGap}px;
  }
  table.dados { width: 100%; border-collapse: collapse; margin: 10px 0; }
  table.dados td { border: 1px solid #999; padding: 6px 8px; font-size: 12pt; }
  table.dados td.label { font-weight: 600; background: #f2f2f2; width: 35%; }

  .cabecalho-logo {
    display: flex;
    align-items: center;
    gap: 14px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .cabecalho-logo img { max-height: 62px; max-width: 210px; object-fit: contain; }
  .cabecalho-logo .titulo { flex: 1; margin-bottom: 0; }

  .form-outer {
    border: 1.5px solid #1a1a1a;
    padding: 10px 14px;
  }
  .campo-linha {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
    font-size: 1em;
  }
  .campo-linha label { font-weight: 600; white-space: nowrap; }
  .campo-linha .preenchido {
    border-bottom: 1px solid #999;
    flex: 1;
    padding-bottom: 1px;
    min-height: 14px;
  }
  .chk { display: inline-block; border: 1px solid #333; width: 12px; height: 12px;
         text-align: center; line-height: 11px; font-size: 10px; margin-right: 4px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .grid-2 p, .grid-3 p { margin: 0; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px 20px; }

  /* Assinatura com linha ACIMA do nome/rótulo, em vez de embaixo */
  .assinatura-linha {
    margin-top: 10px;
    text-align: left;
  }
  .assinatura-linha .linha-ass {
    border-top: 1px solid #333;
    width: 260px;
    margin-bottom: 4px;
  }

  /* Cabeçalho com colunas de rótulo do tamanho do texto (não fixas) */
  table.epi-cabecalho td.label { width: 1%; white-space: nowrap; }
  table.epi-cabecalho td { padding: 3px 8px; font-size: 10px; }

  /* Linhas de item mais baixas, para caber mais por página */
  table.epi-itens { table-layout: fixed; }
  table.epi-itens td { padding: 1px 4px; height: 13px; font-size: 9.5px; overflow: hidden; }
  table.epi-itens td.label { padding: 3px 4px; font-size: 8.5px; white-space: normal; line-height: 1.15; }
  table.epi-itens td.chk-col { text-align: center; }

  /* Tabelas com colunas de rótulo do tamanho do texto (Mudança de Função, Comunicado de Dispensa) */
  table.cols-ajustadas td.label { width: 1%; white-space: nowrap; }
</style>
</head>
<body>
  ${via(1)}
  ${duasVias ? via(2) : ''}
</body>
</html>`
}

// Bloco de logo + título, usado nos documentos que levam o timbre da
// empresa (Ordem de Saída, ASO, Ficha de EPI, Movimentação de Pessoal,
// Recibo, Acordo de Compensação).
export function cabecalhoComLogo(titulo: string, logoUrl?: string | null): string {
  if (!logoUrl) return `<div class="titulo" style="font-size:15px;">${titulo}</div>`
  return `
    <div class="cabecalho-logo">
      <img src="${logoUrl}" />
      <div class="titulo">${titulo}</div>
    </div>
  `
}

// "Checkbox" marcado ou não, no estilo dos formulários da empresa: ( X )
export function chk(marcado: boolean): string {
  return `( ${marcado ? 'X' : '\u00A0'} )`
}
