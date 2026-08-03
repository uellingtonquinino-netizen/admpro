import nodemailer from 'nodemailer'
import dns        from 'dns'
import { getDb }  from '../database/connection'

// CORRIGIDO: em redes sem IPv6 funcionando de verdade (bem comum no
// Brasil), o Node tentava conectar no endereço IPv6 do servidor SMTP
// primeiro (ex: smtp.gmail.com tem os dois) e dava "ENETUNREACH" —
// não é erro de configuração, é só a ordem de resolução de DNS.
// Isso faz o Node preferir IPv4 sempre que os dois existirem.
dns.setDefaultResultOrder('ipv4first')

interface ConfiguracaoEmail {
  smtp_host:       string | null
  smtp_porta:      number | null
  smtp_usuario:    string | null
  smtp_senha:      string | null
  smtp_seguro:     number
  remetente_nome:  string | null
  remetente_email: string | null
}

export function buscarConfiguracaoEmail(): ConfiguracaoEmail | null {
  const db = getDb()
  const config = db.prepare(`SELECT * FROM configuracoes_email WHERE id = 1`).get() as ConfiguracaoEmail | undefined
  return config ?? null
}

// NOVO: envia um e-mail usando o SMTP configurado pelo Administrador
// Master. Lança erro com uma mensagem clara se o SMTP não estiver
// configurado ainda, ou se o envio falhar (credenciais erradas,
// servidor fora do ar etc.) — quem chama decide o que mostrar.
export async function enviarEmail(p: { para: string; assunto: string; texto: string; html?: string }): Promise<void> {
  const config = buscarConfiguracaoEmail()
  if (!config || !config.smtp_host || !config.smtp_usuario || !config.smtp_senha) {
    throw new Error('O envio de e-mail ainda não foi configurado. Peça pro Administrador Master configurar em Painel Administrador → E-mail.')
  }

  const porta = config.smtp_porta ?? 587
  // CORRIGIDO: a porta 465 espera a conexão já nascer criptografada
  // (SSL/TLS implícito); a 587 — a mais comum, inclusive a padrão do
  // Gmail — espera nascer "aberta" e só DEPOIS virar segura
  // (STARTTLS). Misturar isso dá esse erro de "WRONG_VERSION" — por
  // isso decide sozinho pela porta, em vez de confiar numa marcação
  // manual que a pessoa pode deixar inconsistente com a porta.
  const seguroDeVerdade = porta === 465
  const transportador = nodemailer.createTransport({
    host: config.smtp_host,
    port: porta,
    secure: seguroDeVerdade,
    requireTLS: !seguroDeVerdade,
    auth: { user: config.smtp_usuario, pass: config.smtp_senha },
  })

  try {
    await transportador.sendMail({
      from: `"${config.remetente_nome || 'ADM PRO'}" <${config.remetente_email || config.smtp_usuario}>`,
      to: p.para,
      subject: p.assunto,
      text: p.texto,
      html: p.html,
    })
  } catch (err) {
    // NOVO: traduz os erros de rede/SMTP mais comuns pra uma
    // mensagem que a pessoa consegue agir em cima, em vez do texto
    // técnico do Node.
    const codigo = (err as { code?: string } | undefined)?.code
    if (codigo === 'ENETUNREACH' || codigo === 'ENOTFOUND' || codigo === 'ECONNREFUSED') {
      throw new Error('Não foi possível conectar ao servidor SMTP — confira o endereço/porta e a internet deste computador.')
    }
    if (codigo === 'ETIMEDOUT') {
      throw new Error('O servidor SMTP demorou demais pra responder — confira se a porta está certa (587 ou 465) e se algum firewall não está bloqueando.')
    }
    if (codigo === 'EAUTH') {
      throw new Error('O servidor recusou o usuário/senha — confira as credenciais (no Gmail, normalmente precisa de uma "senha de app", não a senha normal da conta).')
    }
    if (err instanceof Error && err.message.includes('WRONG_VERSION')) {
      throw new Error('A porta e o tipo de conexão não combinam — confira se está usando 465 (SSL direto) ou 587 (a mais comum, com STARTTLS).')
    }
    throw err
  }
}
