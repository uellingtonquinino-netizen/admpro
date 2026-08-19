export type AbaId = 'painel' | 'estoque' | 'colaboradores' | 'aprovacoes' | 'diario'

interface Props {
  abaAtual: AbaId
  onMudar:  (aba: AbaId) => void
  // NOVO: Diário de Obra só existe pro Gestor — os outros perfis
  // (Supervisor) nem veem essa aba.
  mostrarDiario: boolean
}

// NOVO: Estoque/Colaboradores/Aprovações ainda não têm tela — ficam
// visíveis mas desabilitadas, pra já mostrar o mapa completo do que
// vem a seguir, sem parecer que falta alguma coisa por engano.
const ABAS: { id: AbaId; rotulo: string; icone: string; pronta: boolean }[] = [
  { id: 'painel',        rotulo: 'Painel',     icone: '📊', pronta: true },
  { id: 'estoque',       rotulo: 'Estoque',    icone: '📦', pronta: true },
  { id: 'colaboradores', rotulo: 'Equipe',     icone: '👷', pronta: true },
  { id: 'diario',        rotulo: 'Diário',     icone: '📝', pronta: true },
  { id: 'aprovacoes',    rotulo: 'Aprovações', icone: '✅', pronta: true },
]

export default function BottomNav({ abaAtual, onMudar, mostrarDiario }: Props) {
  const abasVisiveis = ABAS.filter(aba => aba.id !== 'diario' || mostrarDiario)
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {abasVisiveis.map(aba => (
        <button
          key={aba.id}
          onClick={() => aba.pronta && onMudar(aba.id)}
          disabled={!aba.pronta}
          className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
            abaAtual === aba.id
              ? 'text-brand-400'
              : aba.pronta
                ? 'text-gray-500'
                : 'text-gray-700'
          }`}
        >
          <span className="text-base leading-none">{aba.icone}</span>
          {aba.rotulo}
          {!aba.pronta && <span className="text-[9px] text-gray-700 leading-none">em breve</span>}
        </button>
      ))}
    </nav>
  )
}
