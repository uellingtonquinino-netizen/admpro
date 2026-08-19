import { useEffect, useState } from 'react'
import { apiWeb } from '../api-web'

interface Props {
  empresaIds: number[]
}

interface Colaborador {
  id: number
  nome: string
  funcao: string | null
  setor: string | null
  status: string
}

const STATUS_LABEL: Record<string, string> = { ativo: 'Ativo', afastado: 'Afastado', ferias: 'Férias', desligado: 'Desligado' }
const STATUS_COR: Record<string, string> = {
  ativo:     'bg-green-500/15 text-green-400',
  afastado:  'bg-amber-500/15 text-amber-400',
  ferias:    'bg-brand-500/15 text-brand-400',
  desligado: 'bg-red-500/15 text-red-400',
}

// NOVO: consulta e filtro dos colaboradores — só visualização (sem
// editar/excluir, essa versão é de consulta rápida no celular).
// Quando o Gestor/Supervisor tem mais de uma obra, busca cada uma
// separadamente e junta — a consulta de colaboradores.listar já
// existente é presa a UMA empresa_id por vez.
export default function MobileColaboradores({ empresaIds }: Props) {
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('')
  const [funcao, setFuncao] = useState('')
  const [funcoes, setFuncoes] = useState<string[]>([])
  const [lista, setLista] = useState<Colaborador[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (empresaIds.length === 0) return
    apiWeb.colaboradores.opcoesFiltro(empresaIds[0]).then(o => setFuncoes(o.funcoes)).catch(() => {})
  }, [empresaIds.join(',')])

  useEffect(() => {
    if (empresaIds.length === 0) { setCarregando(false); return }
    setCarregando(true)
    setErro(null)
    const buscarPorObra = Promise.all(empresaIds.map(empresa_id =>
      apiWeb.colaboradores.listar({ empresa_id, busca: busca || undefined, status: status || undefined, funcao: funcao || undefined, perPage: 200 })
    ))
    buscarPorObra
      .then(resultados => {
        const items = resultados.flatMap(r => r.items) as Colaborador[]
        items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        setLista(items)
        setTotal(resultados.reduce((s, r) => s + r.total, 0))
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar colaboradores.'))
      .finally(() => setCarregando(false))
  }, [empresaIds.join(','), busca, status, funcao])

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
        <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Colaboradores</h1>
        <p className="text-[12.5px] text-gray-500 mt-0.5 mb-3">{total} encontrado{total !== 1 && 's'}</p>

        <input
          type="text" placeholder="Buscar por nome…" value={busca} onChange={e => setBusca(e.target.value)}
          className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100 outline-none focus:border-brand-500 mb-2"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <select value={status} onChange={e => setStatus(e.target.value)} className="bg-surface-hover border border-surface-border rounded-lg text-gray-200 text-xs px-2.5 py-1.5 shrink-0">
            <option value="">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={funcao} onChange={e => setFuncao(e.target.value)} className="bg-surface-hover border border-surface-border rounded-lg text-gray-200 text-xs px-2.5 py-1.5 shrink-0">
            <option value="">Todas as funções</option>
            {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </header>

      <main className="px-4 pt-3 max-w-[480px] mx-auto">
        {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 mb-3">{erro}</p>}

        {carregando ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-surface border border-surface-border animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map(c => (
              <div key={c.id} className="bg-surface border border-surface-border rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-100 m-0 truncate">{c.nome}</p>
                  <p className="text-xs text-gray-500 m-0 mt-0.5 truncate">{c.funcao ?? '—'}{c.setor ? ` · ${c.setor}` : ''}</p>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg shrink-0 ${STATUS_COR[c.status] ?? 'bg-surface-hover text-gray-400'}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </div>
            ))}
            {lista.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-16">Nenhum colaborador encontrado.</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
