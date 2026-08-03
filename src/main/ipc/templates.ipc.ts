import { ipcMain, app } from 'electron'
import { join }          from 'path'
import * as XLSX         from 'xlsx'

// NOVO: lê a largura real das colunas direto do arquivo Excel de
// referência (resources/ficha_epi.xlsm), em vez de usar porcentagens
// fixas no código. Qualquer alteração futura nesse arquivo passa a
// valer automaticamente na próxima vez que o documento for gerado —
// sem precisar mexer em nenhuma linha de código.
//
// Estrutura da aba "FICHA DE EPI" no Excel (isto reflete a FORMA da
// tabela — quais colunas da planilha compõem cada cabeçalho visual —
// não é uma largura estimada; foi lida diretamente das células
// mescladas do arquivo enviado):
//   DATA ENTREGA   = colunas A, B, C  (índices 0-2)
//   QTD            = coluna  D        (índice 3)
//   DESCRIÇÃO      = colunas E, F, G  (índices 4-6)
//   CA n°          = colunas H, I     (índices 7-8)
//   A              = coluna  J        (índice 9)
//   S              = coluna  K        (índice 10)
//   P              = coluna  L        (índice 11)
//   D              = coluna  M        (índice 12)
//   ASSINATURA     = colunas N, O     (índices 13-14)
//   DEVOLUÇÃO DATA = colunas P, Q, R  (índices 15-17)
//   RUBRICA        = coluna  S        (índice 18)
const GRUPOS_COLUNAS: { chave: string; indices: number[] }[] = [
  { chave: 'data_entrega', indices: [0, 1, 2] },
  { chave: 'qtd',          indices: [3] },
  { chave: 'descricao',    indices: [4, 5, 6] },
  { chave: 'ca',           indices: [7, 8] },
  { chave: 'a',            indices: [9] },
  { chave: 's',            indices: [10] },
  { chave: 'p',            indices: [11] },
  { chave: 'd',            indices: [12] },
  { chave: 'assinatura',   indices: [13, 14] },
  { chave: 'devolucao',    indices: [15, 16, 17] },
  { chave: 'rubrica',      indices: [18] },
]

// Largura padrão do Excel quando a coluna não tem largura customizada
// (baseColWidth=8 sem defaultColWidth definido — padrão documentado
// do próprio formato XLSX, não uma estimativa nossa).
const LARGURA_PADRAO_EXCEL = 8.43

function resolverCaminhoRecurso(nomeArquivo: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', nomeArquivo)
    : join(app.getAppPath(), 'resources', nomeArquivo)
}

export function registerTemplatesIpc() {
  ipcMain.handle('templates:larguraColunasFichaEpi', () => {
    const caminho = resolverCaminhoRecurso('ficha_epi.xlsm')
    // NOTA: sem opções restritivas no read — algumas (ex: cellStyles:false)
    // podem, dependendo da versão da biblioteca, interferir na leitura dos
    // metadados de largura de coluna (`!cols`) de arquivos .xlsm.
    const wb = XLSX.readFile(caminho)
    const ws = wb.Sheets['FICHA DE EPI']
    if (!ws) throw new Error('Aba "FICHA DE EPI" não encontrada no arquivo de referência.')

    const cols = ws['!cols'] ?? []
    const larguraColuna = (indice: number): number => {
      const c = cols[indice] as { wch?: number; width?: number } | undefined
      return c?.wch ?? c?.width ?? LARGURA_PADRAO_EXCEL
    }

    const somas = GRUPOS_COLUNAS.map(g => ({
      chave: g.chave,
      soma:  g.indices.reduce((total, i) => total + larguraColuna(i), 0),
    }))

    const total = somas.reduce((acc, g) => acc + g.soma, 0)
    if (total <= 0) throw new Error('Não foi possível calcular larguras a partir do Excel (total zero).')

    const percentuais: Record<string, number> = {}
    for (const g of somas) {
      percentuais[g.chave] = (g.soma / total) * 100
    }

    // Verificação de sanidade: no layout real, DESCRIÇÃO é claramente
    // larga (>15%) e as colunas de marcação A/S/P/D são claramente
    // estreitas (<4%). Se isso não acontecer, os dados lidos não são
    // confiáveis (ex: a biblioteca não capturou `!cols` para este
    // arquivo e tudo caiu no valor padrão) — melhor recusar e usar a
    // reserva conhecida do que exibir uma tabela com proporção errada.
    const maiorCheckbox = Math.max(percentuais.a, percentuais.s, percentuais.p, percentuais.d)
    if (percentuais.descricao < 15 || maiorCheckbox > 4) {
      throw new Error('Larguras lidas do Excel não parecem confiáveis (proporções fora do esperado).')
    }

    return percentuais
  })
}
