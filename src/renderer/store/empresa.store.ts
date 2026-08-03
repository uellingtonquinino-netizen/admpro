import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// CORRIGIDO: partes diferentes da conversa original assumiam formatos
// diferentes desta store — algumas liam `s.empresaId`/`s.empresaNome`
// (dois campos separados), outras liam `s.empresa` (objeto completo) e
// chamavam `setEmpresa(objetoCompleto)`. Unificado aqui: o objeto
// completo é a fonte da verdade, e `empresaId`/`empresaNome` continuam
// existindo, derivados dele, para não quebrar nenhum dos dois usos.
export interface Empresa {
  id:        number
  nome:      string
  cnpj:      string | null
  email:     string | null
  telefone:  string | null
  endereco:  string | null
  logo_url?: string | null
  cidade?:                string | null
  estado?:                string | null
  solicitante_padrao?:    string | null
  autorizado_por_padrao?: string | null
}

interface EmpresaStore {
  empresa:      Empresa | null
  empresaId:    number | null
  empresaNome:  string
  setEmpresa:   (empresa: Empresa) => void
  clearEmpresa: () => void
}

export const useEmpresaStore = create<EmpresaStore>()(
  persist(
    (set) => ({
      empresa:     null,
      empresaId:   null,
      empresaNome: '',
      setEmpresa:  (empresa) => set({
        empresa,
        empresaId:   empresa.id,
        empresaNome: empresa.nome,
      }),
      clearEmpresa: () => set({ empresa: null, empresaId: null, empresaNome: '' }),
    }),
    { name: 'empresa-storage' }
  )
)
