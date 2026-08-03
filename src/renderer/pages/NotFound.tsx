import { useNavigate } from 'react-router-dom'
import Button          from '@components/ui/Button'
import { Ghost }       from 'lucide-react'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div className="h-screen flex flex-col items-center justify-center
                    gap-4 text-center px-4">
      <Ghost size={48} className="text-gray-600" />
      <h1 className="text-2xl font-bold text-gray-200">
        Página não encontrada
      </h1>
      <p className="text-sm text-gray-500 max-w-xs">
        A rota que você tentou acessar não existe ou foi removida.
      </p>
      <Button onClick={() => navigate('/inicio')}>
        Voltar ao início
      </Button>
    </div>
  )
}
