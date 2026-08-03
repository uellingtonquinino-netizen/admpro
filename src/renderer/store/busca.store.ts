import { create } from 'zustand'

// Busca do topo (Navbar) pros perfis Master/Supervisor/Central — esses
// perfis não têm colaborador/fornecedor pra buscar (a barra de busca
// padrão não se aplica a eles), então a caixa de busca do topo escreve
// aqui e cada painel filtra a própria lista que está na tela.
interface BuscaStore {
  query:    string
  setQuery: (q: string) => void
}

export const useBuscaStore = create<BuscaStore>((set) => ({
  query:    '',
  setQuery: (query) => set({ query }),
}))
