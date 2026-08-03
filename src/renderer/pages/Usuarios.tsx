import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore }                   from '@store/empresa.store'
import { useAuthStore }                      from '@store/auth.store'
import { toast }                             from '@components/ui/ToastContainer'
import PageHeader                            from '@components/layout/PageHeader'
import Button                                from '@components/ui/Button'
import Badge                                 from '@components/ui/Badge'
import ModalNovoUsuario                      from '@components/usuarios/ModalNovoUsuario'
import ModalEditarUsuario                    from '@components/usuarios/ModalEditarUsuario'
import ConfirmDialog                         from '@components/ui/ConfirmDialog'
import { SkeletonTable }                     from '@components/ui/Skeleton'
import { UserPlus, Pencil, Trash2 }          from 'lucide-react'
import { clsx }                              from 'clsx'

export interface Usuario {
  id:            number
  nome:          string
  email:         string
  perfil:        'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master'
  ativo:         boolean
  created_at:    string
  last_login_at: string | null
  permissoes_extras: string[]
  permissoes_negadas: string[]
  obras_supervisor: number[]
  obras_extras: number[]
}

const PERFIL_LABEL = {
  admin:      'ADM',
  gestor:     'GESTOR',
  almoxarife: 'ALMOXARIFADO',
  supervisor: 'SUPERVISOR',
  central:    'ESCRITÓRIO CENTRAL',
  master:     'ADMINISTRADOR MASTER',
}

const PERFIL_COLOR = {
  admin:      'blue',
  gestor:     'green',
  almoxarife: 'gray',
  supervisor: 'purple',
  central:    'red',
  master:     'yellow',
} as const

export default function Usuarios() {
  const empresaId    = useEmpresaStore(s => s.empresaId)
  const usuarioLogado = useAuthStore(s => s.usuario)

  const [usuarios,  setUsuarios]  = useState<Usuario[]>([])
  const [loading,   setLoading]   = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [editando,  setEditando]  = useState<Usuario | null>(null)
  const [removendo, setRemovendo] = useState<Usuario | null>(null)

  // ── Buscar ────────────────────────────────────────────
  const fetchUsuarios = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const data = await window.api.usuarios.listar(empresaId)
      setUsuarios(data as Usuario[])
    } catch {
      toast.error('Erro ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  useEffect(() => { fetchUsuarios() }, [fetchUsuarios])

  // ── Remover ───────────────────────────────────────────
  async function handleRemover() {
    if (!removendo) return
    try {
      await window.api.usuarios.remover({ id: removendo.id, usuarioLogadoId: usuarioLogado?.id })
      toast.success('Usuário removido.')
      setRemovendo(null)
      fetchUsuarios()
    } catch {
      toast.error('Erro ao remover usuário.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle="Gerencie quem tem acesso a esta empresa"
      >
        {(usuarioLogado?.perfil === 'admin' || usuarioLogado?.perfil === 'master') && (
          <Button
            icon={<UserPlus size={14} />}
            onClick={() => setModalNovo(true)}
          >
            Novo usuário
          </Button>
        )}
      </PageHeader>

      {/* Tabela */}
      <div className="bg-surface border border-surface-border
                      rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              {['Nome', 'E-mail', 'Perfil', 'Status',
                'Último acesso', ''].map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs
                             font-medium text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading
              ? <SkeletonTable rows={4} cols={6} />
              : usuarios.map(u => (
                  <tr
                    key={u.id}
                    className="border-b border-surface-border/50
                               hover:bg-surface-hover transition-colors"
                  >
                    {/* Nome */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'w-8 h-8 rounded-full flex items-center justify-center',
                          'text-xs font-bold uppercase',
                          'bg-brand-500/10 text-brand-400'
                        )}>
                          {u.nome.slice(0, 2)}
                        </div>
                        <span className="font-medium text-gray-200">
                          {u.nome}
                        </span>
                        {u.id === usuarioLogado?.id && (
                          <span className="text-xs text-gray-500">(você)</span>
                        )}
                      </div>
                    </td>

                    {/* E-mail */}
                    <td className="px-4 py-3 text-gray-400">{u.email}</td>

                    {/* Perfil */}
                    <td className="px-4 py-3">
                      <Badge color={PERFIL_COLOR[u.perfil]}>
                        {PERFIL_LABEL[u.perfil]}
                      </Badge>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <Badge color={u.ativo ? 'green' : 'gray'}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>

                    {/* Último acesso */}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toLocaleDateString('pt-BR')
                        : 'Nunca acessou'}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3">
                      {(usuarioLogado?.perfil === 'admin' || usuarioLogado?.perfil === 'master') && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditando(u)}
                            className="p-1.5 rounded-lg text-gray-500
                                       hover:text-brand-400
                                       hover:bg-brand-500/10 transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                          {u.id !== usuarioLogado?.id && (
                            <button
                              onClick={() => setRemovendo(u)}
                              className="p-1.5 rounded-lg text-gray-500
                                         hover:text-red-400
                                         hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>

        {!loading && usuarios.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-500">
            Nenhum usuário cadastrado.
          </div>
        )}
      </div>

      {/* Modais */}
      {modalNovo && (
        <ModalNovoUsuario
          onClose={() => setModalNovo(false)}
          onSuccess={() => { setModalNovo(false); fetchUsuarios() }}
        />
      )}

      {editando && (
        <ModalEditarUsuario
          usuario={editando}
          onClose={() => setEditando(null)}
          onSuccess={() => { setEditando(null); fetchUsuarios() }}
        />
      )}

      <ConfirmDialog
        open={!!removendo}
        title="Remover usuário"
        description={`Deseja remover "${removendo?.nome}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        variant="danger"
        onConfirm={handleRemover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  )
}
