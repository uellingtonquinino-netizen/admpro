import { ipcMain, dialog, BrowserWindow, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import * as XLSX  from 'xlsx'
import { getDb }  from '../database/connection'

// Mapeamento entre o rótulo em português (cabeçalho da planilha) e a
// coluna real no banco de dados — usado tanto para gerar o modelo
// quanto para ler a importação, garantindo que os dois lados batem.
const CAMPOS_IMPORTACAO: { rotulo: string; campo: string; tipo?: 'data' | 'numero' | 'booleano' | 'cpf' }[] = [
  { rotulo: 'Nome completo',                    campo: 'nome' },
  { rotulo: 'Código (matrícula e-Social)',      campo: 'matricula_esocial' },
  { rotulo: 'CPF',                              campo: 'cpf', tipo: 'cpf' },
  { rotulo: 'RG',                               campo: 'rg' },
  { rotulo: 'RG - Órgão emissor',               campo: 'rg_orgao_emissor' },
  { rotulo: 'Data de nascimento (AAAA-MM-DD)',  campo: 'nascimento', tipo: 'data' },
  { rotulo: 'Estado civil',                     campo: 'estado_civil' },
  { rotulo: 'Nacionalidade',                    campo: 'nacionalidade' },
  { rotulo: 'Nome da mãe',                      campo: 'nome_mae' },
  { rotulo: 'Nome do pai',                      campo: 'nome_pai' },
  { rotulo: 'Escolaridade',                     campo: 'escolaridade' },
  { rotulo: 'PCD (Sim/Não)',                    campo: 'pcd', tipo: 'booleano' },
  { rotulo: 'Cor/Raça',                         campo: 'cor_raca' },
  { rotulo: 'Função',                           campo: 'funcao' },
  { rotulo: 'Setor',                            campo: 'setor' },
  { rotulo: 'Equipe',                           campo: 'equipe' },
  { rotulo: 'Tipo de contrato',                 campo: 'tipo_contrato' },
  { rotulo: 'Data de admissão (AAAA-MM-DD)',    campo: 'data_admissao', tipo: 'data' },
  { rotulo: 'Dias de experiência',              campo: 'dias_experiencia', tipo: 'numero' },
  { rotulo: 'Data de demissão (AAAA-MM-DD)',    campo: 'data_demissao', tipo: 'data' },
  { rotulo: 'Tipo de demissão',                 campo: 'tipo_demissao' },
  { rotulo: 'Salário base',                     campo: 'salario_base', tipo: 'numero' },
  { rotulo: 'Status (ativo/afastado/ferias/desligado)', campo: 'status' },
  { rotulo: 'CTPS',                             campo: 'ctps' },
  { rotulo: 'CTPS - Série',                     campo: 'ctps_serie' },
  { rotulo: 'PIS',                              campo: 'pis' },
  { rotulo: 'Telefone',                         campo: 'telefone' },
  { rotulo: 'E-mail',                           campo: 'email' },
  { rotulo: 'Contato de emergência - Nome',     campo: 'contato_emergencia_nome' },
  { rotulo: 'Contato de emergência - Telefone', campo: 'contato_emergencia_telefone' },
  { rotulo: 'Endereço',                         campo: 'endereco' },
  { rotulo: 'Número',                           campo: 'numero' },
  { rotulo: 'Bairro',                           campo: 'bairro' },
  { rotulo: 'Cidade',                           campo: 'cidade' },
  { rotulo: 'UF',                               campo: 'estado' },
  { rotulo: 'CEP',                              campo: 'cep' },
  { rotulo: 'Banco',                            campo: 'banco' },
  { rotulo: 'Agência',                          campo: 'agencia' },
  { rotulo: 'Operação',                         campo: 'operacao' },
  { rotulo: 'Conta',                            campo: 'conta' },
  { rotulo: 'Dígito',                           campo: 'conta_digito' },
  { rotulo: 'Tipo de conta (corrente/poupanca)',campo: 'tipo_conta' },
  { rotulo: 'Passagem (Sim/Não)',                campo: 'passagem' },
  { rotulo: 'Valor ida e volta',                campo: 'valor_ida_volta', tipo: 'numero' },
  { rotulo: 'Alimentação',                      campo: 'alimentacao', tipo: 'numero' },
  { rotulo: 'Tamanho da camisa',                campo: 'tamanho_camisa' },
  { rotulo: 'Tamanho da calça',                 campo: 'tamanho_calca' },
  { rotulo: 'Número do calçado',                campo: 'numero_calcado' },
  { rotulo: 'Título de eleitor - Número',       campo: 'titulo_numero' },
  { rotulo: 'Título de eleitor - Zona',         campo: 'titulo_zona' },
  { rotulo: 'Título de eleitor - Seção',        campo: 'titulo_secao' },
  { rotulo: 'Reservista',                       campo: 'reservista' },
  { rotulo: 'CNH - Número',                     campo: 'cnh_numero' },
  { rotulo: 'CNH - Categoria',                  campo: 'cnh_categoria' },
  { rotulo: 'CNH - Vencimento (AAAA-MM-DD)',    campo: 'cnh_vencimento', tipo: 'data' },
  { rotulo: 'Alojado (Sim/Não)',                campo: 'alojado', tipo: 'booleano' },
  { rotulo: 'Tem baixada (Sim/Não)',            campo: 'tem_baixada', tipo: 'booleano' },
  { rotulo: 'Observações',                      campo: 'observacoes' },
]

// Formata CPF no padrão 000.000.000-00, aceitando o valor com ou sem
// pontuação na planilha — mesma lógica usada nos formulários de
// cadastro, reaproveitada aqui pois este arquivo roda no processo
// principal (não pode importar direto de src/renderer).
function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length !== 11) return valor.trim() // não parece CPF válido — mantém como veio
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// Mesmo cálculo do formulário de cadastro (admissão + dias de
// experiência - 1, o dia da admissão conta como o 1° dia do
// período) — usado aqui pra não deixar quem for importado por
// planilha sem esse campo, coisa que já causou colaboradores
// sumindo do relatório e da notificação de vencimento.
function calcularVencimentoExperiencia(dataAdmissao: string, diasExperiencia: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dataAdmissao)) return null
  const d = new Date(`${dataAdmissao}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + diasExperiencia - 1)
  return d.toISOString().slice(0, 10)
}

export function registerImportacaoIpc() {
  const db = getDb()

  // ── Gerar e salvar o modelo em branco ───────────────────
  ipcMain.handle('importacao:gerarModeloColaboradores', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: SaveDialogOptions = {
      title:        'Salvar modelo de importação',
      defaultPath:  'Modelo_Importacao_Colaboradores.xlsx',
      filters:      [{ name: 'Excel', extensions: ['xlsx'] }],
    }
    const { filePath, canceled } = win
      ? await dialog.showSaveDialog(win, opcoesDialogo)
      : await dialog.showSaveDialog(opcoesDialogo)
    if (canceled || !filePath) return { ok: false }

    const cabecalho = CAMPOS_IMPORTACAO.map(c => c.rotulo)
    const linhaExemplo = CAMPOS_IMPORTACAO.map(c => {
      if (c.campo === 'nome') return 'JOÃO DA SILVA (exemplo — apague esta linha)'
      if (c.campo === 'cpf') return '000.000.000-00'
      return ''
    })

    const ws = XLSX.utils.aoa_to_sheet([cabecalho, linhaExemplo])
    ws['!cols'] = cabecalho.map(h => ({ wch: Math.max(18, h.length) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Colaboradores')
    XLSX.writeFile(wb, filePath)

    return { ok: true, filePath }
  })

  // ── Importar planilha preenchida ────────────────────────
  ipcMain.handle('importacao:importarColaboradores', async (_e, p: { empresa_id: number }) => {
    const win = BrowserWindow.getFocusedWindow()
    const opcoesDialogo: OpenDialogOptions = {
      title:       'Selecionar planilha de colaboradores',
      filters:     [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties:  ['openFile'],
    }
    const { filePaths, canceled } = win
      ? await dialog.showOpenDialog(win, opcoesDialogo)
      : await dialog.showOpenDialog(opcoesDialogo)
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

    // CORRIGIDO: sem `cellDates: true`, células que o Excel guarda como
    // data "de verdade" (não texto) chegavam como um número de série
    // sem sentido (ex: 45852) em vez de uma data reconhecível — por
    // isso campos como Data de Admissão não eram importados mesmo
    // quando pareciam corretos na planilha.
    const wb = XLSX.readFile(filePaths[0], { cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    let criados = 0
    let atualizados = 0
    let ignorados = 0

    const buscarPorCpf = db.prepare(
      `SELECT id FROM colaboradores WHERE empresa_id = ? AND cpf = ? AND cpf IS NOT NULL AND cpf != ''`
    )

    for (const linha of linhas) {
      // Monta o objeto só com os campos que têm valor preenchido —
      // campos em branco na planilha são simplesmente ignorados.
      const dados: Record<string, unknown> = {}
      for (const { rotulo, campo, tipo } of CAMPOS_IMPORTACAO) {
        const bruto = linha[rotulo]
        if (bruto === undefined || bruto === null || String(bruto).trim() === '') continue

        if (tipo === 'booleano') {
          const v = String(bruto).trim().toLowerCase()
          dados[campo] = v === 'sim' || v === '1' || v === 'true' ? 1 : 0
        } else if (tipo === 'cpf') {
          dados[campo] = formatarCpf(String(bruto))
        } else if (tipo === 'numero') {
          const n = Number(String(bruto).replace(',', '.'))
          if (!Number.isNaN(n)) dados[campo] = n
        } else if (tipo === 'data') {
          // CORRIGIDO: agora aceita data nativa do Excel, "AAAA-MM-DD"
          // ou também "DD/MM/AAAA" (formato brasileiro) — antes, se a
          // pessoa digitasse a data no formato comum do dia a dia em
          // vez do pedido no modelo, ela entrava torta no banco e
          // travava a tela ao tentar editar aquele colaborador depois.
          if (bruto instanceof Date) {
            dados[campo] = bruto.toISOString().slice(0, 10)
          } else if (typeof bruto === 'number') {
            // Reserva: número de série do Excel que não virou Date
            // automaticamente (época do Excel: 1899-12-30).
            const data = new Date(Math.round((bruto - 25569) * 86400 * 1000))
            dados[campo] = Number.isNaN(data.getTime()) ? '' : data.toISOString().slice(0, 10)
          } else {
            const texto = String(bruto).trim()
            const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto)
            if (br) {
              const [, dia, mes, ano] = br
              dados[campo] = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
            } else {
              dados[campo] = texto
            }
          }
        } else {
          dados[campo] = String(bruto).trim()
        }
      }

      if (!dados.nome) { ignorados++; continue }

      const existente = dados.cpf
        ? (buscarPorCpf.get(p.empresa_id, dados.cpf) as { id: number } | undefined)
        : undefined

      // CORRIGIDO: a planilha não tem coluna própria pra "vencimento
      // da experiência" — antes isso ficava em branco pra todo mundo
      // importado, mesmo com admissão e dias de experiência
      // preenchidos. Calcula aqui do mesmo jeito que o formulário já
      // fazia. Se a linha não trouxer a admissão (atualização
      // parcial), busca a que já está salva pra esse colaborador.
      if (dados.dias_experiencia !== undefined) {
        const admissaoParaCalculo = typeof dados.data_admissao === 'string'
          ? dados.data_admissao
          : existente
            ? (db.prepare(`SELECT data_admissao FROM colaboradores WHERE id = ?`).get(existente.id) as { data_admissao: string | null } | undefined)?.data_admissao
            : undefined
        if (admissaoParaCalculo) {
          const vencimento = calcularVencimentoExperiencia(admissaoParaCalculo, Number(dados.dias_experiencia))
          if (vencimento) dados.data_vencimento_experiencia = vencimento
        }
      }

      if (existente) {
        const sets = Object.keys(dados).map(c => `${c} = @${c}`).join(', ')
        db.prepare(`UPDATE colaboradores SET ${sets} WHERE id = @id`)
          .run({ ...dados, id: existente.id })
        atualizados++
      } else {
        const colunas = ['empresa_id', ...Object.keys(dados)]
        const binds   = colunas.map(c => `@${c}`).join(', ')
        db.prepare(`INSERT INTO colaboradores (${colunas.join(', ')}) VALUES (${binds})`)
          .run({ ...dados, empresa_id: p.empresa_id })
        criados++
      }
    }

    return { ok: true, criados, atualizados, ignorados, total: linhas.length }
  })
}
