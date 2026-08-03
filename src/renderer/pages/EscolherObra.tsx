import { useAuthStore } from '@store/auth.store'
import { Building2, LogOut } from 'lucide-react'

// NOVO: tela mostrada quando um ADM, Gestor ou Almoxarife tem mais de
// uma obra vinculada — escolhe qual vai usar antes de entrar no
// resto do sistema. Quem só tem uma obra nunca vê essa tela.
export default function EscolherObra() {
  const obras   = useAuthStore(s => s.obrasDisponiveis)
  const usuario = useAuthStore(s => s.usuario)
  const escolherObra = useAuthStore(s => s.escolherObra)
  const logout  = useAuthStore(s => s.logout)

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-white">Escolha a obra</h1>
          <p className="text-sm text-gray-400 mt-1">
            Olá, {usuario?.nome} — você administra mais de uma obra. Qual delas você quer acessar agora?
          </p>
        </div>

        <div className="space-y-2">
          {obras.map(o => (
            <button
              key={o.id}
              onClick={() => escolherObra(o.id)}
              className="w-full flex items-center gap-3 bg-surface-card border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                <Building2 size={16} className="text-brand-400" />
              </div>
              <p className="text-sm font-medium text-white">{o.nome}</p>
            </button>
          ))}
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-red-400 mt-6 transition-colors"
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  )
}
