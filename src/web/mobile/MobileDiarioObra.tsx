import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { apiWeb } from '../api-web'

interface Props {
  empresaIds: number[]
}

interface EapItemBanco {
  id: number; parent_id: number | null; nome: string; valor_orcado: number
}
interface FotoExistente { caminho: string; legenda: string }
interface FotoNova { arquivo: File; legenda: string; previewUrl: string }
interface AtividadeForm {
  eap_item_id: number
  percentual_incremento: string
  observacao: string
  fotos: (FotoExistente | FotoNova)[]
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
function ehFotoNova(f: FotoExistente | FotoNova): f is FotoNova {
  return 'arquivo' in f
}

// Miniatura de uma foto — usa a preview local se for nova (ainda não
// subiu), ou busca uma URL assinada se já foi salva (o bucket é
// privado, precisa de link temporário pra abrir).
function FotoThumb({ foto, tamanho = 'w-16 h-16' }: { foto: FotoExistente | FotoNova; tamanho?: string }) {
  const [url, setUrl] = useState<string | null>(ehFotoNova(foto) ? foto.previewUrl : null)

  useEffect(() => {
    if (!ehFotoNova(foto)) {
      apiWeb.obraDiario.urlFoto(foto.caminho).then(setUrl).catch(() => setUrl(null))
    }
  }, [foto])

  if (!url) return <div className={`${tamanho} rounded-lg bg-surface-hover border border-surface-border`} />
  return <img src={url} className={`${tamanho} rounded-lg object-cover border border-surface-border`} alt="" />
}

// Achata a EAP e monta o "caminho" (Fase > Item > Sub-item) de cada
// item-folha — só folhas fazem sentido pra lançar percentual.
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

// NOVO: Diário de Obra pelo celular — mesma coisa que o Gestor já faz
// no programa, só que direto em campo. A grande diferença é a foto:
// aqui dá pra usar a câmera do celular direto (sem precisar tirar a
// foto antes e depois anexar) ou escolher da galeria.
export default function MobileDiarioObra({ empresaIds }: Props) {
  const empresaId = empresaIds[0] // Gestor sempre com 1 obra ativa por vez (igual as outras abas)

  const [tela, setTela] = useState<'lista' | 'formulario' | 'nova-atividade'>('lista')
  const [diarios, setDiarios] = useState<DiarioResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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

  const [novoItemId, setNovoItemId] = useState<number | ''>('')
  const [novoIncremento, setNovoIncremento] = useState('')
  const [novaObservacao, setNovaObservacao] = useState('')
  const [novasFotos, setNovasFotos] = useState<(FotoExistente | FotoNova)[]>([])

  const inputCameraRef = useRef<HTMLInputElement>(null)
  const inputGaleriaRef = useRef<HTMLInputElement>(null)

  const carregarLista = useCallback(() => {
    if (!empresaId) return
    setCarregando(true)
    setErro(null)
    apiWeb.obraDiario.listar(empresaId)
      .then(setDiarios)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setCarregando(false))
  }, [empresaId])

  useEffect(() => { carregarLista() }, [carregarLista])

  useEffect(() => {
    if (!empresaId) return
    apiWeb.obraEap.listar(empresaId).then(setEapItens).catch(() => {})
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
    const d = await apiWeb.obraDiario.buscarPorId(id)
    if (!d) { alert('Diário não encontrado.'); return }
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
      fotos: a.fotos.map((f: any) => ({ caminho: f.caminho, legenda: f.legenda ?? '' })),
    })))
    setTela('formulario')
  }

  function abrirNovaAtividade() {
    if (empresaId) apiWeb.obraDiario.percentuaisAcumulados(empresaId).then(setAcumulados)
    setNovoItemId('')
    setNovoIncremento('')
    setNovaObservacao('')
    setNovasFotos([])
    setTela('nova-atividade')
  }

  // NOVO: as duas formas de foto — câmera (abre direto, sem galeria)
  // e galeria (escolhe arquivo já existente, pode escolher vários).
  function handleFotosSelecionadas(arquivos: FileList | null) {
    if (!arquivos) return
    const novas: FotoNova[] = Array.from(arquivos).map(arquivo => ({
      arquivo, legenda: '', previewUrl: URL.createObjectURL(arquivo),
    }))
    setNovasFotos(prev => [...prev, ...novas])
  }

  function removerFotoNova(index: number) {
    setNovasFotos(prev => {
      const alvo = prev[index]
      if (ehFotoNova(alvo)) URL.revokeObjectURL(alvo.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handleAdicionarAtividade() {
    if (!novoItemId) { alert('Escolha um item da EAP.'); return }
    const incremento = Number(novoIncremento.replace(',', '.')) || 0
    if (incremento <= 0) { alert('Informe quanto foi executado hoje.'); return }
    setAtividades(prev => [...prev, {
      eap_item_id: Number(novoItemId), percentual_incremento: novoIncremento,
      observacao: novaObservacao, fotos: novasFotos,
    }])
    setTela('formulario')
  }

  function removerAtividade(index: number) {
    setAtividades(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSalvar() {
    if (!empresaId) return
    if (atividades.length === 0) { alert('Lance ao menos uma atividade antes de salvar.'); return }
    setSalvando(true)
    try {
      await apiWeb.obraDiario.salvar({
        id: diarioId ?? undefined,
        empresa_id: empresaId,
        data, clima: clima || null, condicao_trabalho: condicaoTrabalho,
        mao_de_obra_presente: maoDeObra || null, ocorrencias: ocorrencias || null,
        criado_por: null, criado_por_usuario_id: null,
        atividades: atividades.map(a => ({
          eap_item_id: a.eap_item_id,
          percentual_incremento: Number(a.percentual_incremento.replace(',', '.')) || 0,
          observacao: a.observacao || null,
          fotos: a.fotos.map(f => ehFotoNova(f) ? { arquivo: f.arquivo, legenda: f.legenda || null } : { caminho: f.caminho, legenda: f.legenda || null }),
        })),
      })
      setTela('lista')
      carregarLista()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar o Diário de Obra.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluirDiario(d: DiarioResumo) {
    if (!confirm(`Excluir o diário de ${formatDataBR(d.data)}?`)) return
    try {
      await apiWeb.obraDiario.excluir(d.id)
      carregarLista()
    } catch {
      alert('Erro ao excluir.')
    }
  }

  // ── Tela: lista de diários ──────────────────────────────
  if (tela === 'lista') {
    return (
      <div className="pb-24">
        <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
          <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Diário de Obra</h1>
          <p className="text-[12.5px] text-gray-500 mt-0.5">Registro diário de atividades e fotos</p>
        </header>

        <main className="px-4 pt-3 max-w-[480px] mx-auto">
          {erro && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3 mb-3">{erro}</p>}

          <button
            onClick={abrirNovoDiario}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-2xl py-3.5 mb-4"
          >
            + Novo Diário de Hoje
          </button>

          {carregando ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-surface border border-surface-border animate-pulse" />)}</div>
          ) : diarios.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-16">Nenhum Diário de Obra registrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {diarios.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-2xl px-4 py-3">
                  <button onClick={() => abrirDiarioExistente(d.id)} className="flex-1 text-left min-w-0">
                    <p className="text-sm font-semibold text-gray-100">{formatDataBR(d.data)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {d.clima ?? 'Clima não informado'} · {d.quantidade_atividades} atividade{d.quantidade_atividades !== 1 && 's'}
                    </p>
                  </button>
                  <button onClick={() => handleExcluirDiario(d)} className="p-2 text-gray-500 shrink-0">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    )
  }

  // ── Tela: nova atividade ─────────────────────────────────
  if (tela === 'nova-atividade') {
    return (
      <div className="pb-24">
        <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
          <button onClick={() => setTela('formulario')} className="text-sm text-gray-400 mb-1">← Voltar</button>
          <h1 className="text-[17px] font-extrabold text-gray-100 m-0">Nova Atividade</h1>
        </header>

        <main className="px-4 pt-3 max-w-[480px] mx-auto space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Item da EAP</label>
            <select
              value={novoItemId}
              onChange={e => setNovoItemId(e.target.value ? Number(e.target.value) : '')}
              className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100"
            >
              <option value="">Selecione o item...</option>
              {folhas.map(f => <option key={f.id} value={f.id}>{f.caminho}</option>)}
            </select>
            {novoItemId !== '' && (
              <p className="text-xs text-gray-500 mt-1.5">
                Já executado até agora: <span className="text-gray-300 font-semibold">{(acumulados[Number(novoItemId)] ?? 0).toFixed(1)}%</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Percentual executado HOJE (%)</label>
            <input
              type="text" inputMode="decimal" value={novoIncremento} onChange={e => setNovoIncremento(e.target.value)}
              placeholder="Ex: 5" className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Observação (opcional)</label>
            <textarea
              value={novaObservacao} onChange={e => setNovaObservacao(e.target.value)} rows={2}
              className="w-full bg-surface border border-surface-border rounded-xl px-3.5 py-3 text-sm text-gray-100 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fotos do serviço</label>
            <div className="flex gap-2">
              <button
                onClick={() => inputCameraRef.current?.click()}
                className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-3"
              >
                📷 Tirar Foto
              </button>
              <button
                onClick={() => inputGaleriaRef.current?.click()}
                className="flex-1 bg-surface-hover border border-surface-border text-gray-200 text-xs font-bold rounded-xl py-3"
              >
                🖼️ Da Galeria
              </button>
            </div>
            {/* capture="environment" força a câmera traseira a abrir
                direto, sem passar pela galeria — só 1 foto por vez. */}
            <input
              ref={inputCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { handleFotosSelecionadas(e.target.files); e.target.value = '' }}
            />
            {/* sem "capture" abre o seletor normal (galeria), pode
                escolher várias de uma vez. */}
            <input
              ref={inputGaleriaRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { handleFotosSelecionadas(e.target.files); e.target.value = '' }}
            />

            {novasFotos.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {novasFotos.map((f, i) => (
                  <div key={i} className="relative w-16 h-16">
                    <FotoThumb foto={f} />
                    <button
                      onClick={() => removerFotoNova(i)}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center text-white text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleAdicionarAtividade}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-2xl py-3.5 mt-2"
          >
            Adicionar Atividade
          </button>
        </main>
      </div>
    )
  }

  // ── Tela: formulário do dia ──────────────────────────────
  return (
    <div className="pb-24">
      <header className="sticky top-0 z-10 bg-[#0f172a]/95 backdrop-blur px-4 pt-4 pb-3 border-b border-surface-border" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
        <button onClick={() => setTela('lista')} className="text-sm text-gray-400 mb-1">← Voltar</button>
        <h1 className="text-[17px] font-extrabold text-gray-100 m-0">
          {diarioId ? `Diário de ${formatDataBR(data)}` : 'Novo Diário de Obra'}
        </h1>
      </header>

      <main className="px-4 pt-3 max-w-[480px] mx-auto space-y-3">
        <div className="bg-surface border border-surface-border rounded-2xl p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Data</label>
            <input
              type="date" value={data} onChange={e => setData(e.target.value)} disabled={!!diarioId}
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Clima</label>
            <select value={clima} onChange={e => setClima(e.target.value)} className="w-full bg-surface-hover border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100">
              <option value="">Selecione</option>
              {CLIMAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Condição de trabalho</label>
            <select value={condicaoTrabalho} onChange={e => setCondicaoTrabalho(e.target.value)} className="w-full bg-surface-hover border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100">
              <option value="praticavel">Praticável</option>
              <option value="impraticavel">Impraticável</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Mão de obra presente</label>
            <input
              value={maoDeObra} onChange={e => setMaoDeObra(e.target.value)} placeholder="Ex: 12 pedreiros, 4 serventes"
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Ocorrências</label>
            <textarea
              value={ocorrencias} onChange={e => setOcorrencias(e.target.value)} rows={2}
              className="w-full bg-surface-hover border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-gray-100 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-200">Atividades do dia</p>
          <button onClick={abrirNovaAtividade} className="text-xs font-bold text-brand-400">+ Adicionar</button>
        </div>

        {atividades.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-8 bg-surface border border-surface-border rounded-2xl">Nenhuma atividade lançada ainda hoje.</p>
        ) : (
          <div className="space-y-2">
            {atividades.map((a, i) => {
              const item = folhas.find(f => f.id === a.eap_item_id)
              return (
                <div key={i} className="bg-surface border border-surface-border rounded-2xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{item?.caminho ?? '—'}</p>
                      <p className="text-xs text-brand-400 mt-0.5">+ {a.percentual_incremento}% hoje</p>
                      {a.observacao && <p className="text-xs text-gray-500 mt-1">{a.observacao}</p>}
                    </div>
                    <button onClick={() => removerAtividade(i)} className="text-gray-500 shrink-0">🗑️</button>
                  </div>
                  {a.fotos.length > 0 && (
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                      {a.fotos.map((f, fi) => (
                        <FotoThumb key={fi} foto={f} tamanho="w-14 h-14" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-bold rounded-2xl py-3.5 mt-2"
        >
          {salvando ? 'Salvando…' : 'Salvar Diário'}
        </button>
      </main>
    </div>
  )
}
