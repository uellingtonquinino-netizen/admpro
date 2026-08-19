import { useState } from 'react'
import { apiWeb } from '../api-web'

interface Props {
  onConcluido: () => void
}

// NOVO: tela que aparece quando o usuário clica no link do e-mail de
// "esqueci minha senha" — o Supabase já autentica ele sozinho nesse
// momento (modo especial de recuperação), só falta digitar a senha
// nova.
export default function MobileNovaSenha({ onConcluido }: Props) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmacao) { setErro('As senhas não são iguais.'); return }
    setSalvando(true)
    try {
      await apiWeb.auth.atualizarSenha(senha)
      setSucesso(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao trocar a senha.')
    } finally {
      setSalvando(false)
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 py-10" style={{ background: '#0f172a' }}>
        <div className="mx-auto w-full max-w-xs text-center space-y-4">
          <p className="text-sm text-gray-200">Senha alterada com sucesso!</p>
          <button
            onClick={onConcluido}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm rounded-xl py-3.5 transition-colors"
          >
            Continuar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-10" style={{ background: '#0f172a' }}>
      <div className="mx-auto w-full max-w-xs">
        <h1 className="text-lg font-extrabold text-gray-100 text-center mb-6">Nova senha</h1>

        <form onSubmit={handleSalvar} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Nova senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100 outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">
              Confirmar nova senha
            </label>
            <input
              type="password"
              value={confirmacao}
              onChange={e => setConfirmacao(e.target.value)}
              required
              autoComplete="new-password"
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
            disabled={salvando}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-bold text-sm rounded-xl py-3.5 mt-2 transition-colors"
          >
            {salvando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
