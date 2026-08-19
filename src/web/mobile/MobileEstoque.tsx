import { useEffect, useState } from 'react'
import { apiWeb } from '../api-web'

interface Props {
  empresaIds: number[]
}

interface Produto {
  id: number
  codigo: string
  nome: string
  estoque_atual: number
  estoque_minimo: number
  unidade: string | null
  valor_unitario: number
}

function formatMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// NOVO: consulta do estoque — só visualização. Mesma ideia do
// Colaboradores: quando tem mais de uma obra, busca cada uma e junta.
export default function MobileEstoque({ empresaIds }: Props) {
  const [busca, setBusca] = useState('')
  const [soAlerta, setSoAlerta] = useState(false)
  const [lista, setLista] = useState<Produto[]>([])
  const [valorTotal, setValorTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (empresaIds.length === 0) { setCarregando(false); return }
    setCarregando(true)
    setErro(null)
    Promise.all(empresaIds.map(empresa_id => apiWeb.produtos.listar({ empresa_id, busca: busca || undefined })))
      .then(resultados => {
        const items = (resultados.flat() as Produto[]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        setLista(items)
        setValorTotal(items.reduce((s, p) => s + Number(p.estoque_atual) * Number(p.valor_unitario), 0))
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar o estoque.'))
      .finally(() => setCarregando(false))
  }, [empresaIds.join(','), busca])

  const listaFiltrada = soAlerta ? lista.filter(p => Number(p.estoque_atual) <= Number(p.estoque_minimo)) : lista

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
        <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Estoque</h1>
        <p className="text-[12.5px] text-gray-500 mt-0.5 mb-3">Valor total: <b className="text-gray-300">{formatMoeda(valorTotal)}</b></p>

        <input
          type="text" placeholder="Buscar material ou ferramenta…" value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100 outline-none focus:border-brand-500 mb-2"
        />
        <button
          onClick={() => setSoAlerta(a => !a)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
            soAlerta ? 'bg-amber-500/15 border-amber-500/40 text-amber-400' : 'bg-surface-hover border-surface-border text-gray-400'
          }`}
        >
          ⚠️ Só estoque baixo/zerado
        </button>
      </header>

      <main className="px-4 pt-3 max-w-[480px] mx-auto">
        {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 mb-3">{erro}</p>}

        {carregando ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-surface border border-surface-border animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {listaFiltrada.map(p => {
              const zerado = Number(p.estoque_atual) <= 0
              const baixo = !zerado && Number(p.estoque_atual) <= Number(p.estoque_minimo)
              return (
                <div key={p.id} className="bg-surface border border-surface-border rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-100 m-0 truncate">{p.nome}</p>
                    <p className="text-xs text-gray-500 m-0 mt-0.5">Cód. {p.codigo} · {formatMoeda(p.valor_unitario)}/{p.unidade ?? 'un'}</p>
                  </div>
                  <div className={`text-right shrink-0 ${zerado ? 'text-red-400' : baixo ? 'text-amber-400' : 'text-gray-200'}`}>
                    <p className="font-mono text-base font-extrabold m-0 leading-none">{p.estoque_atual}</p>
                    <p className="text-[10px] text-gray-500 m-0 mt-0.5">{p.unidade ?? 'un'}</p>
                  </div>
                </div>
              )
            })}
            {listaFiltrada.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-16">Nenhum item encontrado.</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
