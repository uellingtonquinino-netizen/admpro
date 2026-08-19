import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import Button from '@components/ui/Button'
import Input from '@components/ui/Input'
import { toast } from '@components/ui/ToastContainer'
import { KeyRound } from 'lucide-react'

// NOVO: tela exclusiva do build web — pra onde o link de "esqueci
// minha senha" leva a pessoa (ver redirectTo em webApi.ts). O
// Supabase, ao processar o link, dispara o evento PASSWORD_RECOVERY
// e já deixa uma sessão temporária ativa, só pra permitir trocar a
// senha (sem precisar saber a antiga).
export default function NovaSenhaWeb() {
  const [pronto, setPronto] = useState(false)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setPronto(true)
    })
    // Se a sessão de recuperação já tiver sido processada antes desse
    // efeito rodar (link já detectado no carregamento da página),
    // confere se já existe uma sessão válida mesmo sem o evento.
    supabase.auth.getSession().then(({ data }) => { if (data.session) setPronto(true) })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (novaSenha.length < 6) { toast.error('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (novaSenha !== confirmacao) { toast.error('A confirmação não bate com a nova senha.'); return }
    setSalvando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      if (error) throw new Error(error.message)
      setConcluido(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar a nova senha.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-xl p-8 space-y-4 text-center">
        <div className="flex items-center gap-2 justify-center mb-1">
          <KeyRound size={18} className="text-brand-400" />
          <h1 className="text-lg font-bold text-center">Nova senha</h1>
        </div>

        {concluido ? (
          <>
            <p className="text-sm text-gray-300">Senha alterada com sucesso.</p>
            <Button className="w-full" onClick={() => { window.location.hash = '#/'; window.location.reload() }}>
              Ir pro login
            </Button>
          </>
        ) : !pronto ? (
          <p className="text-xs text-gray-400">Confirmando o link, um instante...</p>
        ) : (
          <form onSubmit={handleSalvar} className="space-y-4 text-left">
            <Input label="Nova senha" type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} required autoFocus />
            <Input label="Confirmar nova senha" type="password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} required />
            <Button type="submit" loading={salvando} className="w-full">Salvar nova senha</Button>
          </form>
        )}
      </div>
    </div>
  )
}
