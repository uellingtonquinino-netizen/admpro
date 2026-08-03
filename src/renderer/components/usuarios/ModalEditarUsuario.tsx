import { useState, useEffect }  from 'react'
import { toast }     from '@components/ui/ToastContainer'
import Modal         from '@components/ui/Modal'
import Input         from '@components/ui/Input'
import Button        from '@components/ui/Button'
import Select        from '@components/ui/Select'
import { Usuario }   from '@pages/Usuarios'
import { PERMISSOES_SISTEMA } from '../../utils/permissoes'

interface Props {
  usuario:   Usuario
  onClose:   () => void
  onSuccess: () => void
}

interface Form {
  nome:   string
  perfil: 'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'
  ativo:  boolean
}

interface Empresa { id: number; nome: string }

const PERFIS = [
  { value: 'admin',      label: 'ADM'          },
  { value: 'gestor',     label: 'GESTOR'       },
  { value: 'almoxarife', label: 'ALMOXARIFADO' },
  { value: 'supervisor', label: 'SUPERVISOR'   },
  { value: 'central',    label: 'ESCRITÓRIO CENTRAL' },
  { value: 'master',     label: 'ADMINISTRADOR MASTER' },
  { value: 'setor_pessoal', label: 'SETOR PESSOAL' },
]

// NOVO: páginas que podem ser liberadas como exceção pontual, além do
// que o perfil do usuário já dá (Opção A: perfis + exceções por
// usuário). Não inclui Usuários/Configurações — essas continuam só
// pra ADM, sem exceção.

export default function ModalEditarUsuario({ usuario, onClose, onSuccess }: Props) {
  const [form, setForm] = useState<Form>({
    nome:   usuario.nome,
    perfil: usuario.perfil,
    ativo:  usuario.ativo,
  })
  const [extras, setExtras] = useState<string[]>(usuario.permissoes_extras ?? [])
  const [negadas, setNegadas] = useState<string[]>(usuario.permissoes_negadas ?? [])
  const [obras, setObras]   = useState<Empresa[]>([])
  const [obrasSelecionadas, setObrasSelecionadas] = useState<number[]>(usuario.obras_supervisor ?? [])
  const [obrasExtrasSelecionadas, setObrasExtrasSelecionadas] = useState<number[]>(usuario.obras_extras ?? [])
  const [errors,  setErrors]  = useState<Partial<Record<keyof Form, string>>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.empresas.listar().then(setObras)
  }, [])

  function set<K extends keyof Form>(key: K, val: Form[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  // ALTERADO: mesma lógica do modal de criar — desmarcar uma página
  // que já é do perfil manda ela pra "negadas"; marcar uma que não é
  // do perfil manda ela pra "extras".
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

  function alternarObraExtra(id: number) {
    setObrasExtrasSelecionadas(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id])
  }

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {}
    if (!form.nome.trim()) e.nome = 'Obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSalvar() {
    if (!validate()) return
    setLoading(true)
    try {
      await window.api.usuarios.atualizar({
        id:     usuario.id,
        nome:   form.nome,
        perfil: form.perfil,
        ativo:  form.ativo,
      })
      await window.api.usuarios.definirPermissoesExtras({
        usuario_id: usuario.id,
        extras,
        negadas,
      })
      if (form.perfil === 'supervisor') {
        await window.api.usuarios.definirObrasSupervisor({
          usuario_id: usuario.id,
          empresa_ids: obrasSelecionadas,
        })
      } else if (['admin', 'gestor', 'almoxarife'].includes(form.perfil)) {
        await window.api.usuarios.definirObras({
          usuario_id: usuario.id,
          empresa_ids: obrasExtrasSelecionadas,
        })
      }
      toast.success('Usuário atualizado.')
      onSuccess()
    } catch {
      toast.error('Erro ao atualizar usuário.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title="Editar usuário" onClose={onClose}>
      <div className="space-y-4">
        <Input
          label="Nome completo"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          error={errors.nome}
        />

        <Select
          label="Perfil de acesso"
          value={form.perfil}
          onChange={e =>
            set('perfil', e.target.value as Form['perfil'])
          }
          options={PERFIS}
        />

        {/* NOVO: só aparece pra perfil Supervisor — quais obras ele acompanha */}
        {form.perfil === 'supervisor' && (
          <div>
            <p className="text-sm text-gray-200 mb-1">Obras que acompanha</p>
            <p className="text-xs text-gray-500 mb-2">
              O Supervisor só vê os dados das obras marcadas aqui.
            </p>
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

        {/* NOVO: ADM, Gestor e Almoxarife também podem administrar
            mais de uma obra agora. Sem marcar nada aqui, continua
            preso só à obra "dona" do cadastro dele, como sempre. */}
        {['admin', 'gestor', 'almoxarife'].includes(form.perfil) && (
          <div>
            <p className="text-sm text-gray-200 mb-1">Obras que administra</p>
            <p className="text-xs text-gray-500 mb-2">
              Marque mais de uma se essa pessoa administra várias obras. Sem marcar nenhuma, continua só na obra do cadastro dele.
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1 p-2 rounded-lg bg-surface-hover">
              {obras.length === 0 ? (
                <p className="text-xs text-gray-500 px-1 py-1">Nenhuma obra cadastrada ainda.</p>
              ) : obras.map(o => (
                <label key={o.id} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obrasExtrasSelecionadas.includes(o.id)}
                    onChange={() => alternarObraExtra(o.id)}
                    className="accent-brand-500"
                  />
                  {o.nome}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Toggle ativo */}
        <div className="flex items-center justify-between
                        p-3 rounded-lg bg-surface-hover">
          <div>
            <p className="text-sm text-gray-200">Conta ativa</p>
            <p className="text-xs text-gray-500">
              Usuários inativos não conseguem fazer login.
            </p>
          </div>
          <button
            onClick={() => set('ativo', !form.ativo)}
            className={`relative w-10 h-5 rounded-full transition-colors
                        ${form.ativo ? 'bg-brand-500' : 'bg-surface-border'}`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white
                          shadow transition-transform
                          ${form.ativo ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {/* E-mail (somente leitura) */}
        <Input
          label="E-mail"
          value={usuario.email}
          disabled
          hint="O e-mail não pode ser alterado."
        />

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
          Salvar alterações
        </Button>
      </div>
    </Modal>
  )
}
