import { useState } from 'react'
import { apiWeb } from '../api-web'

interface Props {
  onLogado: (perfil: Awaited<ReturnType<typeof apiWeb.usuarios.login>>) => void
}

// NOVO: só Gestor e Supervisor entram por aqui, a princípio — quem
// loga com outro perfil recebe uma mensagem clara e a sessão é
// encerrada na hora (não fica "meio logado").
const PERFIS_PERMITIDOS = ['gestor', 'supervisor']

export default function MobileLogin({ onLogado }: Props) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  // NOVO: "esqueci minha senha" — troca a tela pra pedir só o e-mail,
  // manda o link de recuperação via Supabase Auth.
  const [modo, setModo] = useState<'login' | 'recuperar'>('login')
  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false)
  const [recuperacaoEnviada, setRecuperacaoEnviada] = useState(false)

  async function handleEnviarRecuperacao(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviandoRecuperacao(true)
    try {
      await apiWeb.auth.enviarRecuperacaoSenha(emailRecuperacao)
      setRecuperacaoEnviada(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar o e-mail de recuperação.')
    } finally {
      setEnviandoRecuperacao(false)
    }
  }

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    try {
      const perfil = await apiWeb.usuarios.login({ email, senha })
      if (!PERFIS_PERMITIDOS.includes(perfil.perfil)) {
        await apiWeb.auth.logout()
        setErro('Esse acesso pelo celular é só pra Gestor e Supervisor, por enquanto.')
        return
      }
      onLogado(perfil)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-xs">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 flex items-center justify-center mb-3">
            <span className="text-white font-extrabold text-lg leading-none">A</span>
          </div>
          <h1 className="text-lg font-extrabold text-gray-100 leading-tight text-center">
            ADM<br />OBRA
          </h1>
        </div>

        {modo === 'login' ? (
          <form onSubmit={handleEntrar} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-brand-500"
              />
            </div>

            {erro && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={entrando}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3.5 mt-2 transition-colors"
            >
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>

            <button
              type="button"
              onClick={() => { setModo('recuperar'); setErro(null); setRecuperacaoEnviada(false); setEmailRecuperacao(email) }}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-300 mt-1 py-1"
            >
              Esqueci minha senha
            </button>
          </form>
        ) : recuperacaoEnviada ? (
          // NOVO: confirmação depois de mandar o e-mail
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-300">
              Se <b className="text-gray-100">{emailRecuperacao}</b> estiver cadastrado, mandamos um link pra você trocar a senha. Confere sua caixa de entrada (e o spam, por garantia).
            </p>
            <button
              onClick={() => setModo('login')}
              className="w-full bg-surface-hover border border-surface-border text-gray-200 text-sm font-bold rounded-xl py-3"
            >
              Voltar pro login
            </button>
          </div>
        ) : (
          // NOVO: pedir só o e-mail pra mandar o link de recuperação
          <form onSubmit={handleEnviarRecuperacao} className="space-y-3">
            <p className="text-xs text-gray-500 mb-1">
              Digite seu e-mail — mandamos um link pra você trocar a senha.
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={emailRecuperacao}
                onChange={e => setEmailRecuperacao(e.target.value)}
                required
                autoComplete="username"
                className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-brand-500"
              />
            </div>

            {erro && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={enviandoRecuperacao}
              className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3.5 mt-2 transition-colors"
            >
              {enviandoRecuperacao ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>

            <button
              type="button"
              onClick={() => { setModo('login'); setErro(null) }}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-300 mt-1 py-1"
            >
              Voltar pro login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
