import { useEffect, useState } from 'react'
import { useCurrency } from '@hooks/useCurrency'
import { Search, PackageX, PackageMinus, Wallet, Boxes } from 'lucide-react'

interface Produto {
  id:              number
  codigo:          string
  nome:            string
  unidade:         string | null
  estoque_atual:   number
  estoque_minimo:  number
  valor_unitario:  number
}
interface ProdutoResumo {
  id: number; codigo: string; nome: string; estoque_atual: number; unidade: string | null
}
interface Resumo {
  zerados:    ProdutoResumo[]
  acabando:   ProdutoResumo[]
  valorTotal: number
}

// NOVO: mesmo painel de estoque que o Almoxarife vê (as 3 caixas de
// resumo + a lista de materiais/ferramentas), só que somente leitura
// e recebendo a obra por fora — usado dentro da tela do Supervisor,
// que não está "logado" numa obra só (vê várias).
export default function PainelEstoqueObra({ empresaId }: { empresaId: number }) {
  const { format } = useCurrency()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [resumo, setResumo]     = useState<Resumo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.produtos.listar({ empresa_id: empresaId }),
      window.api.produtos.resumo(empresaId),
    ]).then(([lista, res]) => { setProdutos(lista); setResumo(res) })
      .finally(() => setLoading(false))
  }, [empresaId])

  const produtosFiltrados = busca.trim()
    ? produtos.filter(p =>
        p.nome.toLowerCase().includes(busca.toLowerCase()) ||
        p.codigo.toLowerCase().includes(busca.toLowerCase()))
    : produtos

  return (
    <div>
      {/* Cards de resumo — mesmas 3 caixas do Almoxarifado */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
              <PackageX size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Estoque Zerado</p>
          </div>
          {!resumo || resumo.zerados.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum material/ferramenta zerado.</p>
          ) : (
            <div className="space-y-1 max-h-[84px] overflow-y-auto pr-1">
              {resumo.zerados.map(p => (
                <p key={p.id} className="text-xs text-gray-300 truncate">{p.nome}</p>
              ))}
            </div>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <PackageMinus size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Estoque Acabando</p>
          </div>
          {!resumo || resumo.acabando.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum material/ferramenta acabando.</p>
          ) : (
            <div className="space-y-1 max-h-[84px] overflow-y-auto pr-1">
              {resumo.acabando.map(p => (
                <p key={p.id} className="text-xs text-gray-300 truncate">
                  <span className="text-amber-400 font-medium">{p.estoque_atual}{p.unidade ? ` ${p.unidade}` : ''}</span> — {p.nome}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Wallet size={15} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">Valor total do estoque</p>
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {resumo ? format(resumo.valorTotal) : '—'}
          </p>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por código ou nome…"
          className="input w-full pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 shimmer rounded-lg" />)}</div>
      ) : produtos.length === 0 ? (
        <div className="text-center py-8">
          <Boxes size={22} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhum material/ferramenta cadastrado nessa obra.</p>
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum resultado para "{busca}".</p>
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {['Código', 'Material/Ferramenta', 'Unidade', 'Estoque atual', 'Valor unitário'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => (
                <tr key={p.id} className="border-b border-surface-border/50">
                  <td className="px-4 py-3 text-gray-400">{p.codigo}</td>
                  <td className="px-4 py-3 text-gray-200">{p.nome}</td>
                  <td className="px-4 py-3 text-gray-400">{p.unidade ?? '—'}</td>
                  <td className={`px-4 py-3 font-medium ${
                    p.estoque_atual <= 0 ? 'text-red-400'
                    : p.estoque_atual <= p.estoque_minimo ? 'text-amber-400'
                    : 'text-gray-200'
                  }`}>
                    {p.estoque_atual}
                  </td>
                  <td className="px-4 py-3 text-gray-200">{format(p.valor_unitario)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
