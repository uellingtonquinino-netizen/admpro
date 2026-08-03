import { useState, useEffect } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import Input                  from '@components/ui/Input'
import { gerarHtmlSaidaAlmoxarifado } from '../../documentos/saidaAlmoxarifado'
import { Search, FileText, Save, UserPlus } from 'lucide-react'

interface ColaboradorResumo { id: number; nome: string; funcao?: string | null }
interface ProdutoResumo { id: number; codigo: string; nome: string; unidade: string | null; estoque_atual: number }

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

// NOVO: registra a saída/retirada de um produto do almoxarifado —
// desconta do estoque e gera o comprovante de retirada com assinatura.
export default function NovaSaidaModal({ onClose, onSaved }: Props) {
  const empresa  = useEmpresaStore(s => s.empresa)
  const usuario  = useAuthStore(s => s.usuario)

  const [data, setData] = useState(hoje())

  // Produto
  const [codigo, setCodigo]           = useState('')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [produtos, setProdutos]       = useState<ProdutoResumo[]>([])
  const [produtoSel, setProdutoSel]   = useState<ProdutoResumo | null>(null)
  const [sugestoesProdutoAbertas, setSugestoesProdutoAbertas] = useState(false)
  const [quantidade, setQuantidade]   = useState('')

  // Retirado por
  const [colaboradores, setColaboradores] = useState<ColaboradorResumo[]>([])
  const [buscaRetirou, setBuscaRetirou]   = useState('')
  const [retirouSel, setRetirouSel]       = useState<ColaboradorResumo | null>(null)
  const [sugestoesRetirouAbertas, setSugestoesRetirouAbertas] = useState(false)
  const [naoColaborador, setNaoColaborador] = useState(false)
  const [avulsoNome, setAvulsoNome]   = useState('')
  const [avulsoCpf, setAvulsoCpf]     = useState('')
  const [setor, setSetor]             = useState('')

  // Solicitado por
  const [buscaSolicitou, setBuscaSolicitou] = useState('')
  const [solicitouSel, setSolicitouSel]     = useState<ColaboradorResumo | null>(null)
  const [sugestoesSolicitouAbertas, setSugestoesSolicitouAbertas] = useState(false)

  const [salvando, setSalvando]   = useState(false)
  const [gerando, setGerando]     = useState(false)

  useEffect(() => {
    if (!empresa) return
    window.api.colaboradores.listarResumo(empresa.id).then(setColaboradores)
    window.api.produtos.listar({ empresa_id: empresa.id }).then(setProdutos)
  }, [empresa])

  // ── Produto: busca por código (exato) ────────────────────
  async function buscarPorCodigo() {
    if (!codigo.trim() || !empresa) return
    const produto = await window.api.produtos.buscarPorCodigo({ empresa_id: empresa.id, codigo: codigo.trim() })
    if (produto) {
      selecionarProduto(produto)
    } else {
      toast.error('Nenhum material/ferramenta com esse código.')
    }
  }

  function selecionarProduto(p: ProdutoResumo) {
    setProdutoSel(p)
    setCodigo(p.codigo)
    setBuscaProduto(p.nome)
    setSugestoesProdutoAbertas(false)
  }

  const sugestoesProduto = buscaProduto && !produtoSel
    ? produtos.filter(p => p.nome.toLowerCase().includes(buscaProduto.toLowerCase())).slice(0, 8)
    : []

  // ── Retirado por (colaborador) ───────────────────────────
  async function selecionarRetirou(c: ColaboradorResumo) {
    setRetirouSel(c)
    setBuscaRetirou(c.nome)
    setSugestoesRetirouAbertas(false)
    const completo = await window.api.colaboradores.buscarPorId(c.id)
    setSetor(completo?.setor ?? '')
  }

  const sugestoesRetirou = buscaRetirou && !retirouSel
    ? colaboradores.filter(c => c.nome.toLowerCase().includes(buscaRetirou.toLowerCase())).slice(0, 8)
    : []

  // ── Solicitado por (colaborador) ─────────────────────────
  function selecionarSolicitou(c: ColaboradorResumo) {
    setSolicitouSel(c)
    setBuscaSolicitou(c.nome)
    setSugestoesSolicitouAbertas(false)
  }

  const sugestoesSolicitou = buscaSolicitou && !solicitouSel
    ? colaboradores.filter(c => c.nome.toLowerCase().includes(buscaSolicitou.toLowerCase())).slice(0, 8)
    : []

  function validar(): boolean {
    if (!produtoSel) { toast.error('Selecione o material/ferramenta (por código ou nome).'); return false }
    if (!quantidade || Number(quantidade.toString().replace(',', '.')) <= 0) { toast.error('Informe a quantidade.'); return false }
    if (naoColaborador ? !avulsoNome.trim() : !retirouSel) { toast.error('Informe quem retirou.'); return false }
    return true
  }

  async function montarEregistrar(): Promise<number | null> {
    if (!validar() || !empresa) return null

    let retiradoPorTipo: 'colaborador' | 'avulso' = 'colaborador'
    let retiradoPorId: number | null = null
    let retiradoPorNome = ''

    if (naoColaborador) {
      const { id } = await window.api.pessoasAvulsas.criar({
        empresa_id: empresa.id, nome: avulsoNome.trim(), cpf: avulsoCpf || null,
      })
      retiradoPorTipo = 'avulso'
      retiradoPorId = id
      retiradoPorNome = avulsoNome.trim()
    } else {
      retiradoPorId = retirouSel!.id
      retiradoPorNome = retirouSel!.nome
    }

    const { id } = await window.api.almoxarifadoSaidas.criar({
      empresa_id:          empresa.id,
      data,
      produto_id:          produtoSel!.id,
      produto_codigo:      produtoSel!.codigo,
      produto_nome:        produtoSel!.nome,
      quantidade:          Number(quantidade.toString().replace(',', '.')),
      retirado_por_tipo:   retiradoPorTipo,
      retirado_por_id:     retiradoPorId,
      retirado_por_nome:   retiradoPorNome,
      setor:               setor || null,
      solicitado_por_id:   solicitouSel?.id ?? null,
      solicitado_por_nome: solicitouSel?.nome ?? null,
      liberado_por:        usuario?.nome ?? null,
    })
    return id
  }

  async function handleSalvar() {
    setSalvando(true)
    try {
      const id = await montarEregistrar()
      if (id === null) return
      toast.success('Saída registrada — estoque atualizado.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar a saída.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleImprimirSalvar() {
    if (!validar() || !empresa) return
    setGerando(true)
    try {
      const id = await montarEregistrar()
      if (id === null) return

      const html = gerarHtmlSaidaAlmoxarifado({
        logoUrl:            empresa.logo_url,
        empresaNome:        empresa.nome,
        data,
        produtoCodigo:      produtoSel!.codigo,
        produtoNome:        produtoSel!.nome,
        quantidade:         Number(quantidade.toString().replace(',', '.')),
        unidade:            produtoSel!.unidade,
        retiradoPorNome:    naoColaborador ? avulsoNome.trim() : retirouSel!.nome,
        setor,
        solicitadoPorNome:  solicitouSel?.nome ?? null,
        liberadoPor:        usuario?.nome ?? null,
      })

      const result = await window.api.documentos.imprimir({
        html,
        nomeArquivo: `Retirada - ${produtoSel!.nome}`,
      })
      if (!result.ok) toast.error('Erro ao abrir a impressão.')

      toast.success('Saída registrada — estoque atualizado.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar a saída.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Nova Saída" size="lg">
      <div className="space-y-4">
        <Input label="Data" type="date" value={data} onChange={e => setData(e.target.value)} className="w-40" />

        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Input
            label="Código do material/ferramenta"
            value={codigo}
            onChange={e => { setCodigo(e.target.value); setProdutoSel(null) }}
            onBlur={buscarPorCodigo}
          />
          <div className="relative">
            <Input
              label="Material/Ferramenta"
              icon={<Search size={14} />}
              value={buscaProduto}
              onChange={e => { setBuscaProduto(e.target.value); setProdutoSel(null); setSugestoesProdutoAbertas(true) }}
              onFocus={() => setSugestoesProdutoAbertas(true)}
              placeholder="Digite para buscar…"
            />
            {sugestoesProdutoAbertas && sugestoesProduto.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {sugestoesProduto.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selecionarProduto(p)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                  >
                    {p.nome} <span className="text-xs text-gray-500 ml-1">({p.codigo}) — estoque: {p.estoque_atual}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Input label="Quantidade" value={quantidade} onChange={e => setQuantidade(e.target.value)} className="w-40" placeholder="0" />

        {/* Retirado por */}
        <div className="border-t border-surface-border pt-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-400">Retirado por</label>
            <button
              type="button"
              onClick={() => { setNaoColaborador(v => !v); setRetirouSel(null); setBuscaRetirou(''); setSetor('') }}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <UserPlus size={12} /> {naoColaborador ? 'Buscar colaborador' : 'Não é colaborador'}
            </button>
          </div>

          {naoColaborador ? (
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Nome" value={avulsoNome} onChange={e => setAvulsoNome(e.target.value)} />
              <Input placeholder="CPF (opcional)" value={avulsoCpf} onChange={e => setAvulsoCpf(e.target.value)} />
            </div>
          ) : (
            <div className="relative">
              <Input
                icon={<Search size={14} />}
                value={buscaRetirou}
                onChange={e => { setBuscaRetirou(e.target.value); setRetirouSel(null); setSugestoesRetirouAbertas(true); setSetor('') }}
                onFocus={() => setSugestoesRetirouAbertas(true)}
                placeholder="Digite para buscar…"
              />
              {sugestoesRetirouAbertas && sugestoesRetirou.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {sugestoesRetirou.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selecionarRetirou(c)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                    >
                      {c.nome} {c.funcao && <span className="text-xs text-gray-500 ml-1">({c.funcao})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <Input
            label="Setor"
            value={setor}
            onChange={e => setSetor(e.target.value)}
            className="mt-3"
            placeholder={naoColaborador ? 'Informe o setor' : 'Preenchido pelo cadastro do colaborador'}
          />
        </div>

        {/* Solicitado por */}
        <div className="relative">
          <Input
            label="Solicitado por"
            icon={<Search size={14} />}
            value={buscaSolicitou}
            onChange={e => { setBuscaSolicitou(e.target.value); setSolicitouSel(null); setSugestoesSolicitouAbertas(true) }}
            onFocus={() => setSugestoesSolicitouAbertas(true)}
            placeholder="Digite para buscar…"
          />
          {sugestoesSolicitouAbertas && sugestoesSolicitou.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {sugestoesSolicitou.map(c => (
                <button
                  key={c.id}
                  onClick={() => selecionarSolicitou(c)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
                >
                  {c.nome} {c.funcao && <span className="text-xs text-gray-500 ml-1">({c.funcao})</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <Input label="Liberado por" value={usuario?.nome ?? ''} disabled />
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando || gerando}>
          Cancelar
        </Button>
        <Button variant="outline" icon={<Save size={14} />} onClick={handleSalvar} loading={salvando} disabled={gerando}>
          Salvar
        </Button>
        <Button icon={<FileText size={14} />} onClick={handleImprimirSalvar} loading={gerando} disabled={salvando}>
          Imprimir / Salvar
        </Button>
      </div>
    </Modal>
  )
}
