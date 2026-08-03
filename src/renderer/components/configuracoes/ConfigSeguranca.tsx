import { useState }        from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { toast }           from '@components/ui/ToastContainer'
import Button              from '@components/ui/Button'
import Input               from '@components/ui/Input'
import Card                from '@components/ui/Card'
import { ShieldCheck }     from 'lucide-react'

interface SenhaForm {
  atual:        string
  nova:         string
  confirmacao:  string
}

const EMPTY: SenhaForm = { atual: '', nova: '', confirmacao: '' }

export default function ConfigSeguranca() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const usuarioId = useAuthStore(s => s.usuario?.id)

  const [form,    setForm]    = useState<SenhaForm>(EMPTY)
  const [errors,  setErrors]  = useState<Partial<SenhaForm>>({})
  const [loading, setLoading] = useState(false)

  function set<K extends keyof SenhaForm>(key: K, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<SenhaForm> = {}
    if (!form.atual)                        e.atual       = 'Obrigatório'
    if (form.nova.length < 6)               e.nova        = 'Mínimo 6 caracteres'
    if (form.nova !== form.confirmacao)      e.confirmacao = 'Senhas não conferem'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleAlterarSenha() {
    if (!validate() || !usuarioId || !empresaId) return
    setLoading(true)
    try {
      await window.api.usuarios.alterarSenha({
        id:           usuarioId,
        senha_atual:  form.atual,
        senha_nova:   form.nova,
      })
      toast.success('Senha alterada com sucesso.')
      setForm(EMPTY)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao alterar senha.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Alterar senha */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-gray-200">
            Alterar senha
          </h2>
        </div>

        <div className="space-y-4 max-w-sm">
          <Input
            label="Senha atual"
            type="password"
            value={form.atual}
            onChange={e => set('atual', e.target.value)}
            error={errors.atual}
          />
          <Input
            label="Nova senha"
            type="password"
            value={form.nova}
            onChange={e => set('nova', e.target.value)}
            error={errors.nova}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={form.confirmacao}
            onChange={e => set('confirmacao', e.target.value)}
            error={errors.confirmacao}
          />
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={handleAlterarSenha} loading={loading}>
            Alterar senha
          </Button>
        </div>
      </Card>

      {/* Sessão */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-200 mb-3">
          Sessão ativa
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Encerre a sessão atual em todos os dispositivos.
        </p>
        <Button
          variant="danger"
          onClick={() => useAuthStore.getState().logout()}
        >
          Encerrar sessão
        </Button>
      </Card>
    </div>
  )
}
