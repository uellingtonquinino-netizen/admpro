import { ipcMain } from 'electron'
import { getDb }   from '../database/connection'
import { enviarEmail } from '../utils/email'

interface ConfigPayload {
  smtp_host:       string
  smtp_porta:      number
  smtp_usuario:    string
  smtp_senha:      string
  smtp_seguro:     boolean
  remetente_nome:  string
  remetente_email: string
}

export function registerConfiguracoesEmailIpc() {
  const db = getDb()

  ipcMain.handle('configuracoesEmail:buscar', () => {
    return db.prepare(`SELECT * FROM configuracoes_email WHERE id = 1`).get() ?? null
  })

  // NOVO: configuração do servidor de e-mail (SMTP) que manda o
  // código de recuperação de senha — só o Administrador Master mexe
  // aqui (a tela já é liberada só pro perfil dele).
  ipcMain.handle('configuracoesEmail:salvar', (_e, p: ConfigPayload) => {
    db.prepare(`
      INSERT INTO configuracoes_email
        (id, smtp_host, smtp_porta, smtp_usuario, smtp_senha, smtp_seguro, remetente_nome, remetente_email, updated_at)
      VALUES (1, @smtp_host, @smtp_porta, @smtp_usuario, @smtp_senha, @smtp_seguro, @remetente_nome, @remetente_email, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        smtp_host = excluded.smtp_host, smtp_porta = excluded.smtp_porta,
        smtp_usuario = excluded.smtp_usuario, smtp_senha = excluded.smtp_senha,
        smtp_seguro = excluded.smtp_seguro, remetente_nome = excluded.remetente_nome,
        remetente_email = excluded.remetente_email, updated_at = excluded.updated_at
    `).run({ ...p, smtp_seguro: p.smtp_seguro ? 1 : 0 })
    return { ok: true }
  })

  // ── Envia um e-mail de teste, pra conferir se a configuração
  // está certa antes de depender dela pra recuperação de senha.
  ipcMain.handle('configuracoesEmail:testarEnvio', async (_e, destinatario: string) => {
    try {
      await enviarEmail({
        para: destinatario,
        assunto: 'Teste de configuração de e-mail — ADM PRO',
        texto: 'Se você recebeu este e-mail, a configuração do servidor SMTP está funcionando corretamente.',
        html: '<p>Se você recebeu este e-mail, a configuração do servidor SMTP está funcionando corretamente.</p>',
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao enviar o e-mail de teste.' }
    }
  })
}
