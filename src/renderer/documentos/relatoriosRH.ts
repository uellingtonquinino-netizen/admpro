import { documentoBase, cabecalhoComLogo, fmtData, hoje } from './base'
import { formatCPF } from '../utils/documentValidators'

interface EmpresaInfo {
  nome: string
  logo_url?: string | null
}

function tabela(colunas: string[], linhas: string[][]): string {
  // A primeira coluna (Nome) recebe o espaço que sobra; todas as
  // outras encolhem para o mínimo necessário ao próprio conteúdo —
  // assim "Código" fica do tamanho de "Código", "Função" do tamanho
  // do maior valor que tiver, etc., sem sobrar espaço à toa.
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

// ALTERADO: fonte de todo o texto dos relatórios agora é Calibri Light
// 12pt (títulos continuam na fonte padrão dos documentos). A coluna
// Nome absorve o espaço sobrando; as demais encolhem para o mínimo
// necessário ao conteúdo (igual "autoajustar" do Excel, mas sem
// desperdiçar espaço nas colunas menores). Paisagem ligada para dar
// mais espaço horizontal.
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
        ${empresa.nome} &nbsp;•&nbsp; ${subtitulo} &nbsp;•&nbsp; Emitido em ${hoje()}
      </p>
      ${corpo}
    `,
  })
}

export function gerarRelatorioColaboradoresAtivos(empresa: EmpresaInfo, itens: any[]): string {
  const linhas = itens.map(c => [
    c.nome, c.matricula_esocial, c.funcao, c.equipe, fmtData(c.data_admissao),
  ])
  return envolver(
    'Colaboradores Ativos',
    empresa,
    `${itens.length} colaborador(es)`,
    tabela(['Nome', 'Código', 'Função', 'Equipe', 'Admissão'], linhas)
  )
}

export function gerarRelatorioVencimentoExperiencia(empresa: EmpresaInfo, itens: any[], periodo: string): string {
  const linhas = itens.map(c => [
    c.nome, c.funcao, fmtData(c.data_admissao), fmtData(c.data_vencimento_experiencia),
    c.dias_restantes < 0 ? `Vencido há ${Math.abs(c.dias_restantes)} dia(s)` : `${c.dias_restantes} dia(s)`,
  ])
  return envolver(
    'Vencimento de Experiência',
    empresa,
    `${periodo} — ${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Admissão', 'Vencimento', 'Situação'], linhas)
  )
}

export function gerarRelatorioAlojados(empresa: EmpresaInfo, itens: any[]): string {
  // ALTERADO: coluna nova com o vencimento da baixada (quando a
  // pessoa tem baixada configurada) — "—" pra quem não tem.
  const linhas = itens.map(c => [
    c.nome, c.funcao, c.equipe, `${c.cidade || ''}${c.estado ? ` - ${c.estado}` : ''}`, c.telefone,
    c.tem_baixada && c.data_vencimento_baixada ? fmtData(c.data_vencimento_baixada) : '—',
  ])
  return envolver(
    'Colaboradores Alojados',
    empresa,
    `${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Equipe', 'Cidade', 'Telefone', 'Vencimento Baixada'], linhas)
  )
}

// NOVO: colaboradores afastados (ainda no quadro, sem trabalhar no momento).
export function gerarRelatorioAfastados(empresa: EmpresaInfo, itens: any[]): string {
  const linhas = itens.map(c => [c.nome, c.funcao, c.setor, c.equipe, fmtData(c.data_admissao)])
  return envolver(
    'Colaboradores Afastados',
    empresa,
    `${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Setor', 'Equipe', 'Admissão'], linhas)
  )
}

// NOVO: colaboradores inativos — desligados, com o vínculo já encerrado.
export function gerarRelatorioInativos(empresa: EmpresaInfo, itens: any[]): string {
  const linhas = itens.map(c => [c.nome, c.funcao, fmtData(c.data_admissao), fmtData(c.data_demissao), c.tipo_demissao || '—'])
  return envolver(
    'Colaboradores Inativos',
    empresa,
    `${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Admissão', 'Desligamento', 'Tipo'], linhas)
  )
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function gerarRelatorioAniversariantes(empresa: EmpresaInfo, itens: any[], mes: number): string {
  const linhas = itens.map(c => [c.nome, c.funcao, fmtData(c.nascimento)])
  return envolver(
    'Aniversariantes do Mês',
    empresa,
    `${MESES[mes]} — ${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Nascimento'], linhas)
  )
}

export function gerarRelatorioMovimentacao(
  empresa: EmpresaInfo,
  dados: { admissoes: any[]; demissoes: any[] },
  inicio: string, fim: string
): string {
  const corpo = `
    <p class="campo" style="font-weight:700;margin-top:10px;">Admissões (${dados.admissoes.length})</p>
    ${tabela(['Nome', 'Função', 'Data'], dados.admissoes.map(c => [c.nome, c.funcao, fmtData(c.data)]))}

    <p class="campo" style="font-weight:700;margin-top:20px;">Desligamentos (${dados.demissoes.length})</p>
    ${tabela(['Nome', 'Função', 'Data', 'Tipo'], dados.demissoes.map(c => [c.nome, c.funcao, fmtData(c.data), c.tipo_demissao]))}
  `
  return envolver(
    'Admissões e Desligamentos',
    empresa,
    `Período: ${fmtData(inicio)} a ${fmtData(fim)}`,
    corpo
  )
}

export function gerarRelatorioPorSetor(empresa: EmpresaInfo, itens: any[], setor: string): string {
  const linhas = itens.map(c => [c.nome, c.funcao, c.setor])
  return envolver(
    'Colaboradores por Setor',
    empresa,
    `${setor || 'Todos os setores'} — ${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Setor'], linhas)
  )
}

// NOVO: colaboradores admitidos dentro de um período — histórico de
// contratação, independente do status atual.
const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo', afastado: 'Afastado', ferias: 'Férias', desligado: 'Desligado',
}
export function gerarRelatorioPorAdmissao(empresa: EmpresaInfo, itens: any[], periodo: string): string {
  const linhas = itens.map(c => [c.nome, c.funcao, c.setor, fmtData(c.data_admissao), STATUS_LABEL[c.status] ?? c.status])
  return envolver(
    'Colaboradores por Data de Admissão',
    empresa,
    `${periodo} — ${itens.length} colaborador(es)`,
    tabela(['Nome', 'Função', 'Setor', 'Admissão', 'Status atual'], linhas)
  )
}

export function gerarRelatorioContasBancarias(empresa: EmpresaInfo, itens: any[]): string {
  const linhas = itens.map(c => [
    c.nome, formatCPF(c.cpf), c.banco, c.agencia, c.conta, c.conta_digito, c.tipo_conta,
  ])
  return envolver(
    'Contas Bancárias',
    empresa,
    `${itens.length} colaborador(es)`,
    tabela(['Nome', 'CPF', 'Banco', 'Agência', 'Conta', 'Dígito', 'Tipo'], linhas)
  )
}
