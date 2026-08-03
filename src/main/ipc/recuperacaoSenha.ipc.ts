import { ipcMain } from 'electron'
import bcrypt       from 'bcryptjs'
import { getDb }    from '../database/connection'
import { enviarEmail } from '../utils/email'

function gerarCodigo(): string {
  return String(Math.floor(100000 + Math.random() * 900000))  // 6 dígitos
}

export function registerRecuperacaoSenhaIpc() {
  const db = getDb()

  // ── Passo 1: pede o código por e-mail ─────────────────────
  // Se o e-mail existir em mais de um cadastro (a mesma pessoa com
  // acesso a mais de uma obra, por exemplo), gera um código válido
  // pra TODOS eles de uma vez — a pessoa troca a senha uma vez só e
  // ela vale em todos os cadastros com esse e-mail.
  ipcMain.handle('auth:solicitarRecuperacaoSenha', async (_e, email: string) => {
    const usuarios = db.prepare(`SELECT id FROM usuarios WHERE email = ? AND ativo = 1`).all(email) as { id: number }[]
    if (usuarios.length === 0) {
      return { ok: false, erro: 'Não encontramos nenhuma conta ativa com esse e-mail.' }
    }

    const codigo = gerarCodigo()
    const expiraEm = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    const inserir = db.prepare(`
      INSERT INTO recuperacao_senha (usuario_id, codigo, expira_em) VALUES (?, ?, ?)
    `)
    for (const u of usuarios) inserir.run(u.id, codigo, expiraEm)

    try {
      await enviarEmail({
        para: email,
        assunto: 'Código para redefinir sua senha — ADM PRO',
        texto: `Seu código de recuperação de senha é: ${codigo}\n\nEle vale por 15 minutos. Se você não pediu essa recuperação, ignore este e-mail.`,
        html: `<p>Seu código de recuperação de senha é:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${codigo}</p><p>Ele vale por 15 minutos. Se você não pediu essa recuperação, ignore este e-mail.</p>`,
      })
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Erro ao enviar o e-mail.' }
    }

    return { ok: true }
  })

  // ── Passo 2: confirma o código e define a nova senha ──────
  ipcMain.handle('auth:confirmarRecuperacaoSenha', (_e, p: { email: string; codigo: string; novaSenha: string }) => {
    const usuarios = db.prepare(`SELECT id FROM usuarios WHERE email = ?`).all(p.email) as { id: number }[]
    if (usuarios.length === 0) return { ok: false, erro: 'Código inválido ou expirado.' }

    const agora = new Date().toISOString()
    let algumValido = false
    for (const u of usuarios) {
      const pedido = db.prepare(`
        SELECT id FROM recuperacao_senha
        WHERE usuario_id = ? AND codigo = ? AND usado = 0 AND expira_em >= ?
        ORDER BY id DESC LIMIT 1
      `).get(u.id, p.codigo, agora) as { id: number } | undefined
      if (pedido) { algumValido = true }
    }
    if (!algumValido) return { ok: false, erro: 'Código inválido ou expirado.' }

    const novoHash = bcrypt.hashSync(p.novaSenha, 10)
    const trocar = db.transaction(() => {
      for (const u of usuarios) {
        db.prepare(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`).run(novoHash, u.id)
        db.prepare(`
          UPDATE recuperacao_senha SET usado = 1
          WHERE usuario_id = ? AND codigo = ?
        `).run(u.id, p.codigo)
      }
    })
    trocar()

    return { ok: true }
  })
}
