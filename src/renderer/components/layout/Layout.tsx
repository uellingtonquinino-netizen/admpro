import { useUIStore }  from '@store/ui.store'
import Titlebar        from './Titlebar'
import Sidebar         from './Sidebar'
import { clsx }        from 'clsx'

interface Props {
  children: React.ReactNode
}

export default function Layout({ children }: Props) {
  const sidebarOpen = useUIStore(s => s.sidebarOpen)

  return (
    <div className="flex flex-col h-screen bg-surface-card overflow-hidden">

      {/* Barra de título customizada */}
      <Titlebar />

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <Sidebar />

        {/* Conteúdo principal */}
        <main
          className={clsx(
            'flex-1 overflow-y-auto transition-all duration-250',
            'bg-surface-card text-gray-100',
            sidebarOpen ? 'ml-0' : 'ml-0'
          )}
        >
          <div className="p-6 min-h-full animate-fade-in">
            {children}
          </div>
        </main>

      </div>
    </div>
  )
}
