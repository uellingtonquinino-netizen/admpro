import { useEffect, useState } from 'react'
import { useCurrency } from '@hooks/useCurrency'
import Modal from '@components/ui/Modal'
import { clsx } from 'clsx'
import { Users, Wallet, CalendarHeart, UserRound, Calendar } from 'lucide-react'
import { calcularResumoFolha, formatReais } from '@utils/folhaPagamentoCalculo'

interface Aniversariante {
  nome:       string
  funcao:     string | null
  nascimento: string
}

interface ResumoRHData {
  totalAtivos:      number
  custoFolha:       number
  mediaIdade:       number | null
  porStatus:        { status: string; quantidade: number }[]
  aniversariantes:  Aniversariante[]
}

interface ColaboradorNome {
  id:     number
  nome:   string
  funcao: string | null
}

const TEMAS = {
  blue:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    iconBg: 'bg-blue-500',    text: 'text-white' },
  green:  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', iconBg: 'bg-emerald-500', text: 'text-emerald-400' },
  amber:  { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   iconBg: 'bg-amber-500',   text: 'text-amber-400' },
  purple: { bg: 'bg-purple-500/10',  border: 'border-purple-500/30',  iconBg: 'bg-purple-500',  text: 'text-white' },
}

const MES_ATUAL = new Date().getMonth() + 1
const ANO_ATUAL = new Date().getFullYear()
const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

// NOVO: mesmas 4 caixas coloridas que o ADM vê no Início (ResumoRH.tsx),
// só que pra uma obra específica dentro do Painel do Supervisor —
// com duas diferenças pedidas: "Colaboradores" abre a lista de nomes
// (só leitura, sem editar/gerar documento/excluir) e "Aniversariantes"
// já mostra os nomes com rolagem dentro da própria caixa, não só a
// contagem.
// NOVO: ganhou filtro de mês/ano (igual o Início do ADM/Gestor já
// tinha, mas aqui não existia nenhum) — pré-escolhido no mês/ano
// atual. Controla tanto os aniversariantes quanto o total aproximado
// da folha, mostrado no rodapé do card "Custo de Salários".
export default function ResumoRHObra({ empresaId }: { empresaId: number }) {
  const { format } = useCurrency()
  const [data, setData]       = useState<ResumoRHData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(MES_ATUAL)
  const [ano, setAno] = useState(ANO_ATUAL)
  const [totalFolha, setTotalFolha]               = useState<number | null>(null)
  const [loadingTotalFolha, setLoadingTotalFolha]  = useState(true)

  const [modalColaboradoresAberto, setModalColaboradoresAberto] = useState(false)
  const [nomes, setNomes]           = useState<ColaboradorNome[]>([])
  const [carregandoNomes, setCarregandoNomes] = useState(false)

  useEffect(() => {
    setLoading(true)
    window.api.colaboradores.resumoRH({ empresa_id: empresaId, mes })
      .then(setData)
      .finally(() => setLoading(false))
  }, [empresaId, mes])

  useEffect(() => {
    setLoadingTotalFolha(true)
    const mesCompetencia = `${ano}-${String(mes).padStart(2, '0')}`
    window.api.folhaPagamento.buscarPorCompetencia({ empresa_id: empresaId, mes_competencia: `${mesCompetencia}-01` })
      .then(folha => setTotalFolha(folha ? calcularResumoFolha(folha.itens, mesCompetencia).totalGeral : null))
      .catch(erro => { console.error('Erro ao buscar o total da folha:', erro); setTotalFolha(null) })
      .finally(() => setLoadingTotalFolha(false))
  }, [empresaId, mes, ano])

  function abrirColaboradores() {
    setModalColaboradoresAberto(true)
    setCarregandoNomes(true)
    window.api.colaboradores.listar({ empresa_id: empresaId, status: 'ativo', perPage: 1000 })
      .then((r: { items: ColaboradorNome[] }) => setNomes(r.items))
      .finally(() => setCarregandoNomes(false))
  }

  const afastados = data?.porStatus.find(s => s.status === 'afastado')?.quantidade ?? 0
  const emFerias   = data?.porStatus.find(s => s.status === 'ferias')?.quantidade ?? 0

  return (
    <>
      {/* NOVO: filtro de mês/ano — pré-escolhido no mês/ano atual */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={mes}
            onChange={e => setMes(Number(e.target.value))}
            className="input w-36 text-sm pl-8"
          >
            {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={ano}
            onChange={e => setAno(Number(e.target.value))}
            className="input w-28 text-sm pl-8"
          >
            {[ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 shimmer rounded-xl" />)}
        </div>
      ) : (
        <ResumoRHObraConteudo
          data={data} format={format} afastados={afastados} emFerias={emFerias}
          totalFolha={totalFolha} loadingTotalFolha={loadingTotalFolha}
          abrirColaboradores={abrirColaboradores}
        />
      )}

      {/* Modal com só os nomes — sem editar/gerar documento/excluir */}
      <Modal open={modalColaboradoresAberto} onClose={() => setModalColaboradoresAberto(false)} title="Colaboradores ativos" size="md">
        {carregandoNomes ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 shimmer rounded-lg" />)}
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto space-y-1 -mx-1 px-1">
            {nomes.map(c => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                <p className="text-sm text-gray-200">{c.nome}</p>
                {c.funcao && <p className="text-xs text-gray-500">{c.funcao}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}

// Extraído só pra não duplicar o JSX dos cards — mesmo conteúdo de
// antes, agora recebendo os dados já prontos por prop.
function ResumoRHObraConteudo({ data, format, afastados, emFerias, totalFolha, loadingTotalFolha, abrirColaboradores }: {
  data: ResumoRHData
  format: (v: number) => string
  afastados: number
  emFerias: number
  totalFolha: number | null
  loadingTotalFolha: boolean
  abrirColaboradores: () => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {/* Colaboradores ativos — clicável, abre a lista de nomes */}
        <button
          onClick={abrirColaboradores}
          className={clsx('rounded-xl border p-4 text-left transition-colors hover:brightness-110', TEMAS.blue.bg, TEMAS.blue.border)}
        >
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', TEMAS.blue.iconBg)}>
              <Users size={18} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Colaboradores ativos</p>
          <p className="text-2xl font-bold text-white">{data.totalAtivos}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {afastados || emFerias ? `${afastados} afastado(s) · ${emFerias} em férias` : 'Toque para ver os nomes'}
          </p>
        </button>

        {/* Custo de Salários */}
        <div className={clsx('rounded-xl border p-4', TEMAS.green.bg, TEMAS.green.border)}>
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', TEMAS.green.iconBg)}>
              <Wallet size={18} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Custo de Salários</p>
          <p className={clsx('text-2xl font-bold', TEMAS.green.text)}>{format(data.custoFolha)}</p>
          {/* NOVO: total aproximado da Folha de Pagamento SALVA pro
              mês/ano escolhido no filtro, no lugar de repetir o
              valor de cima. */}
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {loadingTotalFolha
              ? 'Calculando...'
              : totalFolha !== null
              ? `Total Aproximado da Folha ${formatReais(totalFolha)}`
              : 'Nenhuma folha salva pra esse mês'}
          </p>
        </div>

        {/* Média de idade */}
        <div className={clsx('rounded-xl border p-4', TEMAS.amber.bg, TEMAS.amber.border)}>
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', TEMAS.amber.iconBg)}>
              <UserRound size={18} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Média de idade</p>
          <p className={clsx('text-2xl font-bold', TEMAS.amber.text)}>{data.mediaIdade ? `${data.mediaIdade} anos` : '—'}</p>
        </div>

        {/* Aniversariantes — quantidade + nomes com rolagem, dentro da própria caixa */}
        <div className={clsx('rounded-xl border p-4 flex flex-col', TEMAS.purple.bg, TEMAS.purple.border)}>
          <div className="flex items-start justify-between mb-3">
            <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', TEMAS.purple.iconBg)}>
              <CalendarHeart size={18} className="text-white" />
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1">Aniversariantes do mês</p>
          <p className="text-2xl font-bold text-white mb-2">{data.aniversariantes.length}</p>
          {data.aniversariantes.length > 0 && (
            <div className="space-y-1 max-h-[88px] overflow-y-auto pr-1">
              {data.aniversariantes.map(a => {
                const dia = Number(a.nascimento.slice(8, 10))
                return (
                  <p key={a.nome} className="text-xs text-gray-300 truncate">
                    <span className="text-purple-300 font-medium">{dia}</span> — {a.nome}
                  </p>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
