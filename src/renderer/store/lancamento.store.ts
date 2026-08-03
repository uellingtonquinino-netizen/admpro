import { create }        from 'zustand'
import { useEmpresaStore } from './empresa.store'

interface LancamentoStore {
  filtros: {
    tipo?:         'receita' | 'despesa'
    status?:       string
    mes?:          number
    ano?:          number
    search?:       string
    conta_id?:     number
    categoria_id?: number
    page:          number
    perPage:       number
  }
  setFiltro:    (key: string, value: unknown) => void
  resetFiltros: () => void
}

const defaultFiltros = {
  page:    1,
  perPage: 20,
  ano:     new Date().getFullYear(),
  mes:     new Date().getMonth() + 1,
}

export const useLancamentoStore = create<LancamentoStore>((set) => ({
  filtros:      defaultFiltros,
  setFiltro:    (key, value) =>
    set(s => ({
      filtros: { ...s.filtros, [key]: value, page: 1 }
    })),
  resetFiltros: () => set({ filtros: defaultFiltros }),
}))

// ── Hook utilitário com empresa injetada ──────────────────
export function useFiltrosComEmpresa() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const filtros   = useLancamentoStore(s => s.filtros)
  return { ...filtros, empresa_id: empresaId! }
}
