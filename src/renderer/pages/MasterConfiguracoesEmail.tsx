import { useEffect, useState } from 'react'
import { toast } from '@components/ui/ToastContainer'
import Button from '@components/ui/Button'
import Input from '@components/ui/Input'
import { Mail, Send, Save } from 'lucide-react'

interface ConfigEmail {
  smtp_host:       string | null
  smtp_porta:      number | null
  smtp_usuario:    string | null
  smtp_senha:      string | null
  smtp_seguro:     number
  remetente_nome:  string | null
  remetente_email: string | null
}

// NOVO: configuração do servidor SMTP que manda o código de
// recuperação de senha (Login → Esqueci minha senha) e o e-mail de
// troca de e-mail. Só o Administrador Master mexe aqui — é uma
// configuração do sistema inteiro, não de uma obra específica.
export default function MasterConfiguracoesEmail() {
  const [carregado, setCarregado] = useState(false)
  const [host, setHost] = useState('')
  const [porta, setPorta] = useState('587')
  const [usuarioSmtp, setUsuarioSmtp] = useState('')
  const [senhaSmtp, setSenhaSmtp] = useState('')
  const [seguro, setSeguro] = useState(true)
  const [remetenteNome, setRemetenteNome] = useState('ADM PRO')
  const [remetenteEmail, setRemetenteEmail] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [destinoTeste, setDestinoTeste] = useState('')
  const [testando, setTestando] = useState(false)

  useEffect(() => {
    window.api.configuracoesEmail.buscar().then((c: ConfigEmail | null) => {
      if (c) {
        setHost(c.smtp_host ?? '')
        setPorta(String(c.smtp_porta ?? 587))
        setUsuarioSmtp(c.smtp_usuario ?? '')
        setSenhaSmtp(c.smtp_senha ?? '')
        setSeguro(!!c.smtp_seguro)
        setRemetenteNome(c.remetente_nome ?? 'ADM PRO')
        setRemetenteEmail(c.remetente_email ?? '')
      }
      setCarregado(true)
    })
  }, [])

  async function handleSalvar() {
    if (!host.trim() || !usuarioSmtp.trim() || !senhaSmtp.trim()) {
      toast.error('Preencha pelo menos o servidor, o usuário e a senha.')
      return
    }
    setSalvando(true)
    try {
      await window.api.configuracoesEmail.salvar({
        smtp_host: host.trim(), smtp_porta: Number(porta) || 587,
        smtp_usuario: usuarioSmtp.trim(), smtp_senha: senhaSmtp,
        smtp_seguro: seguro, remetente_nome: remetenteNome.trim(),
        remetente_email: remetenteEmail.trim() || usuarioSmtp.trim(),
      })
      toast.success('Configuração de e-mail salva.')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleTestar() {
    if (!destinoTeste.trim()) { toast.error('Informe um e-mail pra receber o teste.'); return }
    setTestando(true)
    try {
      const resultado = await window.api.configuracoesEmail.testarEnvio(destinoTeste.trim())
      if (resultado.ok) toast.success('E-mail de teste enviado — confira a caixa de entrada.')
      else toast.error(resultado.erro || 'Erro ao enviar o teste.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o teste.')
    } finally {
      setTestando(false)
    }
  }

  if (!carregado) return <div className="max-w-2xl mx-auto h-64 shimmer rounded-2xl" />

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={20} className="text-brand-400" />
        <h1 className="text-xl font-bold text-white">Configuração de E-mail</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Servidor usado pra mandar o código de recuperação de senha e avisos de troca de e-mail — vale pra todo o sistema.
      </p>

      <div className="bg-surface border border-surface-border rounded-2xl p-5 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="Servidor SMTP" value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.gmail.com" className="md:col-span-2" />
          <Input label="Porta" value={porta} onChange={e => setPorta(e.target.value)} placeholder="587" />
        </div>
        <Input label="Usuário / e-mail de envio" value={usuarioSmtp} onChange={e => setUsuarioSmtp(e.target.value)} placeholder="sistema@elitesengenharia.com.br" />
        <Input label="Senha (ou senha de app)" type="password" value={senhaSmtp} onChange={e => setSenhaSmtp(e.target.value)} />
        <p className="text-xs text-gray-500">
          O tipo de conexão segura é decidido automaticamente pela porta — 465 usa SSL direto, qualquer outra
          (587, a mais comum, inclusive no Gmail) usa STARTTLS. Não precisa escolher nada aqui.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Nome do remetente" value={remetenteNome} onChange={e => setRemetenteNome(e.target.value)} />
          <Input label="E-mail do remetente (se diferente do usuário)" value={remetenteEmail} onChange={e => setRemetenteEmail(e.target.value)} />
        </div>
        <Button icon={<Save size={14} />} onClick={handleSalvar} loading={salvando}>
          Salvar configuração
        </Button>
      </div>

      <div className="bg-surface border border-surface-border rounded-2xl p-5">
        <p className="text-sm font-semibold text-white mb-1">Testar envio</p>
        <p className="text-xs text-gray-500 mb-3">Manda um e-mail de teste, pra conferir se a configuração está certa antes de depender dela.</p>
        <div className="flex gap-2">
          <div className="flex-1"><Input label="" value={destinoTeste} onChange={e => setDestinoTeste(e.target.value)} placeholder="seuemail@exemplo.com" /></div>
          <Button icon={<Send size={14} />} variant="outline" onClick={handleTestar} loading={testando}>
            Enviar teste
          </Button>
        </div>
      </div>
    </div>
  )
}
