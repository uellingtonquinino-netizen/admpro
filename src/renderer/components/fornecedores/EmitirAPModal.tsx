import { useEffect, useState, useRef } from 'react'
import { useEmpresaStore }              from '@store/empresa.store'
import { toast }                        from '@components/ui/ToastContainer'
import Modal                            from '@components/ui/Modal'
import Button                           from '@components/ui/Button'
import Input                            from '@components/ui/Input'
import Select                           from '@components/ui/Select'
import { gerarHtmlAP }                  from '../../documentos/ap'
import { formatCPF, formatCNPJ }        from '../../utils/documentValidators'
import FornecedorModal                  from './FornecedorModal'
import { Search, FileText, Plus, Trash2, Save, Paperclip, ChevronUp, ChevronDown, FileSignature } from 'lucide-react'

type TipoBeneficiario = 'fornecedor' | 'colaborador'

interface BeneficiarioResumo {
  id:     number
  nome:   string
  cnpj?:  string | null
  cpf?:   string | null
  funcao?: string | null
}

interface Boleto {
  valor:      string
  vencimento: string
}

interface Anexo {
  nome:    string
  caminho: string
}

const BOLETO_VAZIO: Boleto = { valor: '', vencimento: '' }

interface Props {
  onClose:              () => void
  beneficiarioInicial?: { tipo: TipoBeneficiario; id: number }
}

// ALTERADO: agora aceita vários boletos (valor + vencimento) numa
// AP só, igual à Nota Fiscal — o mesmo fornecedor pode ter mais de
// um boleto, e o valor total lançado é a soma de todos.
export default function EmitirAPModal({ onClose, beneficiarioInicial }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)

  const [tipo, setTipo] = useState<TipoBeneficiario>(beneficiarioInicial?.tipo ?? 'fornecedor')
  const [lista, setLista] = useState<BeneficiarioResumo[]>([])
  const [busca, setBusca] = useState('')
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false)
  const [selecionado, setSelecionado] = useState<BeneficiarioResumo | null>(null)
  const buscaRef = useRef<HTMLDivElement>(null)

  const [descricao, setDescricao]     = useState('')
  const [boletos, setBoletos]         = useState<Boleto[]>([{ ...BOLETO_VAZIO }])
  const [dadosBancarios, setDadosBancarios] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [autorizadoPor, setAutorizadoPor] = useState('')
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [gerandoComAnexos, setGerandoComAnexos] = useState(false)
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  // ── Carrega lista de beneficiários conforme o tipo ──────
  useEffect(() => {
    if (!empresa) return
    setSelecionado(null)
    setBusca('')
    if (tipo === 'fornecedor') {
      window.api.fornecedores.listarResumo(empresa.id).then(setLista)
    } else {
      window.api.colaboradores.listarResumo(empresa.id).then(setLista)
    }
  }, [tipo, empresa])

  // ── Pré-seleciona beneficiário se veio de um atalho ─────
  useEffect(() => {
    if (!beneficiarioInicial || lista.length === 0) return
    const b = lista.find(l => l.id === beneficiarioInicial.id)
    if (b) selecionarBeneficiario(b)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista])

  useEffect(() => {
    setSolicitante(empresa?.solicitante_padrao ?? '')
    setAutorizadoPor(empresa?.autorizado_por_padrao ?? '')
  }, [empresa])

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setSugestoesAbertas(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function selecionarBeneficiario(b: BeneficiarioResumo) {
    setSelecionado(b)
    setBusca(b.nome)
    setSugestoesAbertas(false)

    // Dados bancários a partir do cadastro
    if (tipo === 'fornecedor') {
      const f = await window.api.fornecedores.buscarPorId(b.id)
      setDadosBancarios(
        f.forma_pagamento === 'boleto'
          ? 'Boleto'
          : `${f.banco ?? ''} — Ag: ${f.agencia ?? ''} Op: ${f.operacao ?? ''} C/C: ${f.conta ?? ''}-${f.conta_digito ?? ''}${f.chave_pix ? ` · PIX: ${f.chave_pix}` : ''}`
      )
    } else {
      const c = await window.api.colaboradores.buscarPorId(b.id)
      setDadosBancarios(
        c.banco
          ? `${c.banco} — Ag: ${c.agencia ?? ''} Op: ${c.operacao ?? ''} C/C: ${c.conta ?? ''}-${c.conta_digito ?? ''}`
          : ''
      )
    }

    // Puxa a última AP emitida para esse beneficiário (descrição + boletos)
    try {
      const ultima = await window.api.ap.buscarUltima({ beneficiario_tipo: tipo, beneficiario_id: b.id })
      if (ultima && ultima.boletos?.length > 0) {
        setDescricao(ultima.descricao ?? '')
        setBoletos(ultima.boletos.map((bl: { valor: number; vencimento: string }) => ({
          valor: String(bl.valor), vencimento: bl.vencimento,
        })))
      } else {
        setDescricao('')
        setBoletos([{ ...BOLETO_VAZIO }])
      }
    } catch {
      setDescricao('')
      setBoletos([{ ...BOLETO_VAZIO }])
    }
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

  const total = boletos.reduce((soma, b) => soma + (Number(b.valor.toString().replace(',', '.')) || 0), 0)
  const ehBoleto = dadosBancarios.trim().toLowerCase() === 'boleto'

  const sugestoes = busca && !selecionado
    ? lista.filter(b => b.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : []

  // ALTERADO: agora dá pra só salvar (sem abrir a impressão na hora) —
  // útil pra imprimir várias APs de uma vez depois, direto na lista.
  async function handleGerar(imprimir: boolean) {
    if (!selecionado) { toast.error('Selecione o fornecedor ou colaborador.'); return }
    if (boletos.some(b => !b.valor || !b.vencimento)) {
      toast.error('Preencha valor e vencimento em todas as linhas.')
      return
    }
    if (!empresa) return

    const setBusy = imprimir ? setGerando : setSalvando
    setBusy(true)
    try {
      const boletosNumericos = boletos.map(b => ({
        valor:      Number(b.valor.toString().replace(',', '.')),
        vencimento: b.vencimento,
      }))

      // CORRIGIDO: busca a empresa atualizada direto do banco (inclusive a
      // logo), em vez de usar o valor em cache da store. Antes só
      // gerava esse HTML quando ia imprimir — agora sempre gera,
      // porque também é usado pra salvar a cópia interna com anexos.
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      const documento = tipo === 'fornecedor'
        ? (selecionado.cnpj ? `CNPJ: ${formatCNPJ(selecionado.cnpj)}` : `CPF: ${formatCPF(selecionado.cpf) || '—'}`)
        : `CPF: ${formatCPF(selecionado.cpf) || '—'}`

      const html = gerarHtmlAP({
        centroCusto:      empresaAtual.razao_social || empresaAtual.nome,
        logoUrl:          empresaAtual.logo_url,
        beneficiarioNome: selecionado.nome,
        documento,
        descricao,
        boletos:          boletosNumericos,
        boleto:           ehBoleto,
        dadosBancariosTexto: dadosBancarios,
        observacoes,
        solicitante,
        autorizadoPor,
      })

      const temAnexos = anexos.length > 0

      // ALTERADO: quando tem anexos, não manda mais só a AP pra
      // impressão direta — em vez disso, gera o arquivo já juntado
      // (AP + anexos) e abre ele pronto, igual aos outros dois botões
      // já faziam. Isso deixa os três botões consistentes: sempre que
      // tem anexo, o que abre/imprime já vem completo.
      if (imprimir && !temAnexos) {
        const result = await window.api.documentos.imprimir({
          html,
          nomeArquivo: `AP - ${selecionado.nome}`,
        })
        if (!result.ok) { toast.error('Erro ao abrir a impressão.'); return }
      }

      const { id } = await window.api.ap.registrar({
        empresa_id:         empresa.id,
        beneficiario_tipo:  tipo,
        beneficiario_id:    selecionado.id,
        beneficiario_nome:  selecionado.nome,
        descricao,
        boletos:            boletosNumericos,
        observacoes,
        solicitante,
        autorizado_por:     autorizadoPor,
        anexos:             anexos.map(a => a.caminho),
      })

      // Se tem anexos, salva uma cópia pronta (AP + anexos já
      // juntados) numa pasta própria do programa, e — se o botão foi
      // o de imprimir — já abre ela pra imprimir dali.
      if (temAnexos) {
        const caminho = await salvarCopiaInterna(id, html)
        if (imprimir && caminho) {
          const resultado = await window.api.documentos.abrirArquivo(caminho)
          if (!resultado.ok) toast.error('AP salva, mas não consegui abrir o arquivo pra impressão.')
        }
      }

      if (!imprimir) toast.success('AP salva. Você pode imprimi-la depois na lista.')
      onClose()
    } catch {
      toast.error('Erro ao gerar a Autorização de Pagamento.')
    } finally {
      setBusy(false)
    }
  }

  // Salva a cópia interna (AP + anexos) e vincula o caminho à AP.
  async function salvarCopiaInterna(apId: number, html: string): Promise<string | null> {
    try {
      const resultado = await window.api.documentos.salvarPdfInterno({
        html,
        nomeArquivo: `AP - ${selecionado?.nome ?? ''}`,
        anexos:      anexos.map(a => a.caminho),
        pastaId:     `AP_${apId}`,
      })
      if (resultado.ok) {
        await window.api.ap.salvarCaminhoPdf({ id: apId, pdf_path: resultado.filePath })
        return resultado.filePath
      }
      return null
    } catch {
      // Não trava o fluxo principal — a AP já foi salva, só a cópia
      // interna pronta pra reimpressão que pode ter falhado.
      return null
    }
  }

  // ── Anexos (nota/recibo, boletos, medição etc.) ─────────
  function handleSelecionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    const novos: Anexo[] = arquivos.map(f => ({
      nome:    f.name,
      caminho: (f as unknown as { path: string }).path,
    }))
    setAnexos(prev => [...prev, ...novos])
    e.target.value = ''
  }

  function removerAnexo(i: number) {
    setAnexos(prev => prev.filter((_, idx) => idx !== i))
  }

  function moverAnexo(i: number, direcao: -1 | 1) {
    setAnexos(prev => {
      const novo = [...prev]
      const alvo = i + direcao
      if (alvo < 0 || alvo >= novo.length) return prev
      ;[novo[i], novo[alvo]] = [novo[alvo], novo[i]]
      return novo
    })
  }

  // NOVO: gera a AP já em PDF de verdade, juntando na sequência os
  // documentos anexados (nota/recibo, boletos, medição) — um PDF só
  // por AP, na ordem que a empresa já usa pra escanear/enviar.
  async function handleGerarComAnexos() {
    if (!selecionado) { toast.error('Selecione o fornecedor ou colaborador.'); return }
    if (boletos.some(b => !b.valor || !b.vencimento)) {
      toast.error('Preencha valor e vencimento em todas as linhas.')
      return
    }
    if (!empresa) return

    setGerandoComAnexos(true)
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      const documento = tipo === 'fornecedor'
        ? (selecionado.cnpj ? `CNPJ: ${formatCNPJ(selecionado.cnpj)}` : `CPF: ${formatCPF(selecionado.cpf) || '—'}`)
        : `CPF: ${formatCPF(selecionado.cpf) || '—'}`

      const boletosNumericos = boletos.map(b => ({
        valor:      Number(b.valor.toString().replace(',', '.')),
        vencimento: b.vencimento,
      }))

      const html = gerarHtmlAP({
        centroCusto:      empresaAtual.razao_social || empresaAtual.nome,
        logoUrl:          empresaAtual.logo_url,
        beneficiarioNome: selecionado.nome,
        documento,
        descricao,
        boletos:          boletosNumericos,
        boleto:           ehBoleto,
        dadosBancariosTexto: dadosBancarios,
        observacoes,
        solicitante,
        autorizadoPor,
      })

      const result = await window.api.documentos.gerarPdfComAnexos({
        html,
        nomeArquivo: `AP - ${selecionado.nome}`,
        anexos:      anexos.map(a => a.caminho),
      })

      if (result.canceled) return
      if (!result.ok) { toast.error('Erro ao gerar o PDF.'); return }

      const { id } = await window.api.ap.registrar({
        empresa_id:         empresa.id,
        beneficiario_tipo:  tipo,
        beneficiario_id:    selecionado.id,
        beneficiario_nome:  selecionado.nome,
        descricao,
        boletos:            boletosNumericos,
        observacoes,
        solicitante,
        autorizado_por:     autorizadoPor,
        anexos:             anexos.map(a => a.caminho),
      })
      // Vincula o arquivo que já foi gerado/salvo — evita gerar de
      // novo, reaproveita o mesmo PDF que o usuário acabou de escolher
      // onde salvar.
      await window.api.ap.salvarCaminhoPdf({ id, pdf_path: result.filePath })
      toast.success('PDF gerado com os anexos e AP salva.')
      onClose()
    } catch {
      toast.error('Erro ao gerar o PDF com os anexos.')
    } finally {
      setGerandoComAnexos(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Emitir Autorização de Pagamento" size="lg">
      <div className="space-y-4">
        <Select
          label="Beneficiário é"
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoBeneficiario)}
          options={[
            { value: 'fornecedor', label: 'Fornecedor / Empreiteiro / Prestador' },
            { value: 'colaborador', label: 'Colaborador (ajuda de custo, diária etc.)' },
          ]}
        />

        {/* Busca com autocomplete */}
        <div className="relative" ref={buscaRef}>
          <Input
            label={tipo === 'fornecedor' ? 'Fornecedor' : 'Colaborador'}
            icon={<Search size={14} />}
            value={busca}
            onChange={e => { setBusca(e.target.value); setSelecionado(null); setSugestoesAbertas(true) }}
            onFocus={() => setSugestoesAbertas(true)}
            placeholder="Digite para buscar…"
          />
          {sugestoesAbertas && sugestoes.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-surface-border
                            rounded-lg shadow-xl max-h-56 overflow-y-auto">
              {sugestoes.map(b => (
                <button
                  key={b.id}
                  onClick={() => selecionarBeneficiario(b)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-200
                             hover:bg-surface-hover transition-colors"
                >
                  {b.nome}
                  <span className="text-xs text-gray-500 ml-2">
                    {b.cnpj || b.cpf || b.funcao || ''}
                  </span>
                </button>
              ))}
            </div>
          )}
          {tipo === 'fornecedor' && (
            <button
              type="button"
              onClick={() => setNovoFornecedorOpen(true)}
              className="mt-1.5 text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <Plus size={12} /> Novo fornecedor
            </button>
          )}
        </div>

        {selecionado && (
          <>
            <Input label="Centro de Custo" value={empresa?.nome ?? ''} disabled />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-400">Descrição dos serviços / materiais</label>
              <textarea
                className="input resize-none"
                rows={2}
                value={descricao}
                onChange={e => setDescricao(e.target.value.toUpperCase())}
              />
            </div>

            {/* Boletos/Parcelas — o nome muda conforme a forma de
                pagamento do beneficiário: "Boletos" se ele recebe por
                boleto, "Parcelas" se é por conta bancária. */}
            <div className="border-t border-surface-border pt-4">
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
                Valores e vencimentos ({ehBoleto ? 'um por boleto' : 'uma por parcela'})
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
                {ehBoleto ? 'Adicionar boleto' : 'Adicionar parcela'}
              </Button>

              <div className="flex justify-end mt-4 pt-3 border-t border-surface-border">
                <p className="text-sm text-gray-300">
                  Valor total: <span className="text-lg font-semibold text-white">
                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </p>
              </div>
            </div>

            <Input label="Dados bancários" value={dadosBancarios} onChange={e => setDadosBancarios(e.target.value)} />
            <Input label="Observações" value={observacoes} onChange={e => setObservacoes(e.target.value)} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Solicitante" value={solicitante} onChange={e => setSolicitante(e.target.value)} />
              <Input label="Autorizado por" value={autorizadoPor} onChange={e => setAutorizadoPor(e.target.value)} />
            </div>

            {/* NOVO: anexar nota/recibo, boletos, medição etc. — a AP
                sai como um PDF só, com esses documentos juntados na
                sequência escolhida. */}
            <div className="border-t border-surface-border pt-4">
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-2">
                Anexar documentos (nota/recibo, boletos, medição…)
              </p>
              <input
                ref={inputArquivoRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleSelecionarArquivos}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Paperclip size={13} />}
                onClick={() => inputArquivoRef.current?.click()}
              >
                Escolher arquivos
              </Button>

              {anexos.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {anexos.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-hover">
                      <span className="text-xs text-gray-500 w-4 shrink-0">{i + 1}.</span>
                      <span className="text-sm text-gray-200 truncate flex-1">{a.nome}</span>
                      <button onClick={() => moverAnexo(i, -1)} disabled={i === 0} className="p-1 text-gray-500 hover:text-gray-200 disabled:opacity-30">
                        <ChevronUp size={13} />
                      </button>
                      <button onClick={() => moverAnexo(i, 1)} disabled={i === anexos.length - 1} className="p-1 text-gray-500 hover:text-gray-200 disabled:opacity-30">
                        <ChevronDown size={13} />
                      </button>
                      <button onClick={() => removerAnexo(i)} className="p-1 text-gray-500 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 mt-1">
                    A AP sai primeiro, seguida destes documentos nessa ordem.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={gerando || salvando}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          icon={<Save size={14} />}
          onClick={() => handleGerar(false)}
          loading={salvando}
          disabled={!selecionado || gerando}
        >
          Apenas Salvar
        </Button>
        {anexos.length > 0 && (
          <Button
            variant="outline"
            icon={<FileSignature size={14} />}
            onClick={handleGerarComAnexos}
            loading={gerandoComAnexos}
            disabled={!selecionado || gerando || salvando}
          >
            Gerar PDF com anexos
          </Button>
        )}
        <Button
          icon={<FileText size={14} />}
          onClick={() => handleGerar(true)}
          loading={gerando}
          disabled={!selecionado || salvando}
        >
          Imprimir / Salvar AP
        </Button>
      </div>

      {novoFornecedorOpen && (
        <FornecedorModal
          open={novoFornecedorOpen}
          onClose={() => setNovoFornecedorOpen(false)}
          onSaved={async () => {
            setNovoFornecedorOpen(false)
            if (empresa) {
              const lista = await window.api.fornecedores.listarResumo(empresa.id)
              setLista(lista)
              const criado = lista[lista.length - 1]
              if (criado) selecionarBeneficiario(criado)
            }
          }}
        />
      )}
    </Modal>
  )
}
