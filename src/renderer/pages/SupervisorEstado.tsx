import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/auth.store'
import { nomeEstado } from '../utils/estados'
import { ArrowLeft, Bell, Building2, MapPin } from 'lucide-react'

interface Obra { id: number; nome: string; titulo_obra: string | null; estado: string | null }
interface Notificacao {
  empresa_id: number
  aps_pendentes: number
  nfs_pendentes: number
  admissoes_recentes: number
  desligamentos_recentes: number
  total: number
}

const TOTAL_CAIXAS = 12

// NOVO: grade de 12 caixas (3 por fileira) com as obras daquele
// estado — as caixas sem obra ficam azuis e em branco, esperando a
// próxima obra ser cadastrada nesse estado; as com obra ganham cor
// própria, mostram o Título da Obra e um selo de notificação (AP's
// pendentes da aprovação dele, admissões/desligamentos recentes).
export default function SupervisorEstado() {
  const { uf } = useParams<{ uf: string }>()
  const usuario = useAuthStore(s => s.usuario)
  const navigate = useNavigate()

  const [obras, setObras] = useState<Obra[]>([])
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const obraIds = usuario?.obras_supervisor ?? []
    if (obraIds.length === 0) { setLoading(false); return }
    setLoading(true)
    window.api.supervisor.painelInicio({ empresa_ids: obraIds, dataInicio: '', dataFim: '' }).then(async (dados: { obras: Obra[] }) => {
      const doEstado = dados.obras.filter((o: Obra) => (o.estado || 'SEM ESTADO').toUpperCase() === uf)
      setObras(doEstado)
      if (doEstado.length > 0) {
        const notifs = await window.api.supervisor.notificacoesObras(doEstado.map(o => o.id))
        setNotificacoes(notifs)
      }
    }).finally(() => setLoading(false))
  }, [usuario, uf])

  const notifPorObra = useMemo(() => new Map(notificacoes.map(n => [n.empresa_id, n])), [notificacoes])

  // Sempre 12 posições — as primeiras N com obra de verdade, o
  // resto em branco esperando a próxima obra desse estado.
  const caixas = Array.from({ length: TOTAL_CAIXAS }, (_, i) => obras[i] ?? null)

  function abrirObra(obra: Obra) {
    navigate('/supervisor/obras', { state: { obraEmpresaId: obra.id, estadoOrigem: uf } })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <button
        onClick={() => navigate('/supervisor')}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar ao Painel de Resumo
      </button>

      <div className="flex items-center gap-2 mb-1">
        <MapPin size={20} className="text-brand-400" />
        <h1 className="text-xl font-bold text-white">{nomeEstado(uf ?? '')}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {loading ? 'Carregando…' : `${obras.length} obra${obras.length !== 1 ? 's' : ''} sob sua gestão nesse estado`}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: TOTAL_CAIXAS }).map((_, i) => <div key={i} className="h-32 shimmer rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {caixas.map((obra, i) => {
            if (!obra) {
              // Caixa vazia — azul, sem informação, esperando a
              // próxima obra desse estado ser cadastrada.
              return (
                <div
                  key={`vazia-${i}`}
                  className="h-32 rounded-2xl border border-dashed border-brand-500/25 bg-brand-500/5
                             flex flex-col items-center justify-center gap-1.5"
                >
                  <Building2 size={18} className="text-brand-500/30" />
                  <p className="text-[11px] text-brand-500/40 uppercase tracking-wide">Sem obra</p>
                </div>
              )
            }

            const notif = notifPorObra.get(obra.id)
            const titulo = obra.titulo_obra || obra.nome

            return (
              <button
                key={obra.id}
                onClick={() => abrirObra(obra)}
                className="relative h-32 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5
                           flex flex-col items-center justify-center gap-1.5 text-center px-4
                           hover:border-emerald-400/60 hover:from-emerald-500/20 transition-colors"
              >
                {!!notif && notif.total > 0 && (
                  <span
                    title={[
                      notif.aps_pendentes ? `${notif.aps_pendentes} AP(s) pra autorizar` : null,
                      notif.nfs_pendentes ? `${notif.nfs_pendentes} Nota(s) pra autorizar` : null,
                      notif.admissoes_recentes ? `${notif.admissoes_recentes} admissão(ões) recente(s)` : null,
                      notif.desligamentos_recentes ? `${notif.desligamentos_recentes} desligamento(s) recente(s)` : null,
                    ].filter(Boolean).join(' · ')}
                    className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500
                               text-white text-[11px] font-bold flex items-center justify-center gap-0.5 shadow-lg"
                  >
                    <Bell size={10} /> {notif.total}
                  </span>
                )}
                <Building2 size={18} className="text-emerald-400" />
                <p className="text-sm font-bold text-emerald-300 leading-tight line-clamp-2">{titulo}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
