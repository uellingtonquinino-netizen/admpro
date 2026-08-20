import { useEffect, useState, useRef } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import FornecedorModal          from '@components/fornecedores/FornecedorModal'
import { Search, Plus, Trash2, Save, Paperclip, ChevronUp, ChevronDown } from 'lucide-react'

interface FornecedorResumo {
  id:   number
  nome: string
  cnpj?: string | null
  cpf?:  string | null
}

interface Boleto {
  valor:      string
  vencimento: string
}

interface Anexo {
  nome:    string
  caminho: string
  // NOVO: só existe rodando na web — ver mesmo comentário em
  // EmitirAPModal.tsx (`.path` de um File só existe no Electron).
  arquivo?: File
}

interface NotaExistente {
  id: number
  numero_pedido: string | null
  data: string
  numero_nf: string | null
  data_emissao_nf: string | null
  fornecedor_id: number | null
  fornecedor_nome: string
  boletos: { valor: number; vencimento: string }[]
  anexos_nota?: string[]
  anexos_boletos?: string[]
}

interface Props {
  nota?:    NotaExistente | null
  onClose:  () => void
  onSaved:  () => void
}

const BOLETO_VAZIO: Boleto = { valor: '', vencimento: '' }

// ALTERADO: Nota Fiscal segue o mesmo padrão da Autorização de
// Pagamento (anexos + fluxo de aprovação do Gestor), mas sem gerar
// documento nenhum — a nota é física, escaneada. Anexa a nota e o(s)
// boleto(s) separadamente; ao salvar, cada categoria vira seu
// próprio PDF juntado.
export default function NotaFiscalModal({ nota, onClose, onSaved }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)

  const [numeroPedido, setNumeroPedido] = useState(nota?.numero_pedido ?? '')
  const [data, setData]                 = useState(nota?.data ?? new Date().toISOString().slice(0, 10))
  const [numeroNf, setNumeroNf]         = useState(nota?.numero_nf ?? '')
  // NOVO: data em que a NF física foi emitida — separada da data de
  // emissão do documento (acima). Só informativa: não entra no
  // filtro de período da tela, que continua usando a data de cima.
  const [dataEmissaoNf, setDataEmissaoNf] = useState(nota?.data_emissao_nf ?? '')

  const [fornecedores, setFornecedores] = useState<FornecedorResumo[]>([])
  const [buscaFornecedor, setBuscaFornecedor] = useState(nota?.fornecedor_nome ?? '')
  const [fornecedorSel, setFornecedorSel]     = useState<FornecedorResumo | null>(
    nota ? { id: nota.fornecedor_id ?? 0, nome: nota.fornecedor_nome } : null
  )
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false)
  const buscaRef = useRef<HTMLDivElement>(null)

  const [boletos, setBoletos] = useState<Boleto[]>(
    nota && nota.boletos.length > 0
      ? nota.boletos.map(b => ({ valor: String(b.valor), vencimento: b.vencimento }))
      : [{ ...BOLETO_VAZIO }]
  )

  // Anexos — nota física e boleto(s), separados.
  const [anexosNota, setAnexosNota] = useState<Anexo[]>(
    (nota?.anexos_nota ?? []).map(caminho => ({ nome: caminho.split(/[\\/]/).pop() ?? caminho, caminho }))
  )
  const [anexosBoletos, setAnexosBoletos] = useState<Anexo[]>(
    (nota?.anexos_boletos ?? []).map(caminho => ({ nome: caminho.split(/[\\/]/).pop() ?? caminho, caminho }))
  )
  const inputNotaRef   = useRef<HTMLInputElement>(null)
  const inputBoletoRef = useRef<HTMLInputElement>(null)

  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    window.api.fornecedores.listarResumo(empresaId).then(setFornecedores)
  }, [empresaId])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) setSugestoesAbertas(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const sugestoes = buscaFornecedor && !fornecedorSel
    ? fornecedores.filter(f => f.nome.toLowerCase().includes(buscaFornecedor.toLowerCase())).slice(0, 8)
    : []

  function selecionarFornecedor(f: FornecedorResumo) {
    setFornecedorSel(f)
    setBuscaFornecedor(f.nome)
    setSugestoesAbertas(false)
  }

  function setBoleto(i: number, campo: keyof Boleto, valor: string) {
    setBoletos(prev => prev.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b)))
  }

  function adicionarBoleto() {
    setBoletos(prev => [...prev, { ...BOLETO_VAZIO }])
  }

  function removerBoleto(i: number) {
    setBoletos(prev => prev.filter((_, idx) => idx !== i))
  }

  // Funções genéricas de anexo — usadas tanto pra Nota quanto pra Boleto.
  function handleSelecionarArquivos(
    e: React.ChangeEvent<HTMLInputElement>,
    setAnexos: React.Dispatch<React.SetStateAction<Anexo[]>>
  ) {
    const arquivos = Array.from(e.target.files ?? [])
    const novos: Anexo[] = arquivos.map(f => {
      const caminhoLocal = (f as unknown as { path?: string }).path
      return { nome: f.name, caminho: caminhoLocal ?? f.name, arquivo: caminhoLocal ? undefined : f }
    })
    setAnexos(prev => [...prev, ...novos])
    e.target.value = ''
  }

  function removerAnexo(i: number, setAnexos: React.Dispatch<React.SetStateAction<Anexo[]>>) {
    setAnexos(prev => prev.filter((_, idx) => idx !== i))
  }

  function moverAnexo(i: number, direcao: -1 | 1, setAnexos: React.Dispatch<React.SetStateAction<Anexo[]>>) {
    setAnexos(prev => {
      const novo = [...prev]
      const alvo = i + direcao
      if (alvo < 0 || alvo >= novo.length) return prev
      ;[novo[i], novo[alvo]] = [novo[alvo], novo[i]]
      return novo
    })
  }

  const total = boletos.reduce((soma, b) => soma + (Number(b.valor.toString().replace(',', '.')) || 0), 0)

  async function handleSalvar() {
    if (!empresaId) return
    if (!fornecedorSel && !buscaFornecedor.trim()) { toast.error('Selecione ou digite o fornecedor.'); return }
    if (!data) { toast.error('Informe a data.'); return }
    if (boletos.some(b => !b.valor || !b.vencimento)) {
      toast.error('Preencha valor e vencimento em todas as linhas.')
      return
    }

    setSalvando(true)
    try {
      // NOVO: rodando na web, cada anexo pode ter vindo como um File
      // de verdade (em vez de já ter um caminho, que só existe no
      // Electron) — resolve isso ANTES de montar qualquer coisa, pra
      // todo o resto do código continuar recebendo string simples,
      // igual sempre funcionou no desktop.
      async function resolverAnexos(lista: Anexo[]): Promise<Anexo[]> {
        if (!window.api.documentos.prepararAnexoWeb) return lista // desktop — .path já resolve sozinho
        return Promise.all(lista.map(async a => {
          if (!a.arquivo) return a
          const caminho = await window.api.documentos.prepararAnexoWeb!({ empresa_id: empresaId, pasta_id: 'notas-fiscais-temp', arquivo: a.arquivo })
          return { ...a, caminho }
        }))
      }
      const anexosNotaResolvidos = await resolverAnexos(anexosNota)
      const anexosBoletosResolvidos = await resolverAnexos(anexosBoletos)

      const payload = {
        empresa_id:      empresaId,
        numero_pedido:   numeroPedido,
        data,
        numero_nf:       numeroNf,
        data_emissao_nf: dataEmissaoNf || null,
        fornecedor_id:   fornecedorSel?.id || null,
        fornecedor_nome: fornecedorSel?.nome || buscaFornecedor,
        boletos: boletos.map(b => ({
          valor:      Number(b.valor.toString().replace(',', '.')),
          vencimento: b.vencimento,
        })),
        anexos_nota:    anexosNotaResolvidos.map(a => a.caminho),
        anexos_boletos: anexosBoletosResolvidos.map(a => a.caminho),
      }

      let notaId: number
      if (nota) {
        await window.api.notasFiscais.atualizar({ id: nota.id, ...payload })
        notaId = nota.id
        toast.success('Nota fiscal atualizada.')
      } else {
        const resultado = await window.api.notasFiscais.criar(payload)
        notaId = resultado.id
        toast.success('Nota fiscal lançada — despesa incluída no mês.')
      }

      // Se tem anexo em qualquer categoria, já gera os dois PDFs
      // (nota e boletos, cada um o seu) prontos pro Gestor visualizar.
      console.log('[DIAGNÓSTICO] anexosNotaResolvidos:', anexosNotaResolvidos)
      console.log('[DIAGNÓSTICO] anexosBoletosResolvidos:', anexosBoletosResolvidos)
      if (anexosNotaResolvidos.length > 0 || anexosBoletosResolvidos.length > 0) {
        const resultadoPdfs = await window.api.documentos.gerarPdfsSeparados({
          notaArquivos:   anexosNotaResolvidos.map(a => a.caminho),
          boletoArquivos: anexosBoletosResolvidos.map(a => a.caminho),
          pastaId:        `NF_${notaId}`,
          empresa_id:     empresaId,
        })
        console.log('[DIAGNÓSTICO] resultadoPdfs recebido na tela:', resultadoPdfs)
        if (resultadoPdfs.ok) {
          await window.api.notasFiscais.salvarCaminhosPdf({
            id: notaId,
            nota_pdf_path:    resultadoPdfs.notaPdfPath,
            boletos_pdf_path: resultadoPdfs.boletosPdfPath,
          })
        }
      }

      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar a nota fiscal.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={nota ? 'Editar Nota Fiscal' : 'Nova Nota Fiscal'} size="lg">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Input label="N° do Pedido" value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} />
        <Input label="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Input label="N° da NF" value={numeroNf} onChange={e => setNumeroNf(e.target.value)} />
        <Input
          label="Data de Emissão da NF"
          type="date"
          value={dataEmissaoNf}
          onChange={e => setDataEmissaoNf(e.target.value)}
        />
      </div>

      {/* Fornecedor */}
      <div className="relative mb-4" ref={buscaRef}>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Fornecedor"
              icon={<Search size={14} />}
              value={buscaFornecedor}
              onChange={e => { setBuscaFornecedor(e.target.value); setFornecedorSel(null); setSugestoesAbertas(true) }}
              onFocus={() => setSugestoesAbertas(true)}
              placeholder="Buscar no cadastro ou digitar um novo…"
            />
          </div>
          <Button variant="outline" icon={<Plus size={14} />} onClick={() => setNovoFornecedorOpen(true)}>
            Novo
          </Button>
        </div>
        {sugestoesAbertas && sugestoes.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border
                          rounded-lg shadow-xl max-h-48 overflow-y-auto">
            {sugestoes.map(f => (
              <button
                key={f.id}
                onClick={() => selecionarFornecedor(f)}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-surface-hover transition-colors"
              >
                {f.nome}
                <span className="text-xs text-gray-500 ml-2">{f.cnpj || f.cpf || ''}</span>
              </button>
            ))}
          </div>
        )}
        {!fornecedorSel && buscaFornecedor && (
          <p className="text-xs text-gray-500 mt-1">
            Não escolheu da lista — será salvo só o nome digitado, sem vincular a um cadastro.
          </p>
        )}
      </div>

      {/* Boletos */}
      <div className="border-t border-surface-border pt-4">
        <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
          Valores e vencimentos (um por boleto da nota)
        </p>
        <div className="space-y-2">
          {boletos.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <Input
                label={i === 0 ? 'Valor (R$)' : undefined}
                value={b.valor}
                onChange={e => setBoleto(i, 'valor', e.target.value)}
                placeholder="0,00"
              />
              <Input
                label={i === 0 ? 'Vencimento' : undefined}
                type="date"
                value={b.vencimento}
                onChange={e => setBoleto(i, 'vencimento', e.target.value)}
              />
              <Button
                variant="ghost"
                onClick={() => removerBoleto(i)}
                disabled={boletos.length === 1}
                icon={<Trash2 size={14} />}
              />
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={adicionarBoleto} className="mt-3">
          Adicionar boleto
        </Button>

        <div className="flex justify-end mt-4 pt-3 border-t border-surface-border">
          <p className="text-sm text-gray-300">
            Valor total da nota: <span className="text-lg font-semibold text-white">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
      </div>

      {/* Anexos — nota física e boleto(s), separados. Cada categoria
          vira o seu próprio PDF ao salvar. */}
      <div className="border-t border-surface-border pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
            Anexar Nota Fiscal (escaneada)
          </p>
          <input
            ref={inputNotaRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => handleSelecionarArquivos(e, setAnexosNota)}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            icon={<Paperclip size={13} />}
            onClick={() => inputNotaRef.current?.click()}
          >
            Escolher arquivos
          </Button>

          {anexosNota.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {anexosNota.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface-hover rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-300 truncate flex-1">{i + 1}. {a.nome}</span>
                  <button onClick={() => moverAnexo(i, -1, setAnexosNota)} disabled={i === 0} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => moverAnexo(i, 1, setAnexosNota)} disabled={i === anexosNota.length - 1} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                    <ChevronDown size={13} />
                  </button>
                  <button onClick={() => removerAnexo(i, setAnexosNota)} className="text-gray-500 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
            Anexar Boleto(s)
          </p>
          <input
            ref={inputBoletoRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={e => handleSelecionarArquivos(e, setAnexosBoletos)}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            icon={<Paperclip size={13} />}
            onClick={() => inputBoletoRef.current?.click()}
          >
            Escolher arquivos
          </Button>

          {anexosBoletos.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {anexosBoletos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface-hover rounded-lg px-2.5 py-1.5">
                  <span className="text-xs text-gray-300 truncate flex-1">{i + 1}. {a.nome}</span>
                  <button onClick={() => moverAnexo(i, -1, setAnexosBoletos)} disabled={i === 0} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                    <ChevronUp size={13} />
                  </button>
                  <button onClick={() => moverAnexo(i, 1, setAnexosBoletos)} disabled={i === anexosBoletos.length - 1} className="text-gray-500 hover:text-gray-200 disabled:opacity-30">
                    <ChevronDown size={13} />
                  </button>
                  <button onClick={() => removerAnexo(i, setAnexosBoletos)} className="text-gray-500 hover:text-red-400">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button icon={<Save size={14} />} onClick={handleSalvar} loading={salvando}>
          {nota ? 'Salvar alterações' : 'Lançar nota'}
        </Button>
      </div>

      {novoFornecedorOpen && (
        <FornecedorModal
          open={novoFornecedorOpen}
          onClose={() => setNovoFornecedorOpen(false)}
          onSaved={async () => {
            setNovoFornecedorOpen(false)
            if (empresaId) {
              const lista = await window.api.fornecedores.listarResumo(empresaId)
              setFornecedores(lista)
              const criado = lista[lista.length - 1]
              if (criado) selecionarFornecedor(criado)
            }
          }}
        />
      )}
    </Modal>
  )
}
