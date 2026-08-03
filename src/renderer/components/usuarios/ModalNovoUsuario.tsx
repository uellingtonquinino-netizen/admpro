import { useState, useEffect } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { toast }           from '@components/ui/ToastContainer'
import Modal               from '@components/ui/Modal'
import Input               from '@components/ui/Input'
import Button               from '@components/ui/Button'
import Select               from '@components/ui/Select'
import { PERMISSOES_SISTEMA } from '../../utils/permissoes'

interface Props {
  onClose:   () => void
  onSuccess: () => void
  obraFixa?: number
  perfilPadrao?: Form['perfil']
}

interface Form {
  nome:   string
  email:  string
  senha:  string
  perfil: 'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'
}

interface Empresa { id: number; nome: string }

const EMPTY: Form = {
  nome:   '',
  email:  '',
  senha:  '',
  perfil: 'gestor',
}

const PERFIS = [
  { value: 'admin',      label: 'ADM'           },
  { value: 'gestor',     label: 'GESTOR'        },
  { value: 'almoxarife', label: 'ALMOXARIFADO'  },
  { value: 'supervisor', label: 'SUPERVISOR'    },
  { value: 'central',    label: 'ESCRITÓRIO CENTRAL' },
  { value: 'master',     label: 'ADMINISTRADOR MASTER' },
  { value: 'setor_pessoal', label: 'SETOR PESSOAL' },
]

// Mesma lista de exceções pontuais do modal de editar — pode já
// vir marcada na criação do usuário.

export default function ModalNovoUsuario({ onClose, onSuccess, obraFixa, perfilPadrao }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const usuarioLogado = useAuthStore(s => s.usuario)
  const ehMaster = usuarioLogado?.perfil === 'master'

  const [form,    setForm]    = useState<Form>(perfilPadrao ? { ...EMPTY, perfil: perfilPadrao } : EMPTY)
  const [extras, setExtras]   = useState<string[]>([])
  const [negadas, setNegadas] = useState<string[]>([])
  const [obras, setObras]     = useState<Empresa[]>([])
  const [obrasSelecionadas, setObrasSelecionadas] = useState<number[]>([])
  const [obraDestino, setObraDestino] = useState<number | null>(obraFixa ?? null)
  const [errors,  setErrors]  = useState<Partial<Form>>({})
  const [loading, setLoading] = useState(false)

  // NOVO: em vez de sempre criar um cadastro novo, dá pra vincular um
  // Supervisor que já existe a mais essa obra — evita duplicar quem
  // já acompanha várias obras.
  const [usarExistente, setUsarExistente] = useState(false)
  const [supervisorSelecionadoId, setSupervisorSelecionadoId] = useState<number | null>(null)
  const [supervisoresExistentes, setSupervisoresExistentes] = useState<{ id: number; nome: string }[]>([])

  useEffect(() => {
    window.api.empresas.listar().then((lista: Empresa[]) => {
      setObras(lista)
      // NOVO: o Master não tem uma obra fixa — precisa escolher pra
      // qual obra o usuário novo vai. Já vem com a primeira marcada
      // (ou a obra passada como fixa, se veio de dentro dela), pra
      // não ficar vazio.
      if (ehMaster && !obraFixa && lista.length > 0) setObraDestino(lista[0].id)
    })
    window.api.master.supervisores().then((lista: any[]) => {
      setSupervisoresExistentes(lista.map(s => ({ id: s.id, nome: s.nome })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof Form>(key: K, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  // ALTERADO: Acessos extras agora mexe em duas listas — "extras"
  // (marcar uma página que o perfil NÃO dá por padrão) e "negadas"
  // (desmarcar uma que o perfil JÁ dá por padrão). Qual das duas usar
  // depende só de a página já pertencer ao perfil escolhido ou não.
  function alternarPermissao(chave: string, ehPadrao: boolean) {
    if (ehPadrao) {
      setNegadas(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])
    } else {
      setExtras(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])
    }
  }

  function alternarObra(id: number) {
    setObrasSelecionadas(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id])
  }

  function validate(): boolean {
    if (usarExistente) return true
    const e: Partial<Form> = {}
    if (!form.nome.trim())               e.nome  = 'Obrigatório'
    if (!form.email.includes('@'))       e.email = 'E-mail inválido'
    if (form.senha.length < 6)           e.senha = 'Mínimo 6 caracteres'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSalvar() {
    if (!validate()) return
    const empresaAlvo = ehMaster ? obraDestino : empresaId
    if (!empresaAlvo) {
      toast.error(ehMaster ? 'Escolha pra qual obra esse usuário vai.' : 'Nenhuma obra ativa.')
      return
    }

    // NOVO: vincular um Supervisor já existente a essa obra, em vez
    // de criar um cadastro novo — soma essa obra às que ele já
    // acompanha, sem apagar as outras.
    if (usarExistente) {
      if (!supervisorSelecionadoId) { toast.error('Escolha um supervisor.'); return }
      setLoading(true)
      try {
        const completo = await window.api.usuarios.buscarPorId(supervisorSelecionadoId)
        const obrasAtuais: number[] = completo?.obras_supervisor ?? []
        const novasObras = obrasAtuais.includes(empresaAlvo) ? obrasAtuais : [...obrasAtuais, empresaAlvo]
        await window.api.usuarios.definirObrasSupervisor({ usuario_id: supervisorSelecionadoId, empresa_ids: novasObras })
        toast.success('Supervisor vinculado a essa obra.')
        onSuccess()
      } catch {
        toast.error('Erro ao vincular o supervisor.')
      } finally {
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const { id } = await window.api.usuarios.criar({
        empresa_id: empresaAlvo,
        nome:       form.nome,
        email:      form.email,
        senha:      form.senha,
        perfil:     form.perfil,
      })
      if (extras.length > 0 || negadas.length > 0) {
        await window.api.usuarios.definirPermissoesExtras({ usuario_id: id, extras, negadas })
      }
      if (form.perfil === 'supervisor' && obrasSelecionadas.length > 0) {
        await window.api.usuarios.definirObrasSupervisor({ usuario_id: id, empresa_ids: obrasSelecionadas })
      }
      toast.success('Usuário criado com sucesso.')
      onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar usuário.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title="Novo usuário" onClose={onClose}>
      <div className="space-y-4">
        <Select
          label="Perfil de acesso"
          value={form.perfil}
          onChange={e => { set('perfil', e.target.value); setUsarExistente(false) }}
          options={PERFIS}
        />

        {/* NOVO: em vez de criar um cadastro novo, dá pra vincular um
            Supervisor que já existe a mais essa obra — evita duplicar
            quem já acompanha várias obras. */}
        {form.perfil === 'supervisor' && (
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={usarExistente}
              onChange={e => setUsarExistente(e.target.checked)}
              className="accent-brand-500"
            />
            Vincular um Supervisor que já existe (em vez de criar um novo)
          </label>
        )}

        {usarExistente ? (
          <Select
            label="Supervisor"
            value={supervisorSelecionadoId ?? ''}
            onChange={e => setSupervisorSelecionadoId(Number(e.target.value))}
            options={supervisoresExistentes.map(s => ({ value: s.id, label: s.nome }))}
          />
        ) : (
          <>
            <Input
              label="Nome completo"
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              error={errors.nome}
            />
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              error={errors.email}
            />
            <Input
              label="Senha inicial"
              type="password"
              value={form.senha}
              onChange={e => set('senha', e.target.value)}
              error={errors.senha}
            />
          </>
        )}

        {/* NOVO: só aparece pro Master — ele não tem obra fixa, então
            precisa escolher pra qual obra esse usuário vai. */}
        {ehMaster && !obraFixa && (
          <Select
            label="Obra"
            value={obraDestino ?? ''}
            onChange={e => setObraDestino(Number(e.target.value))}
            options={obras.map(o => ({ value: o.id, label: o.nome }))}
          />
        )}

        {/* Descrição dos perfis */}
        <div className="text-xs text-gray-500 space-y-1
                        bg-surface-hover rounded-lg p-3">
          <p><strong className="text-gray-400">ADM</strong> — acesso total,
             inclusive RH, Financeiro, Almoxarifado, usuários e configurações.</p>
          <p><strong className="text-gray-400">GESTOR</strong> — vê o Início,
             Autorização de Pagamento e Notas Fiscais; só pesquisa e imprime,
             sem criar/editar/excluir.</p>
          <p><strong className="text-gray-400">ALMOXARIFADO</strong> — acesso
             total ao módulo Almoxarifado, e a mais nada.</p>
          <p><strong className="text-gray-400">SUPERVISOR</strong> — acompanha
             várias obras, aprova os lotes de AP's e Notas Fiscais que cada
             obra enviar.</p>
          <p><strong className="text-gray-400">ESCRITÓRIO CENTRAL</strong> — acompanha
             todos os Supervisores e todas as obras da empresa, dando a
             aprovação final sobre o que cada Supervisor já autorizou.</p>
          <p><strong className="text-gray-400">ADMINISTRADOR MASTER</strong> — autoridade
             total sobre o sistema inteiro: cadastra qualquer usuário, entra em
             qualquer obra, vê tudo — mas não participa da aprovação de AP's
             e Notas Fiscais.</p>
          <p><strong className="text-gray-400">SETOR PESSOAL</strong> — recebe as
             admissões, desligamentos, alterações salariais e outras movimentações
             enviadas por qualquer obra, processa no DP e devolve os documentos
             prontos pro ADM imprimir e arquivar.</p>
        </div>

        {/* Só aparece pra perfil Supervisor — quais obras acompanha */}
        {form.perfil === 'supervisor' && (
          <div>
            <p className="text-sm text-gray-200 mb-1">Obras que acompanha</p>
            <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-lg bg-surface-hover">
              {obras.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 py-1">Nenhuma obra cadastrada ainda.</p>
              ) : obras.map(o => (
                <label key={o.id} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obrasSelecionadas.includes(o.id)}
                    onChange={() => alternarObra(o.id)}
                    className="accent-brand-500"
                  />
                  {o.nome}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ALTERADO: mostra TODAS as funções do sistema — as que já são
            do perfil escolhido vêm pré-marcadas; desmarcar uma dessas
            tira ela desse usuário específico (mesmo sendo do perfil),
            e marcar uma que não é do perfil libera ela a mais. Só faz
            sentido pros perfis de obra (ADM/GESTOR/ALMOXARIFADO) —
            Supervisor/Central/Master/Setor Pessoal têm painel próprio,
            sem essas páginas. */}
        {(form.perfil === 'admin' || form.perfil === 'gestor' || form.perfil === 'almoxarife') && (
          <div>
            <p className="text-sm text-gray-200 mb-1">Acessos extras</p>
            <p className="text-xs text-gray-500 mb-2">
              Já vem marcado o que o perfil "{PERFIS.find(p => p.value === form.perfil)?.label}" dá por padrão —
              desmarque pra tirar algo desse usuário específico, ou marque mais pra liberar além do perfil.
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1 p-2 rounded-lg bg-surface-hover">
              {PERMISSOES_SISTEMA.map(p => {
                const ehPadrao = p.perfisPadrao.includes(form.perfil as 'admin' | 'gestor' | 'almoxarife')
                const marcado  = ehPadrao ? !negadas.includes(p.chave) : extras.includes(p.chave)
                return (
                  <label key={p.chave} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarPermissao(p.chave, ehPadrao)}
                      className="accent-brand-500"
                    />
                    {p.label}
                    {ehPadrao && <span className="text-[10px] text-gray-500 uppercase tracking-wide ml-auto">Padrão</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSalvar} loading={loading}>
          Criar usuário
        </Button>
      </div>
    </Modal>
  )
}
