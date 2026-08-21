import { Outlet }    from 'react-router-dom'
import Sidebar       from './Sidebar'
import Navbar        from './Navbar'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-gray-100 overflow-hidden">

      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
