import { create } from 'zustand'

interface UIStore {
  sidebarOpen:     boolean
  toggleSidebar:   () => void
  setSidebar:      (v: boolean) => void

  modal:           string | null
  openModal:       (name: string) => void
  closeModal:      () => void

  loading:         Record<string, boolean>
  setLoading:      (key: string, value: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen:   true,
  toggleSidebar: ()       => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebar:    (v)      => set({ sidebarOpen: v }),

  modal:         null,
  openModal:     (name)   => set({ modal: name }),
  closeModal:    ()       => set({ modal: null }),

  loading:       {},
  setLoading:    (key, value) =>
    set(s => ({ loading: { ...s.loading, [key]: value } })),
}))
