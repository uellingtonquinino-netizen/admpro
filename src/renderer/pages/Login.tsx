import { useState }      from 'react'
import { useNavigate }   from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { toast }         from '@components/ui/ToastContainer'
import Button             from '@components/ui/Button'
import Input               from '@components/ui/Input'
import { KeyRound } from 'lucide-react'

type Etapa = 'login' | 'recuperar-pedir' | 'recuperar-confirmar'

export default function Login() {
  const navigate = useNavigate()
  const login     = useAuthStore(s => s.login)

  const [etapa, setEtapa] = useState<Etapa>('login')

  const [email, setEmail]     = useState('')
  const [senha, setSenha]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, senha)
      navigate('/inicio')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  // ── Recuperação de senha (esqueci minha senha) ────────────
  const [emailRecuperacao, setEmailRecuperacao] = useState('')
  const [codigo, setCodigo] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novaSenhaConfirma, setNovaSenhaConfirma] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function handlePedirCodigo(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      const resultado = await window.api.auth.solicitarRecuperacaoSenha(emailRecuperacao.trim())
      if (!resultado.ok) { toast.error(resultado.erro || 'Não foi possível enviar o código.'); return }
      toast.success('Código enviado — confira seu e-mail.')
      setEtapa('recuperar-confirmar')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao pedir o código.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleConfirmarCodigo(e: React.FormEvent) {
    e.preventDefault()
    if (novaSenha.length < 6) { toast.error('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== novaSenhaConfirma) { toast.error('A confirmação não bate com a nova senha.'); return }

    setEnviando(true)
    try {
      const resultado = await window.api.auth.confirmarRecuperacaoSenha({
        email: emailRecuperacao.trim(), codigo: codigo.trim(), novaSenha,
      })
      if (!resultado.ok) { toast.error(resultado.erro || 'Código inválido ou expirado.'); return }
      toast.success('Senha redefinida — já pode entrar com a nova senha.')
      setEtapa('login')
      setEmail(emailRecuperacao); setSenha('')
      setCodigo(''); setNovaSenha(''); setNovaSenhaConfirma(''); setEmailRecuperacao('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao redefinir a senha.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      {etapa === 'login' && (
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-surface-card border border-surface-border rounded-xl p-8 space-y-4"
        >
          <h1 className="text-xl font-bold text-center mb-2">ADM PRO</h1>

          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            label="Senha"
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
          />

          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>

          <button
            type="button"
            onClick={() => setEtapa('recuperar-pedir')}
            className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors"
          >
            Esqueci minha senha
          </button>
        </form>
      )}

      {etapa === 'recuperar-pedir' && (
        <form
          onSubmit={handlePedirCodigo}
          className="w-full max-w-sm bg-surface-card border border-surface-border rounded-xl p-8 space-y-4"
        >
          <div className="flex items-center gap-2 justify-center mb-1">
            <KeyRound size={18} className="text-brand-400" />
            <h1 className="text-lg font-bold text-center">Recuperar senha</h1>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Informe o e-mail da sua conta — vamos mandar um código pra redefinir a senha.
          </p>

          <Input
            label="E-mail"
            type="email"
            value={emailRecuperacao}
            onChange={e => setEmailRecuperacao(e.target.value)}
            required
          />

          <Button type="submit" loading={enviando} className="w-full">
            Enviar código
          </Button>

          <button
            type="button"
            onClick={() => setEtapa('login')}
            className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors"
          >
            Voltar pro login
          </button>
        </form>
      )}

      {etapa === 'recuperar-confirmar' && (
        <form
          onSubmit={handleConfirmarCodigo}
          className="w-full max-w-sm bg-surface-card border border-surface-border rounded-xl p-8 space-y-4"
        >
          <div className="flex items-center gap-2 justify-center mb-1">
            <KeyRound size={18} className="text-brand-400" />
            <h1 className="text-lg font-bold text-center">Digite o código</h1>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Enviamos um código de 6 dígitos pra <span className="text-gray-200">{emailRecuperacao}</span> — ele vale por 15 minutos.
          </p>

          <Input label="Código" value={codigo} onChange={e => setCodigo(e.target.value)} maxLength={6} required />
          <Input label="Nova senha" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required />
          <Input label="Confirmar nova senha" type="password" value={novaSenhaConfirma} onChange={e => setNovaSenhaConfirma(e.target.value)} required />

          <Button type="submit" loading={enviando} className="w-full">
            Redefinir senha
          </Button>

          <button
            type="button"
            onClick={() => setEtapa('recuperar-pedir')}
            className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors"
          >
            Não recebi o código — tentar de novo
          </button>
        </form>
      )}
    </div>
  )
}
