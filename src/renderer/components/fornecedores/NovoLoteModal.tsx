import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { useCurrency }     from '@hooks/useCurrency'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import FiltroPeriodo          from '@components/ui/FiltroPeriodo'
import { formatDate }         from '@utils/format'
import { Send } from 'lucide-react'

interface Props {
  onClose: () => void
  onSaved: () => void
}

interface ApItem { id: number; beneficiario_nome: string; valor_total: number; created_at: string; lote_id: number | null; aprovado_por: string | null }
interface NfItem { id: number; fornecedor_nome: string; valor_total: number; data: string; lote_id: number | null; numero_nf: string | null; aprovado_por: string | null }

function hoje(): string { return new Date().toISOString().slice(0, 10) }

// NOVO: o ADM monta aqui o lote — escolhe o período, marca quais
// AP's e Notas Fiscais entram, e envia pro Supervisor autorizar.
// Vira "Programação Financeira <obra> de <início> a <fim>".
export default function NovoLoteModal({ onClose, onSaved }: Props) {
  const empresa  = useEmpresaStore(s => s.empresa)
  const empresaId = useEmpresaStore(s => s.empresaId)
  const usuario  = useAuthStore(s => s.usuario)
  const { format } = useCurrency()

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [dataFim, setDataFim] = useState(hoje())

  const [aps, setAps] = useState<ApItem[]>([])
  const [nfs, setNfs] = useState<NfItem[]>([])
  const [apsSelecionadas, setApsSelecionadas] = useState<Set<number>>(new Set())
  const [nfsSelecionadas, setNfsSelecionadas] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [enviando, setEnviando] = useState(false)

  function carregar(inicio = dataInicio, fim = dataFim) {
    if (!empresaId) return
    setLoading(true)
    Promise.all([
      window.api.ap.listar({ empresa_id: empresaId, dataInicio: inicio, dataFim: fim, perPage: 500 }),
      window.api.notasFiscais.listar({ empresa_id: empresaId, dataInicio: inicio, dataFim: fim }),
    ]).then(([apsResultado, nfsData]) => {
      // ALTERADO: só entram aqui AP's e Notas já autorizadas — o
      // botão "Autorizar" é a mesma vaga pro ADM e pro Gestor, então
      // tanto faz quem autorizou, só não pode pular direto pro
      // Supervisor sem nenhuma autorização ainda.
      setAps((apsResultado.items as ApItem[]).filter(a => !a.lote_id && a.aprovado_por))
      setNfs((nfsData as NfItem[]).filter(n => !n.lote_id && n.aprovado_por))
    }).finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [empresaId])

  function alternarAp(id: number) {
    setApsSelecionadas(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })
  }
  function alternarNf(id: number) {
    setNfsSelecionadas(prev => {
      const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
    })
  }

  async function handleEnviar() {
    if (!empresaId || !empresa) return
    if (apsSelecionadas.size === 0 && nfsSelecionadas.size === 0) {
      toast.error('Selecione ao menos uma AP ou Nota Fiscal.')
      return
    }
    setEnviando(true)
    try {
      const { titulo } = await window.api.lotes.criar({
        empresa_id:   empresaId,
        empresa_nome: empresa.nome,
        data_inicio:  dataInicio,
        data_fim:     dataFim,
        criado_por:   usuario?.nome ?? null,
        ap_ids:       Array.from(apsSelecionadas),
        nf_ids:       Array.from(nfsSelecionadas),
      })
      toast.success(`Lote enviado: ${titulo}`)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar o lote.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Enviar Lote ao Supervisor" size="lg">
      <div className="space-y-4">
        <FiltroPeriodo
          dataInicio={dataInicio}
          dataFim={dataFim}
          onBuscar={(i, f) => { setDataInicio(i); setDataFim(f); carregar(i, f) }}
        />
        <p className="text-xs text-gray-500">
          Só aparecem aqui AP's e Notas Fiscais já autorizadas, e que ainda não fazem parte de outro lote.
        </p>

        {loading ? (
          <p className="text-sm text-gray-500 text-center py-6">Carregando…</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
                Autorizações de Pagamento ({apsSelecionadas.size} selecionada{apsSelecionadas.size !== 1 && 's'})
              </p>
              {aps.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma AP disponível nesse período.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 bg-surface-hover rounded-lg p-2">
                  {aps.map(a => (
                    <label key={a.id} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={apsSelecionadas.has(a.id)} onChange={() => alternarAp(a.id)} className="accent-brand-500" />
                      {a.beneficiario_nome} — {format(a.valor_total)} — {formatDate(a.created_at.slice(0, 10))}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
                Notas Fiscais ({nfsSelecionadas.size} selecionada{nfsSelecionadas.size !== 1 && 's'})
              </p>
              {nfs.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma nota fiscal disponível nesse período.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 bg-surface-hover rounded-lg p-2">
                  {nfs.map(n => (
                    <label key={n.id} className="flex items-center gap-2 px-1 py-1 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={nfsSelecionadas.has(n.id)} onChange={() => alternarNf(n.id)} className="accent-brand-500" />
                      {n.fornecedor_nome} — NF {n.numero_nf ?? '—'} — {format(n.valor_total)} — {formatDate(n.data)}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button icon={<Send size={14} />} onClick={handleEnviar} loading={enviando}>
          Enviar ao Supervisor
        </Button>
      </div>
    </Modal>
  )
}
