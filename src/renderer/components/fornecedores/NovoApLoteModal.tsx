import { useState, useEffect, useRef } from 'react'
import { useEmpresaStore }              from '@store/empresa.store'
import { useAuthStore }                 from '@store/auth.store'
import { toast }                        from '@components/ui/ToastContainer'
import Modal                            from '@components/ui/Modal'
import Button                           from '@components/ui/Button'
import Input                            from '@components/ui/Input'
import { gerarCapaAPLote }              from '../../documentos/capaLote'
import { formatCPF, formatCNPJ }        from '../../utils/documentValidators'
import { Search, Plus, Trash2, Save } from 'lucide-react'

interface BeneficiarioResumo {
  id: number; nome: string; cnpj?: string | null; cpf?: string | null; tipo_pessoa?: string
}

interface ItemLote {
  tempId:             string
  beneficiario_tipo:  'fornecedor' | 'colaborador'
  beneficiario_id:    number | null
  nome:               string
  documento:          string
  descricao:          string
  valor:              string
  banco:              string
  agencia:            string
  operacao:           string
  conta:              string
  conta_digito:       string
  tipo_conta:         string
}

interface Props {
  onClose: () => void
  onSaved: () => void
}

// NOVO: Autorização de Pagamento em Lote — um documento só cobrindo
// vários fornecedores/colaboradores de uma vez, cada um com seu
// próprio valor (mas só 1 valor por pessoa, diferente da AP normal
// que aceita vários boletos). Mesmo fluxo de aprovação Gestor→
// Supervisor.
export default function NovoApLoteModal({ onClose, onSaved }: Props) {
  const empresa  = useEmpresaStore(s => s.empresa)
  const usuario  = useAuthStore(s => s.usuario)

  const [dataEmissao, setDataEmissao] = useState(() => new Date().toISOString().slice(0, 10))
  const [descricaoPadrao, setDescricaoPadrao] = useState('')
  const [solicitante, setSolicitante] = useState(empresa?.solicitante_padrao ?? '')
  const [autorizadoPor, setAutorizadoPor] = useState(empresa?.autorizado_por_padrao ?? '')

  const [fornecedores, setFornecedores] = useState<BeneficiarioResumo[]>([])
  const [colaboradores, setColaboradores] = useState<BeneficiarioResumo[]>([])
  const [busca, setBusca] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const buscaRef = useRef<HTMLDivElement>(null)

  const [itens, setItens] = useState<ItemLote[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!empresa) return
    window.api.fornecedores.listarResumo(empresa.id).then(setFornecedores)
    window.api.colaboradores.listarResumo(empresa.id).then(setColaboradores)
  }, [empresa])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setSugestoesAbertas(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Busca combinada — fornecedores e colaboradores juntos, cada um
  // marcado com uma etiqueta pra saber qual é qual na lista.
  const sugestoes = busca
    ? [
        ...fornecedores.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase())).map(f => ({ ...f, _tipo: 'fornecedor' as const })),
        ...colaboradores.filter(c => c.nome.toLowerCase().includes(busca.toLowerCase())).map(c => ({ ...c, _tipo: 'colaborador' as const })),
      ].slice(0, 10)
    : []

  async function adicionarBeneficiario(b: BeneficiarioResumo & { _tipo: 'fornecedor' | 'colaborador' }) {
    setBusca('')
    setSugestoesAbertas(false)
    // Busca os dados completos (bancários) só na hora de adicionar —
    // a lista de resumo não traz isso.
    const completo = b._tipo === 'fornecedor'
      ? await window.api.fornecedores.buscarPorId(b.id)
      : await window.api.colaboradores.buscarPorId(b.id)

    const documento = b._tipo === 'fornecedor'
      ? (completo?.cnpj ? formatCNPJ(completo.cnpj) : (completo?.cpf ? formatCPF(completo.cpf) : ''))
      : (completo?.cpf ? formatCPF(completo.cpf) : '')

    const novo: ItemLote = {
      tempId: `${Date.now()}-${Math.random()}`,
      beneficiario_tipo: b._tipo,
      beneficiario_id: b.id,
      nome: b.nome,
      documento,
      descricao: descricaoPadrao,
      valor: '',
      banco: completo?.banco ?? '',
      agencia: completo?.agencia ?? '',
      operacao: completo?.operacao ?? '',
      conta: completo?.conta ?? '',
      conta_digito: completo?.conta_digito ?? '',
      tipo_conta: completo?.tipo_conta ?? '',
    }
    setItens(prev => [...prev, novo])
  }

  function atualizarItem(tempId: string, campo: keyof ItemLote, valor: string) {
    setItens(prev => prev.map(i => (i.tempId === tempId ? { ...i, [campo]: valor } : i)))
  }

  function removerItem(tempId: string) {
    setItens(prev => prev.filter(i => i.tempId !== tempId))
  }

  const total = itens.reduce((soma, i) => soma + (Number(i.valor.toString().replace(',', '.')) || 0), 0)

  async function handleSalvar() {
    if (!empresa || !usuario) return
    if (itens.length === 0) { toast.error('Adicione ao menos um beneficiário.'); return }
    if (itens.some(i => !i.valor || Number(i.valor.toString().replace(',', '.')) <= 0)) {
      toast.error('Preencha o valor de todos os beneficiários.')
      return
    }

    setSalvando(true)
    try {
      const { id } = await window.api.apLote.criar({
        empresa_id: empresa.id,
        descricao: descricaoPadrao || null,
        data_emissao: dataEmissao,
        solicitante: solicitante || null,
        autorizado_por: autorizadoPor || null,
        criado_por: usuario.nome,
        criado_por_usuario_id: usuario.id,
        itens: itens.map((i, ordem) => ({
          ordem,
          beneficiario_tipo: i.beneficiario_tipo,
          beneficiario_id: i.beneficiario_id,
          nome: i.nome,
          documento: i.documento || null,
          descricao: i.descricao || null,
          valor: Number(i.valor.toString().replace(',', '.')),
          banco: i.banco || null,
          agencia: i.agencia || null,
          operacao: i.operacao || null,
          conta: i.conta || null,
          conta_digito: i.conta_digito || null,
          tipo_conta: i.tipo_conta || null,
        })),
      })

      // Já gera o documento na hora, pronto pra visualizar — mesmo
      // padrão da AP normal (se não aprovado ainda, sem carimbo).
      try {
        const titulo = `Pagamento em Lote #${id}`
        const html = gerarCapaAPLote(
          { nome: empresa.nome, logo_url: empresa.logo_url }, titulo, dataEmissao,
          itens.map((i, idx) => ({
            numero: idx + 1, nome: i.nome, documento: i.documento, descricao: i.descricao,
            valor: Number(i.valor.toString().replace(',', '.')),
            banco: i.banco, agencia: i.agencia, operacao: i.operacao, conta: i.conta, tipo_conta: i.tipo_conta,
          })),
          v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        )
        const resultado = await window.api.documentos.salvarPdfInterno({
          html, nomeArquivo: titulo, pastaId: `AP_LOTE_${id}`, empresa_id: empresa.id,
        })
        if (resultado.ok) await window.api.apLote.salvarCaminhoPdf({ id, pdf_path: resultado.filePath })
      } catch (erroDoc) {
        console.error('Erro ao gerar o documento do pagamento em lote:', erroDoc)
        // não trava o fluxo — o registro já foi criado, o documento pode ser gerado depois
      }

      toast.success('Pagamento em lote criado.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar o pagamento em lote.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Novo Pagamento em Lote" size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Data de Emissão" type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
          <Input label="Solicitante" value={solicitante} onChange={e => setSolicitante(e.target.value)} />
          <Input label="Autorizado por" value={autorizadoPor} onChange={e => setAutorizadoPor(e.target.value)} />
        </div>

        <Input
          label="Descrição padrão (aplicada a quem for adicionado a partir de agora — cada linha pode ser mudada depois)"
          value={descricaoPadrao}
          onChange={e => setDescricaoPadrao(e.target.value.toUpperCase())}
        />

        <div className="relative" ref={buscaRef}>
          <Input
            label="Adicionar beneficiário (fornecedor ou colaborador)"
            icon={<Search size={14} />}
            value={busca}
            onChange={e => { setBusca(e.target.value); setSugestoesAbertas(true) }}
            onFocus={() => setSugestoesAbertas(true)}
            placeholder="Digite para buscar…"
          />
          {sugestoesAbertas && sugestoes.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border rounded-lg shadow-xl max-h-56 overflow-y-auto">
              {sugestoes.map(b => (
                <button
                  key={`${b._tipo}-${b.id}`}
                  onClick={() => adicionarBeneficiario(b)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors flex items-center justify-between"
                >
                  <span>{b.nome}</span>
                  <span className="text-xs text-gray-500 ml-2">{b._tipo === 'fornecedor' ? 'Fornecedor' : 'Colaborador'}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {itens.length > 0 && (
          <div className="border border-surface-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-hover">
                  {['Nome', 'Documento', 'Descrição', 'Valor', 'Banco', 'Agência', 'Conta', 'Tipo Conta', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map(i => (
                  <tr key={i.tempId} className="border-b border-surface-border last:border-0">
                    <td className="px-3 py-2 text-sm text-white whitespace-nowrap">{i.nome}</td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">{i.documento || '—'}</td>
                    <td className="px-2 py-1.5 min-w-[180px]">
                      <input className="input !py-1.5 !text-sm w-full" value={i.descricao} onChange={e => atualizarItem(i.tempId, 'descricao', e.target.value.toUpperCase())} />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <input className="input !py-1.5 !text-sm w-full" placeholder="0,00" value={i.valor} onChange={e => atualizarItem(i.tempId, 'valor', e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">{i.banco || '—'}</td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">{i.agencia || '—'}</td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">{i.conta || '—'}{i.conta_digito ? `-${i.conta_digito}` : ''}</td>
                    <td className="px-3 py-2 text-sm text-gray-400 whitespace-nowrap">{i.tipo_conta || '—'}</td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => removerItem(i.tempId)} className="p-1 text-gray-500 hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-surface-border flex justify-end bg-surface-hover">
              <p className="text-sm text-gray-300">
                Total: <span className="text-lg font-semibold text-white">
                  {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </p>
            </div>
          </div>
        )}

        {itens.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8 border border-dashed border-surface-border rounded-xl">
            <Plus size={16} className="inline mb-0.5 mr-1" />
            Busque acima pra adicionar o primeiro beneficiário.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button icon={<Save size={14} />} onClick={handleSalvar} loading={salvando} disabled={itens.length === 0}>
          Criar Pagamento em Lote
        </Button>
      </div>
    </Modal>
  )
}
