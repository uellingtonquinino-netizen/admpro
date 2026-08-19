// NOVO: esta tela não existia em nenhuma parte da conversa original.
// Sem ela, era impossível usar o app pela primeira vez — o login exige um
// usuário, que exige uma empresa, e não havia nenhuma forma de criar a
// primeira empresa/usuário admin. Cria os dois em sequência e já loga.
import { useState }      from 'react'
import { useNavigate }   from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { toast }         from '@components/ui/ToastContainer'
import Button             from '@components/ui/Button'
import Input               from '@components/ui/Input'
import Card                from '@components/ui/Card'

export default function Setup() {
  const navigate = useNavigate()
  const login     = useAuthStore(s => s.login)

  const [empresa, setEmpresaForm] = useState({ nome: '', cnpj: '', email: '', telefone: '', endereco: '' })
  const [admin,   setAdminForm]   = useState({ nome: '', email: '', senha: '', senhaConfirma: '' })
  const [loading, setLoading]     = useState(false)

  function setEmpresaField<K extends keyof typeof empresa>(key: K, val: string) {
    setEmpresaForm(prev => ({ ...prev, [key]: val }))
  }
  function setAdminField<K extends keyof typeof admin>(key: K, val: string) {
    setAdminForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!empresa.nome.trim())  return toast.error('Informe o nome da empresa/obra.')
    if (!admin.nome.trim())    return toast.error('Informe seu nome.')
    if (admin.senha.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.')
    if (admin.senha !== admin.senhaConfirma) return toast.error('As senhas não conferem.')

    setLoading(true)
    try {
      const novaEmpresa = await window.api.empresas.criar(empresa)
      await window.api.usuarios.criar({
        empresa_id: novaEmpresa.id,
        nome:       admin.nome,
        email:      admin.email,
        senha:      admin.senha,
        perfil:     'admin',
      })
      await login(admin.email, admin.senha)
      toast.success('Tudo pronto! Bem-vindo(a) ao ADM OBRA.')
      navigate('/inicio')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao concluir o cadastro inicial.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-5">
        <div className="text-center mb-2">
          <h1 className="text-xl font-bold">Bem-vindo(a) ao ADM OBRA</h1>
          <p className="text-sm text-gray-400 mt-1">
            Vamos configurar sua empresa/obra e seu usuário administrador.
          </p>
        </div>

        <Card>
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Dados da empresa / obra</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome da empresa/obra" value={empresa.nome}
                   onChange={e => setEmpresaField('nome', e.target.value)}
                   className="md:col-span-2" required />
            <Input label="CNPJ" value={empresa.cnpj}
                   onChange={e => setEmpresaField('cnpj', e.target.value)}
                   placeholder="00.000.000/0000-00" />
            <Input label="E-mail" type="email" value={empresa.email}
                   onChange={e => setEmpresaField('email', e.target.value)} />
            <Input label="Telefone" value={empresa.telefone}
                   onChange={e => setEmpresaField('telefone', e.target.value)}
                   placeholder="(00) 00000-0000" />
            <Input label="Endereço" value={empresa.endereco}
                   onChange={e => setEmpresaField('endereco', e.target.value)} />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Seu usuário (administrador)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Seu nome" value={admin.nome}
                   onChange={e => setAdminField('nome', e.target.value)}
                   className="md:col-span-2" required />
            <Input label="E-mail de login" type="email" value={admin.email}
                   onChange={e => setAdminField('email', e.target.value)}
                   className="md:col-span-2" required />
            <Input label="Senha" type="password" value={admin.senha}
                   onChange={e => setAdminField('senha', e.target.value)} required />
            <Input label="Confirmar senha" type="password" value={admin.senhaConfirma}
                   onChange={e => setAdminField('senhaConfirma', e.target.value)} required />
          </div>
        </Card>

        <Button type="submit" loading={loading} className="w-full">
          Concluir e entrar
        </Button>
      </form>
    </div>
  )
}
