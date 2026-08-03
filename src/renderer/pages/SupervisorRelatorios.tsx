import { ClipboardList } from 'lucide-react'

// NOVO: placeholder — o conteúdo de verdade dessa página é a próxima
// etapa da repaginação do Painel Supervisor, ainda por definir.
export default function SupervisorRelatorios() {
  return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <div className="w-14 h-14 rounded-2xl bg-brand-500/15 flex items-center justify-center mx-auto mb-4">
        <ClipboardList size={24} className="text-brand-400" />
      </div>
      <h1 className="text-lg font-bold text-white mb-1">Relatórios</h1>
      <p className="text-sm text-gray-500">Em construção — a próxima etapa da repaginação.</p>
    </div>
  )
}
