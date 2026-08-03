import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Moeda       = 'BRL' | 'USD' | 'EUR'
type Tema        = 'dark' | 'light' | 'auto'
type FormatoData = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'

interface PreferenciasState {
  moeda:        Moeda
  tema:         Tema
  formatoData:  FormatoData

  setMoeda:       (v: Moeda)       => void
  setTema:        (v: Tema)        => void
  setFormatoData: (v: FormatoData) => void
}

export const usePreferenciasStore = create<PreferenciasState>()(
  persist(
    (set) => ({
      moeda:       'BRL',
      tema:        'dark',
      formatoData: 'dd/MM/yyyy',

      setMoeda:       (moeda)       => set({ moeda }),
      setTema:        (tema)        => set({ tema  }),
      setFormatoData: (formatoData) => set({ formatoData }),
    }),
    { name: 'otimizzai-preferencias' }
  )
)
