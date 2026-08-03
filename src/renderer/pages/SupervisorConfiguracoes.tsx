import { useState } from 'react'
import { useAuthStore } from '@store/auth.store'
import { toast } from '@components/ui/ToastContainer'
import Button from '@components/ui/Button'
import Input from '@components/ui/Input'
import {
  Settings, ShieldCheck, KeyRound, Mail, ChevronRight, ArrowLeft, Lock, Stamp, Upload, Trash2,
} from 'lucide-react'

type View = 'menu' | 'seguranca' | 'carimbo'

// ALTERADO: essa página de Configurações deixou de ser só do
// Supervisor — o mesmo componente agora é usado também por ADM e
// Gestor (o conteúdo não depende do perfil, só do usuário logado).
// NOVO: categoria "Carimbo de Assinatura" — a imagem que o usuário
// sobe aqui substitui o carimbo de texto gerado pelo sistema ao
// autorizar AP's; ao carimbar, só a data/hora aparecem embaixo da
// imagem.
export default function SupervisorConfiguracoes() {
  const usuario = useAuthStore(s => s.usuario)
  const atualizarUsuario = useAuthStore(s => s.atualizarUsuario)
  const [view, setView] = useState<View>('menu')

  // ── Trocar Senha ──────────────────────────────────────
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaNovaConfirma, setSenhaNovaConfirma] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  async function handleTrocarSenha() {
    if (!usuario) return
    if (senhaNova.length < 6) { toast.error('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    if (senhaNova !== senhaNovaConfirma) { toast.error('A confirmação não bate com a nova senha.'); return }

    setSalvandoSenha(true)
    try {
      await window.api.usuarios.alterarSenha({ id: usuario.id, senha_atual: senhaAtual, senha_nova: senhaNova })
      toast.success('Senha alterada.')
      setSenhaAtual(''); setSenhaNova(''); setSenhaNovaConfirma('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao trocar a senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  // ── E-mail ────────────────────────────────────────────
  const [senhaParaEmail, setSenhaParaEmail] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [salvandoEmail, setSalvandoEmail] = useState(false)

  async function handleTrocarEmail() {
    if (!usuario) return
    if (!novoEmail.trim() || !novoEmail.includes('@')) { toast.error('Informe um e-mail válido.'); return }

    setSalvandoEmail(true)
    try {
      await window.api.usuarios.alterarEmail({ id: usuario.id, senha_atual: senhaParaEmail, novo_email: novoEmail.trim() })
      toast.success('E-mail alterado. Use o novo e-mail no próximo login.')
      setSenhaParaEmail(''); setNovoEmail('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao trocar o e-mail.')
    } finally {
      setSalvandoEmail(false)
    }
  }

  // ── Carimbo de Assinatura ──────────────────────────────
  const [carimboUrl, setCarimboUrl] = useState(usuario?.carimbo_url ?? '')
  const [salvandoCarimbo, setSalvandoCarimbo] = useState(false)

  function handleArquivoCarimbo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const leitor = new FileReader()
    leitor.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 400
        const escala = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = img.width  * escala
        canvas.height = img.height * escala
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        setCarimboUrl(canvas.toDataURL('image/png'))
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSalvarCarimbo() {
    if (!usuario) return
    setSalvandoCarimbo(true)
    try {
      await window.api.usuarios.atualizarCarimbo({ id: usuario.id, carimbo_url: carimboUrl || null })
      atualizarUsuario({ carimbo_url: carimboUrl || null })
      toast.success('Carimbo salvo.')
    } catch {
      toast.error('Erro ao salvar o carimbo.')
    } finally {
      setSalvandoCarimbo(false)
    }
  }

  if (view === 'menu') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={20} className="text-brand-400" />
          <h1 className="text-xl font-bold text-white">Configurações</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">Ajustes da sua conta e do sistema.</p>

        <div className="space-y-3">
          <button
            onClick={() => setView('seguranca')}
            className="w-full flex items-center gap-4 bg-surface border border-surface-border rounded-2xl p-5
                       hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Segurança</p>
              <p className="text-xs text-gray-500 mt-0.5">Senha e login</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>

          <button
            onClick={() => setView('carimbo')}
            className="w-full flex items-center gap-4 bg-surface border border-surface-border rounded-2xl p-5
                       hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Stamp size={20} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Carimbo de Assinatura</p>
              <p className="text-xs text-gray-500 mt-0.5">Imagem usada ao autorizar documentos</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>
      </div>
    )
  }

  if (view === 'carimbo') {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setView('menu')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Voltar
        </button>

        <div className="flex items-center gap-2 mb-1">
          <Stamp size={20} className="text-brand-400" />
          <h1 className="text-xl font-bold text-white">Carimbo de Assinatura</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Essa imagem substitui o carimbo de texto ao autorizar AP's — só a data e a hora aparecem
          embaixo dela no documento. Prefira uma imagem com fundo transparente (PNG).
        </p>

        <div className="bg-surface border border-surface-border rounded-2xl p-5">
          <div className="flex items-center gap-4 mb-4">
            {carimboUrl ? (
              <img src={carimboUrl} alt="Carimbo" className="h-20 w-40 object-contain rounded-lg bg-surface-hover p-2" />
            ) : (
              <div className="h-20 w-40 rounded-lg bg-surface-hover flex items-center justify-center text-gray-600 text-xs text-center px-2">
                Nenhum carimbo cadastrado
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input type="file" accept="image/*" onChange={handleArquivoCarimbo} className="hidden" id="input-carimbo-usuario" />
            <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => document.getElementById('input-carimbo-usuario')?.click()}>
              {carimboUrl ? 'Trocar carimbo' : 'Enviar carimbo'}
            </Button>
            {carimboUrl && (
              <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setCarimboUrl('')}>
                Remover
              </Button>
            )}
          </div>
          <div className="mt-5 pt-4 border-t border-surface-border">
            <Button icon={<Stamp size={14} />} onClick={handleSalvarCarimbo} loading={salvandoCarimbo}>
              Salvar carimbo
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // view === 'seguranca'
  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => setView('menu')}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-brand-400" />
        <h1 className="text-xl font-bold text-white">Segurança</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">Senha e Login</p>

      {/* Trocar Senha */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
            <KeyRound size={15} className="text-brand-400" />
          </div>
          <p className="text-sm font-semibold text-white">Trocar Senha</p>
        </div>
        <div className="space-y-3">
          <Input label="Senha atual" type="password" value={senhaAtual} onChange={e => setSenhaAtual(e.target.value)} />
          <Input label="Nova senha" type="password" value={senhaNova} onChange={e => setSenhaNova(e.target.value)} />
          <Input label="Confirmar nova senha" type="password" value={senhaNovaConfirma} onChange={e => setSenhaNovaConfirma(e.target.value)} />
          <Button icon={<KeyRound size={14} />} onClick={handleTrocarSenha} loading={salvandoSenha}>
            Salvar nova senha
          </Button>
        </div>
      </div>

      {/* E-mail */}
      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
            <Mail size={15} className="text-brand-400" />
          </div>
          <p className="text-sm font-semibold text-white">E-mail</p>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Atual: <span className="text-gray-300">{usuario?.email}</span> — é também o e-mail usado pra entrar no sistema.
        </p>
        <div className="space-y-3">
          <Input label="Novo e-mail" type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} />
          <Input label="Confirme sua senha" type="password" value={senhaParaEmail} onChange={e => setSenhaParaEmail(e.target.value)} />
          <Button icon={<Lock size={14} />} onClick={handleTrocarEmail} loading={salvandoEmail} variant="outline">
            Salvar novo e-mail
          </Button>
        </div>
      </div>
    </div>
  )
}
