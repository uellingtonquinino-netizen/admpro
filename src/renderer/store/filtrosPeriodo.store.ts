import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Periodo {
  dataInicio: string
  dataFim:    string
}

const PERIODO_VAZIO: Periodo = { dataInicio: '', dataFim: '' }

interface FiltrosPeriodoState {
  ap:              Periodo
  notasFiscais:    Periodo
  supervisorInicio: Periodo

  setFiltroAp:              (p: Periodo) => void
  setFiltroNotasFiscais:    (p: Periodo) => void
  setFiltroSupervisorInicio: (p: Periodo) => void
}

// NOVO: guarda a última data pesquisada em cada filtro "De/Até" —
// nada de sugestão automática (terça a terça). Sem sugestão nenhuma,
// ao abrir o programa a tela cai vazia (mostra tudo); assim que o
// usuário pesquisa uma vez, aquela pesquisa fica salva (mesmo
// fechando e abrindo o programa de novo) até ele pesquisar outra
// coisa. Navegar entre as páginas do sistema não mexe nisso — é um
// store à parte, independente do estado de cada tela.
export const useFiltrosPeriodoStore = create<FiltrosPeriodoState>()(
  persist(
    (set) => ({
      ap:               PERIODO_VAZIO,
      notasFiscais:     PERIODO_VAZIO,
      supervisorInicio: PERIODO_VAZIO,

      setFiltroAp:               (p) => set({ ap: p }),
      setFiltroNotasFiscais:     (p) => set({ notasFiscais: p }),
      setFiltroSupervisorInicio: (p) => set({ supervisorInicio: p }),
    }),
    { name: 'otimizzai-filtros-periodo' }
  )
)
