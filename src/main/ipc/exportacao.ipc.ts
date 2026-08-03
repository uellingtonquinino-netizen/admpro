import { ipcMain, dialog, app } from 'electron'
import { getDb }                from '../database/connection'
import { writeFileSync }        from 'fs'
import { join }                 from 'path'

interface ExportParams {
  empresa_id: number
  formato:    'csv' | 'pdf' | 'json'
}

interface SalvarParams {
  nome:     string
  conteudo: string
  formato:  'csv' | 'pdf' | 'json'
}

export function registerExportacaoIpc() {
  const db = getDb()

  // ── Gerar conteúdo ─────────────────────────────────────
  ipcMain.handle('exportacao:exportar', (_e, p: ExportParams) => {
    const lancamentos = db.prepare(`
      SELECT
        l.id,
        l.data,
        l.descricao,
        l.valor,
        l.tipo,
        l.status,
        c.nome  AS categoria,
        ct.nome AS conta
      FROM lancamentos l
      LEFT JOIN categorias c  ON c.id  = l.categoria_id
      LEFT JOIN contas     ct ON ct.id = l.conta_id
      WHERE l.empresa_id = ?
      ORDER BY l.data DESC
    `).all(p.empresa_id) as Record<string, unknown>[]

    if (p.formato === 'json') {
      return JSON.stringify({ lancamentos }, null, 2)
    }

    if (p.formato === 'csv') {
      const cabecalho = [
        'ID', 'Data', 'Descrição', 'Valor',
        'Tipo', 'Status', 'Categoria', 'Conta',
      ].join(';')

      const linhas = lancamentos.map(l =>
        [
          l.id,
          l.data,
          `"${String(l.descricao).replace(/"/g, '""')}"`,
          String(l.valor).replace('.', ','),
          l.tipo,
          l.status,
          l.categoria ?? '',
          l.conta      ?? '',
        ].join(';')
      )

      return [cabecalho, ...linhas].join('\n')
    }

    // PDF — retorna HTML simples (renderizado no renderer via Electron)
    const rows = lancamentos.map(l => `
      <tr>
        <td>${l.data}</td>
        <td>${l.descricao}</td>
        <td>${l.tipo === 'receita' ? '+' : '-'} R$ ${Number(l.valor).toFixed(2)}</td>
        <td>${l.tipo}</td>
        <td>${l.status}</td>
        <td>${l.categoria ?? '-'}</td>
        <td>${l.conta     ?? '-'}</td>
      </tr>
    `).join('')

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: sans-serif; font-size: 11px; margin: 24px; }
          h1   { font-size: 16px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
          th { background: #f3f4f6; }
          tr:nth-child(even) { background: #f9fafb; }
        </style>
      </head>
      <body>
        <h1>Relatório de Lançamentos</h1>
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Descrição</th><th>Valor</th>
              <th>Tipo</th><th>Status</th><th>Categoria</th><th>Conta</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `
  })

  // ── Salvar arquivo em disco ────────────────────────────
  ipcMain.handle('exportacao:salvarArquivo', async (_e, p: SalvarParams) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('downloads'), p.nome),
      filters: [
        p.formato === 'csv'  ? { name: 'CSV',  extensions: ['csv']  } :
        p.formato === 'pdf'  ? { name: 'HTML', extensions: ['html'] } :
                               { name: 'JSON', extensions: ['json'] },
      ],
    })

    if (canceled || !filePath) return { ok: false }

    writeFileSync(filePath, p.conteudo, 'utf-8')
    return { ok: true, filePath }
  })
}
