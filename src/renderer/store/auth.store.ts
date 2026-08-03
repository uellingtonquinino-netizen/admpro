import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useEmpresaStore } from './empresa.store'

interface Usuario {
  id:         number
  empresa_id: number
  nome:       string
  email:      string
  perfil:     'admin' | 'gestor' | 'almoxarife' | 'supervisor' | 'central' | 'master' | 'setor_pessoal'
  ativo:      number
  permissoes_extras: string[]
  permissoes_negadas: string[]
  carimbo_url: string | null
  obras_supervisor: number[]
}

interface ObraDisponivel { id: number; nome: string }

interface AuthStore {
  usuario:  Usuario | null
  login:    (email: string, senha: string) => Promise<void>
  logout:   () => void

  // NOVO: ADM, Gestor e Almoxarife também podem administrar mais de
  // uma obra agora (igual ao Supervisor já fazia). Se a pessoa só tem
  // uma, entra direto nela como sempre — se tiver mais, o app mostra
  // uma tela pra escolher antes de liberar o resto.
  precisaEscolherObra: boolean
  obrasDisponiveis:    ObraDisponivel[]
  escolherObra:        (empresaId: number) => Promise<void>
  trocarObra:          () => Promise<void>

  // NOVO: atualiza campos do usuário logado sem precisar deslogar —
  // usado depois de trocar o carimbo, por exemplo.
  atualizarUsuario: (dados: Partial<Usuario>) => void
}

// Só faz sentido escolher obra pra quem opera DENTRO de uma obra
// (RH/Financeiro/Almoxarifado do dia a dia). Supervisor, Central e
// Master já navegam entre várias obras pelo próprio painel deles.
const PERFIS_COM_OBRA_UNICA = ['admin', 'gestor', 'almoxarife']

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      usuario: null,
      precisaEscolherObra: false,
      obrasDisponiveis: [],

      login: async (email, senha) => {
        const usuario = await window.api.usuarios.login({ email, senha })
        set({ usuario })

        if (!PERFIS_COM_OBRA_UNICA.includes(usuario.perfil)) {
          // Supervisor/Central/Master: cada um com seu próprio painel,
          // não passa por essa escolha de obra.
          set({ precisaEscolherObra: false, obrasDisponiveis: [] })
          return
        }

        const obras = await window.api.usuarios.minhasObras(usuario.id)
        if (obras.length <= 1) {
          // Caminho de sempre — ninguém com uma obra só percebe
          // diferença nenhuma.
          const empresa = await window.api.empresas.buscarPorId(usuario.empresa_id)
          if (empresa) useEmpresaStore.getState().setEmpresa(empresa)
          set({ precisaEscolherObra: false, obrasDisponiveis: [] })
        } else {
          set({ precisaEscolherObra: true, obrasDisponiveis: obras })
        }
      },

      escolherObra: async (empresaId: number) => {
        const empresa = await window.api.empresas.buscarPorId(empresaId)
        if (empresa) useEmpresaStore.getState().setEmpresa(empresa)
        set({ precisaEscolherObra: false })
      },

      // Usado pelo botão "Trocar de obra" no menu — volta pra tela de
      // escolha sem precisar deslogar.
      trocarObra: async () => {
        const usuario = get().usuario
        if (!usuario) return
        const obras = await window.api.usuarios.minhasObras(usuario.id)
        useEmpresaStore.getState().clearEmpresa()
        set({ precisaEscolherObra: true, obrasDisponiveis: obras })
      },

      logout: () => {
        // A sessão do Supabase existe apenas no processo principal. A limpeza
        // local não deve esperar a rede para não travar o encerramento da UI.
        void window.api.auth.logout?.().catch(() => undefined)
        set({ usuario: null, precisaEscolherObra: false, obrasDisponiveis: [] })
        useEmpresaStore.getState().clearEmpresa()
      },

      atualizarUsuario: (dados) => {
        const usuario = get().usuario
        if (!usuario) return
        set({ usuario: { ...usuario, ...dados } })
      },
    }),
    { name: 'auth-storage' }
  )
)
