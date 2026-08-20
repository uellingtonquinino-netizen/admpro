import { documentoBase, cabecalhoComLogo, fmtData, hoje, nomeExibicaoEmpresa } from './base'

interface EmpresaInfo {
  nome: string
  razao_social?: string | null
  logo_url?: string | null
}

function tabela(colunas: string[], linhas: string[][]): string {
  const cabecalho = colunas.map((c, i) =>
    `<td class="label${i > 0 ? ' col-encolhe' : ''}">${c}</td>`
  ).join('')
  const corpo = linhas.length === 0
    ? `<tr><td colspan="${colunas.length}" style="text-align:center;color:#777;">Nenhum registro encontrado.</td></tr>`
    : linhas.map(l => `<tr>${l.map((v, i) =>
        `<td${i > 0 ? ' class="col-encolhe"' : ''}>${v || '—'}</td>`
      ).join('')}</tr>`).join('')

  return `
    <table class="dados dados-autofit">
      <tr>${cabecalho}</tr>
      ${corpo}
    </table>
  `
}

function envolver(titulo: string, empresa: EmpresaInfo, subtitulo: string, corpo: string): string {
  return documentoBase({
    titulo,
    fontSize: '12pt',
    paisagem: true,
    corpoHtml: `
      <style>
        body, table.dados-autofit td { font-family: 'Calibri Light', Calibri, Arial, sans-serif; }
        .titulo { font-family: Arial, 'Segoe UI', Helvetica, sans-serif; }
        table.dados-autofit { width: 100%; table-layout: auto; }
        table.dados-autofit td { white-space: nowrap; padding: 4px 10px; }
        table.dados-autofit td.col-encolhe { width: 1%; }
      </style>
      ${cabecalhoComLogo(titulo, empresa.logo_url)}
      <p style="text-align:center;color:#555;margin-top:-6px;margin-bottom:14px;">
        ${nomeExibicaoEmpresa(empresa)} &nbsp;•&nbsp; ${subtitulo} &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}

interface ProdutoLinha {
  codigo: string; nome: string; unidade?: string | null
  estoque_atual: number; valor_unitario?: number
}

// ── Relatório de Estoque (todos os produtos) ──────────────
export function gerarRelatorioEstoque(empresa: EmpresaInfo, itens: ProdutoLinha[]): string {
  const linhas = itens.map(p => [
    p.codigo, p.nome, p.unidade ?? '—', String(p.estoque_atual),
    p.valor_unitario != null ? `R$ ${p.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—',
  ])
  return envolver(
    'Relatório de Estoque',
    empresa,
    'Estoque atual de todos os materiais/ferramentas',
    tabela(['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual', 'Valor unitário'], linhas)
  )
}

// ── Relatório por faixa de estoque ─────────────────────────
export function gerarRelatorioFaixaEstoque(empresa: EmpresaInfo, itens: ProdutoLinha[], min: number, max: number): string {
  const linhas = itens.map(p => [
    p.codigo, p.nome, p.unidade ?? '—', String(p.estoque_atual),
  ])
  return envolver(
    'Relatório de Estoque por Faixa',
    empresa,
    `Materiais/Ferramentas com estoque entre ${min} e ${max}`,
    tabela(['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual'], linhas)
  )
}

// ── Relatório de movimentação de um produto ────────────────
interface MovimentoLinha {
  tipo: 'entrada' | 'saida'; data: string; quantidade: number
  pessoa?: string | null; referencia?: string | null
}

export function gerarRelatorioMovimentacao(
  empresa: EmpresaInfo, produto: { codigo: string; nome: string }, movimentos: MovimentoLinha[]
): string {
  const linhas = movimentos.map(m => [
    fmtData(m.data),
    m.tipo === 'entrada' ? 'Entrada' : 'Saída',
    String(m.quantidade),
    m.pessoa ?? '—',
    m.referencia ?? '—',
  ])
  return envolver(
    'Movimentação de Material/Ferramenta',
    empresa,
    `${produto.codigo} — ${produto.nome}`,
    tabela(['Data', 'Tipo', 'Quantidade', 'Fornecedor / Retirado por', 'Nota / Setor'], linhas)
  )
}

// ── NOVO: Relatório de Estoque Mínimo (quem está no limite ou
// abaixo, mas ainda tem alguma unidade — "zerado" é um relatório à
// parte, mais urgente) ──────────────────────────────────────
export function gerarRelatorioEstoqueMinimo(empresa: EmpresaInfo, itens: ProdutoLinha[]): string {
  const linhas = itens.map(p => [p.codigo, p.nome, p.unidade ?? '—', String(p.estoque_atual)])
  return envolver(
    'Relatório de Estoque Mínimo',
    empresa,
    'Materiais/Ferramentas no limite do estoque mínimo ou abaixo dele',
    tabela(['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual'], linhas)
  )
}

// ── NOVO: Relatório de Estoque Zerado ──────────────────────
export function gerarRelatorioEstoqueZerado(empresa: EmpresaInfo, itens: ProdutoLinha[]): string {
  const linhas = itens.map(p => [p.codigo, p.nome, p.unidade ?? '—'])
  return envolver(
    'Relatório de Estoque Zerado',
    empresa,
    'Materiais/Ferramentas sem nenhuma unidade em estoque',
    tabela(['Código', 'Material/Ferramenta', 'Unidade'], linhas)
  )
}

// ── NOVO: Relatório de Materiais por Categoria ─────────────
export function gerarRelatorioPorCategoria(empresa: EmpresaInfo, categoria: string, itens: ProdutoLinha[]): string {
  const linhas = itens.map(p => [p.codigo, p.nome, p.unidade ?? '—', String(p.estoque_atual)])
  return envolver(
    'Relatório de Materiais por Categoria',
    empresa,
    `Categoria: ${categoria}`,
    tabela(['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual'], linhas)
  )
}
// ── NOVO: Relatório de materiais/ferramentas alugados ──────
const LABEL_PERIODO: Record<string, string> = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' }

interface AlugadoLinha {
  codigo: string; nome: string; unidade?: string | null
  valor_aluguel?: number | null; aluguel_periodo?: string | null
  aluguel_vencimento?: string | null; fornecedor_nome?: string | null
}

export function gerarRelatorioAlugados(
  empresa: EmpresaInfo, itens: AlugadoLinha[], vencimentoInicio?: string, vencimentoFim?: string
): string {
  const linhas = itens.map(p => [
    p.codigo, p.nome, p.fornecedor_nome ?? '—',
    p.valor_aluguel != null ? `R$ ${p.valor_aluguel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—',
    p.aluguel_periodo ? (LABEL_PERIODO[p.aluguel_periodo] ?? p.aluguel_periodo) : '—',
    p.aluguel_vencimento ? fmtData(p.aluguel_vencimento) : '—',
  ])
  const subtitulo = vencimentoInicio && vencimentoFim
    ? `Materiais/Ferramentas alugados com vencimento entre ${fmtData(vencimentoInicio)} e ${fmtData(vencimentoFim)}`
    : 'Todos os materiais/ferramentas alugados'
  return envolver(
    'Relatório de Alugados',
    empresa,
    subtitulo,
    tabela(['Código', 'Material/Ferramenta', 'Fornecedor', 'Valor do aluguel', 'Período', 'Vencimento'], linhas)
  )
}
