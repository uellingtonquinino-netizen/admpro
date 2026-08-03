import { useState, useEffect } from 'react'
import Input  from './Input'
import { Search } from 'lucide-react'

interface Props {
  dataInicio: string
  dataFim:    string
  onBuscar:   (inicio: string, fim: string) => void
  className?: string
}

// NOVO: filtro de período reutilizável — digitar/escolher as datas só
// prepara a busca; ela só roda de verdade ao clicar na lupa ou apertar
// Enter (a lupa funciona como o Enter). Usado em toda tela que tem
// filtro "De/Até".
export default function FiltroPeriodo({ dataInicio, dataFim, onBuscar, className }: Props) {
  const [inicio, setInicio] = useState(dataInicio)
  const [fim, setFim]       = useState(dataFim)

  useEffect(() => { setInicio(dataInicio) }, [dataInicio])
  useEffect(() => { setFim(dataFim) }, [dataFim])

  function buscar() {
    onBuscar(inicio, fim)
  }

  function aoPressionarTecla(e: React.KeyboardEvent) {
    if (e.key === 'Enter') buscar()
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Input
        type="date"
        value={inicio}
        onChange={e => setInicio(e.target.value)}
        onKeyDown={aoPressionarTecla}
        className="w-40 text-sm"
      />
      <span className="text-gray-500 text-sm">até</span>
      <Input
        type="date"
        value={fim}
        onChange={e => setFim(e.target.value)}
        onKeyDown={aoPressionarTecla}
        className="w-40 text-sm"
      />
      <button
        type="button"
        onClick={buscar}
        title="Buscar"
        className="p-2 rounded-lg bg-surface-hover text-gray-300 hover:text-white hover:bg-brand-600 transition-colors"
      >
        <Search size={15} />
      </button>
    </div>
  )
}
