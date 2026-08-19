import { useEffect, useState, useCallback, useMemo } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { useConfirm }      from '@hooks/useConfirm'
import { toast }           from '@components/ui/ToastContainer'
import PageHeader          from '@components/layout/PageHeader'
import Button               from '@components/ui/Button'
import Modal                from '@components/ui/Modal'
import Input                 from '@components/ui/Input'
import Select                from '@components/ui/Select'
import ConfirmDialog          from '@components/ui/ConfirmDialog'
import {
  Plus, Trash2, Camera, ArrowLeft, CloudSun, X, ImageOff,
} from 'lucide-react'

interface EapItemBanco {
  id: number; parent_id: number | null; nome: string; valor_orcado: number
}
interface FotoLocal {
  caminho:    string
  legenda:    string
  novaOuExistente: 'nova' | 'existente'
}
interface AtividadeForm {
  eap_item_id:           number
  percentual_incremento: string
  observacao:            string
  fotos:                 FotoLocal[]
}
interface DiarioResumo {
  id: number; data: string; clima: string | null; quantidade_atividades: number
}

const CLIMAS = ['Ensolarado', 'Nublado', 'Chuvoso', 'Parcialmente nublado']

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function formatDataBR(iso: string): string {
  return iso.split('-').reverse().join('/')
}

// Achata a EAP e monta o "caminho" (Fase > Item > Sub-item) de cada
// item-folha (sem filho) — só folhas fazem sentido pra lançar
// percentual, os pais são sempre calculados a partir delas.
function itensFolhaComCaminho(itens: EapItemBanco[]): { id: number; caminho: string }[] {
  const porId = new Map(itens.map(i => [i.id, i]))
  const temFilho = new Set(itens.filter(i => i.parent_id !== null).map(i => i.parent_id!))
  function caminhoDe(item: EapItemBanco): string {
    const partes: string[] = [item.nome]
    let atual = item
    while (atual.parent_id !== null) {
      const pai = porId.get(atual.parent_id)
      if (!pai) break
      partes.unshift(pai.nome)
      atual = pai
    }
    return partes.join(' > ')
  }
  return itens.filter(i => !temFilho.has(i.id)).map(i => ({ id: i.id, caminho: caminhoDe(i) }))
}

// NOVO: Diário de Obra (RDO) — cabeçalho do dia + atividades
// lançadas, cada uma com o percentual executado NAQUELE DIA (não o
// acumulado) e fotos do serviço. É daqui que vem o avanço físico
// mostrado no painel da EAP.
export default function DiarioObra() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const usuario    = useAuthStore(s => s.usuario)
  const { confirm, dialogProps } = useConfirm()

  const [tela, setTela] = useState<'lista' | 'formulario'>('lista')
  const [diarios, setDiarios] = useState<DiarioResumo[]>([])
  const [loadingLista, setLoadingLista] = useState(true)

  const [eapItens, setEapItens] = useState<EapItemBanco[]>([])
  const [acumulados, setAcumulados] = useState<Record<number, number>>({})

  const [diarioId, setDiarioId] = useState<number | null>(null)
  const [data, setData] = useState(hojeISO())
  const [clima, setClima] = useState('')
  const [condicaoTrabalho, setCondicaoTrabalho] = useState('praticavel')
  const [maoDeObra, setMaoDeObra] = useState('')
  const [ocorrencias, setOcorrencias] = useState('')
  const [atividades, setAtividades] = useState<AtividadeForm[]>([])
  const [salvando, setSalvando] = useState(false)

  const [modalAtividadeAberto, setModalAtividadeAberto] = useState(false)
  const [novoItemId, setNovoItemId] = useState<number | ''>('')
  const [novoIncremento, setNovoIncremento] = useState('')
  const [novaObservacao, setNovaObservacao] = useState('')
  const [novasFotos, setNovasFotos] = useState<FotoLocal[]>([])

  const carregarLista = useCallback(() => {
    if (!empresaId) return
    setLoadingLista(true)
    window.api.obraDiario.listar(empresaId).then(setDiarios).finally(() => setLoadingLista(false))
  }, [empresaId])

  useEffect(() => { carregarLista() }, [carregarLista])

  useEffect(() => {
    if (!empresaId) return
    window.api.obraEap.listar(empresaId).then(setEapItens)
  }, [empresaId])

  const folhas = useMemo(() => itensFolhaComCaminho(eapItens), [eapItens])

  function abrirNovoDiario() {
    setDiarioId(null)
    setData(hojeISO())
    setClima('')
    setCondicaoTrabalho('praticavel')
    setMaoDeObra('')
    setOcorrencias('')
    setAtividades([])
    setTela('formulario')
  }

  async function abrirDiarioExistente(id: number) {
    const d = await window.api.obraDiario.buscarPorId(id)
    if (!d) { toast.error('Diário não encontrado.'); return }
    setDiarioId(d.id)
    setData(d.data)
    setClima(d.clima ?? '')
    setCondicaoTrabalho(d.condicao_trabalho ?? 'praticavel')
    setMaoDeObra(d.mao_de_obra_presente ?? '')
    setOcorrencias(d.ocorrencias ?? '')
    setAtividades(d.atividades.map((a: any) => ({
      eap_item_id: a.eap_item_id,
      percentual_incremento: String(a.percentual_incremento).replace('.', ','),
      observacao: a.observacao ?? '',
      fotos: a.fotos.map((f: any) => ({ caminho: f.caminho, legenda: f.legenda ?? '', novaOuExistente: 'existente' as const })),
    })))
    setTela('formulario')
  }

  function abrirModalAtividade() {
    if (!empresaId) return
    window.api.obraDiario.percentuaisAcumulados(empresaId).then(setAcumulados)
    setNovoItemId('')
    setNovoIncremento('')
    setNovaObservacao('')
    setNovasFotos([])
    setModalAtividadeAberto(true)
  }

  async function handleSelecionarFotos() {
    const caminhos: string[] = await window.api.obraDiario.selecionarFotos()
    setNovasFotos(prev => [...prev, ...caminhos.map(c => ({ caminho: c, legenda: '', novaOuExistente: 'nova' as const }))])
  }

  function handleAdicionarAtividade() {
    if (!novoItemId) { toast.error('Escolha um item da EAP.'); return }
    const incremento = Number(novoIncremento.replace(',', '.')) || 0
    if (incremento <= 0) { toast.error('Informe quanto foi executado hoje.'); return }
    setAtividades(prev => [...prev, {
      eap_item_id: Number(novoItemId), percentual_incremento: novoIncremento,
      observacao: novaObservacao, fotos: novasFotos,
    }])
    setModalAtividadeAberto(false)
  }

  function removerAtividade(index: number) {
    setAtividades(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSalvar() {
    if (!empresaId) return
    if (atividades.length === 0) { toast.error('Lance ao menos uma atividade antes de salvar.'); return }
    setSalvando(true)
    try {
      await window.api.obraDiario.salvar({
        id: diarioId ?? undefined,
        empresa_id: empresaId,
        data, clima: clima || null, condicao_trabalho: condicaoTrabalho,
        mao_de_obra_presente: maoDeObra || null, ocorrencias: ocorrencias || null,
        criado_por: usuario?.nome ?? null, criado_por_usuario_id: usuario?.id ?? null,
        atividades: atividades.map(a => ({
          eap_item_id: a.eap_item_id,
          percentual_incremento: Number(a.percentual_incremento.replace(',', '.')) || 0,
          observacao: a.observacao || null,
          fotos: a.fotos.map(f => ({ caminho: f.caminho, legenda: f.legenda || null })),
        })),
      })
      toast.success('Diário de Obra salvo.')
      setTela('lista')
      carregarLista()
    } catch {
      toast.error('Erro ao salvar o Diário de Obra.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluirDiario(d: DiarioResumo) {
    const ok = await confirm({
      title: 'Excluir Diário de Obra', danger: true,
      message: `Deseja excluir o diário de ${formatDataBR(d.data)}? As fotos e o percentual lançado nele somem junto.`,
    })
    if (!ok) return
    try {
      await window.api.obraDiario.excluir(d.id)
      toast.success('Excluído.')
      carregarLista()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  // ── Tela: lista de diários ──────────────────────────────
  if (tela === 'lista') {
    return (
      <div>
        <PageHeader title="Diário de Obra" subtitle="Registro diário de atividades, percentual executado e fotos">
          <Button icon={<Plus size={15} />} onClick={abrirNovoDiario}>Novo Diário</Button>
        </PageHeader>

        {loadingLista ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 shimmer rounded-xl" />)}</div>
        ) : diarios.length === 0 ? (
          <div className="py-16 text-center bg-surface border border-surface-border rounded-xl">
            <CloudSun size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">Nenhum Diário de Obra registrado ainda.</p>
          </div>
        ) : (
          <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
            {diarios.map(d => (
              <div key={d.id} className="flex items-center justify-between px-4 py-3 border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                <button onClick={() => abrirDiarioExistente(d.id)} className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-white">{formatDataBR(d.data)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {d.clima ?? 'Clima não informado'} · {d.quantidade_atividades} atividade{d.quantidade_atividades !== 1 && 's'} lançada{d.quantidade_atividades !== 1 && 's'}
                  </p>
                </button>
                <button onClick={() => handleExcluirDiario(d)} title="Excluir" className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Tela: formulário do dia ─────────────────────────────
  return (
    <div>
      <button onClick={() => setTela('lista')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 mb-4 transition-colors">
        <ArrowLeft size={14} /> Voltar
      </button>

      <PageHeader title={diarioId ? `Diário de ${formatDataBR(data)}` : 'Novo Diário de Obra'} subtitle="Preencha o cabeçalho do dia e lance as atividades executadas">
        <Button icon={<Plus size={15} />} onClick={handleSalvar} loading={salvando}>Salvar Diário</Button>
      </PageHeader>

      <div className="bg-surface border border-surface-border rounded-xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Data" type="date" value={data} onChange={e => setData(e.target.value)} disabled={!!diarioId} />
        <Select label="Clima" value={clima} onChange={e => setClima(e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...CLIMAS.map(c => ({ value: c, label: c }))]} />
        <Select label="Condição de trabalho" value={condicaoTrabalho} onChange={e => setCondicaoTrabalho(e.target.value)}
          options={[{ value: 'praticavel', label: 'Praticável' }, { value: 'impraticavel', label: 'Impraticável' }]} />
        <Input label="Mão de obra presente" value={maoDeObra} onChange={e => setMaoDeObra(e.target.value)} placeholder="Ex: 12 pedreiros, 4 serventes, 2 eletricistas" />
        <div className="md:col-span-2 flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">Ocorrências</label>
          <textarea className="input resize-none" rows={2} value={ocorrencias} onChange={e => setOcorrencias(e.target.value)} placeholder="Chuva à tarde, falta de material, etc." />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-200">Atividades do dia</p>
        <Button variant="outline" icon={<Plus size={14} />} onClick={abrirModalAtividade}>Adicionar Atividade</Button>
      </div>

      {atividades.length === 0 ? (
        <div className="py-10 text-center bg-surface border border-surface-border rounded-xl text-sm text-gray-500">
          Nenhuma atividade lançada ainda hoje.
        </div>
      ) : (
        <div className="space-y-2.5">
          {atividades.map((a, i) => {
            const item = folhas.find(f => f.id === a.eap_item_id)
            return (
              <div key={i} className="bg-surface border border-surface-border rounded-xl px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item?.caminho ?? '—'}</p>
                    <p className="text-xs text-brand-400 mt-0.5">+ {a.percentual_incremento}% executado hoje</p>
                    {a.observacao && <p className="text-xs text-gray-500 mt-1">{a.observacao}</p>}
                  </div>
                  <button onClick={() => removerAtividade(i)} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
                {a.fotos.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {a.fotos.map((f, fi) => <FotoThumb key={fi} foto={f} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal — adicionar atividade */}
      <Modal open={modalAtividadeAberto} onClose={() => setModalAtividadeAberto(false)} title="Adicionar Atividade" size="md">
        <div className="space-y-4">
          <Select label="Item da EAP" value={novoItemId} onChange={e => setNovoItemId(Number(e.target.value))}
            options={[{ value: '', label: 'Selecione o item...' }, ...folhas.map(f => ({ value: String(f.id), label: f.caminho }))]} />
          {novoItemId !== '' && (
            <p className="text-xs text-gray-500 -mt-2">
              Já executado até agora: <span className="text-gray-300 font-semibold">{(acumulados[Number(novoItemId)] ?? 0).toFixed(1)}%</span>
            </p>
          )}
          <Input label="Percentual executado HOJE (%)" value={novoIncremento} onChange={e => setNovoIncremento(e.target.value)} placeholder="Ex: 5" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-400">Observação (opcional)</label>
            <textarea className="input resize-none" rows={2} value={novaObservacao} onChange={e => setNovaObservacao(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-2">Fotos do serviço</label>
            <Button variant="outline" icon={<Camera size={14} />} onClick={handleSelecionarFotos}>Selecionar Fotos</Button>
            {novasFotos.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {novasFotos.map((f, fi) => (
                  <div key={fi} className="relative">
                    <FotoThumb foto={f} />
                    <button
                      onClick={() => setNovasFotos(prev => prev.filter((_, x) => x !== fi))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
          <Button variant="ghost" onClick={() => setModalAtividadeAberto(false)}>Cancelar</Button>
          <Button onClick={handleAdicionarAtividade}>Adicionar</Button>
        </div>
      </Modal>

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}

// Miniatura de uma foto — local (file://) ou já enviada (busca URL
// assinada na hora, já que o bucket é privado).
function FotoThumb({ foto }: { foto: FotoLocal }) {
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (foto.novaOuExistente === 'nova') {
      setUrl(`file://${foto.caminho}`)
    } else {
      window.api.obraDiario.urlFoto(foto.caminho).then(setUrl).catch(() => setErro(true))
    }
  }, [foto.caminho, foto.novaOuExistente])

  if (erro || !url) {
    return (
      <div className="w-16 h-16 rounded-lg bg-surface-hover border border-surface-border flex items-center justify-center">
        <ImageOff size={16} className="text-gray-600" />
      </div>
    )
  }
  return (
    <img
      src={url}
      onError={() => setErro(true)}
      className="w-16 h-16 rounded-lg object-cover border border-surface-border"
      alt={foto.legenda || 'Foto do serviço'}
    />
  )
}
