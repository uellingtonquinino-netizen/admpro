import { useState, useEffect, useRef } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }     from '@components/ui/ToastContainer'
import Modal         from '@components/ui/Modal'
import Button        from '@components/ui/Button'
import Input         from '@components/ui/Input'
import { gerarHtmlAP }           from '../../documentos/ap'
import { formatCPF, formatCNPJ } from '../../utils/documentValidators'
import { Plus, Trash2, Paperclip, ChevronUp, ChevronDown } from 'lucide-react'

interface Anexo {
  nome:    string
  caminho: string
  vaiAssinatura: boolean
}

interface Boleto {
  valor:      string
  vencimento: string
}

interface ApRegistro {
  id:                 number
  beneficiario_tipo:  'fornecedor' | 'colaborador'
  beneficiario_id:    number
  beneficiario_nome:  string
  descricao:          string | null
  observacoes:        string | null
  solicitante:        string | null
  autorizado_por:     string | null
  data_emissao?:      string | null
  boletos:            { valor: number; vencimento: string }[]
  anexos?:            { caminho: string; vaiAssinatura: boolean }[]
}

interface Props {
  registro: ApRegistro
  onClose:  () => void
  onSaved:  () => void
}

const BOLETO_VAZIO: Boleto = { valor: '', vencimento: '' }

// ALTERADO: agora edita vários boletos (valor + vencimento) de uma
// vez, igual à Nota Fiscal — antes só existia um valor/vencimento
// único por AP. Também descobre se o beneficiário é pago por boleto
// ou conta bancária, pra chamar certo ("Boletos" ou "Parcelas").
export default function EditarApModal({ registro, onClose, onSaved }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)
  const [nome, setNome]               = useState(registro.beneficiario_nome)
  const [descricao, setDescricao]     = useState(registro.descricao ?? '')
  const [dataEmissao, setDataEmissao] = useState(registro.data_emissao?.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  // NOVO: anexos agora dá pra adicionar/remover/reordenar na edição
  // (antes só era possível na hora de criar) — os que já existiam
  // (supabase://... ou caminho local, dependendo do provedor) entram
  // com um nome derivado do próprio caminho, já que o nome original
  // do arquivo não fica guardado em lugar nenhum.
  const [anexos, setAnexos] = useState<Anexo[]>(
    (registro.anexos ?? []).map(item => ({
      nome: item.caminho.split(/[\\/]/).pop() ?? item.caminho,
      caminho: item.caminho,
      vaiAssinatura: item.vaiAssinatura,
    }))
  )
  const [boletos, setBoletos]         = useState<Boleto[]>(
    registro.boletos.length > 0
      ? registro.boletos.map(b => ({ valor: String(b.valor), vencimento: b.vencimento }))
      : [{ ...BOLETO_VAZIO }]
  )
  const [observacoes, setObservacoes] = useState(registro.observacoes ?? '')
  const [solicitante, setSolicitante] = useState(registro.solicitante ?? '')
  const [autorizadoPor, setAutorizadoPor] = useState(registro.autorizado_por ?? '')
  const [salvando, setSalvando]       = useState(false)
  const [ehBoleto, setEhBoleto]       = useState(false)
  const inputArquivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (registro.beneficiario_tipo !== 'fornecedor') return
    window.api.fornecedores.buscarPorId(registro.beneficiario_id).then(f => {
      setEhBoleto(f?.forma_pagamento === 'boleto')
    })
  }, [registro.beneficiario_tipo, registro.beneficiario_id])

  function setBoleto(i: number, campo: keyof Boleto, valor: string) {
    setBoletos(prev => prev.map((b, idx) => (idx === i ? { ...b, [campo]: valor } : b)))
  }

  function adicionarBoleto() {
    setBoletos(prev => [...prev, { ...BOLETO_VAZIO }])
  }

  function removerBoleto(i: number) {
    setBoletos(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Anexos (nota/recibo, boletos, medição etc.) ─────────
  function handleSelecionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    const novos: Anexo[] = arquivos.map(f => ({
      nome:    f.name,
      caminho: (f as unknown as { path: string }).path,
      vaiAssinatura: false,
    }))
    setAnexos(prev => [...prev, ...novos])
    e.target.value = ''
  }

  // NOVO: marca esse anexo pra também receber o carimbo de quem
  // aprovar a AP (canto inferior direito).
  function alternarVaiAssinatura(i: number) {
    setAnexos(prev => prev.map((a, idx) => (idx === i ? { ...a, vaiAssinatura: !a.vaiAssinatura } : a)))
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

  const total = boletos.reduce((soma, b) => soma + (Number(b.valor.toString().replace(',', '.')) || 0), 0)

  async function handleSalvar() {
    if (!nome.trim()) { toast.error('Informe o nome do beneficiário.'); return }
    if (boletos.some(b => !b.valor || !b.vencimento)) {
      toast.error('Preencha valor e vencimento em todas as linhas.')
      return
    }

    setSalvando(true)
    try {
      await window.api.ap.atualizar({
        id: registro.id,
        beneficiario_nome: nome,
        descricao,
        boletos: boletos.map(b => ({
          valor:      Number(b.valor.toString().replace(',', '.')),
          vencimento: b.vencimento,
        })),
        observacoes,
        solicitante,
        autorizado_por: autorizadoPor,
        data_emissao: dataEmissao,
        anexos: anexos.map(a => ({ caminho: a.caminho, vaiAssinatura: a.vaiAssinatura })),
      })

      // NOVO: sempre regenera a cópia pronta pra reimpressão ao
      // salvar uma edição — com anexo ou sem (antes só regenerava se
      // sobrasse pelo menos 1 anexo; apagar todos deixava a AP sem
      // PDF pronto até a próxima vez que alguém clicasse Imprimir).
      if (empresa) {
        await regenerarPdfComAnexos()
      }

      toast.success('Autorização de Pagamento atualizada.')
      onSaved()
    } catch {
      toast.error('Erro ao salvar as alterações.')
    } finally {
      setSalvando(false)
    }
  }

  async function regenerarPdfComAnexos() {
    if (!empresa) return
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)
      // NOVO: busca o estado de aprovação ATUAL da AP — se ela já foi
      // aprovada (por Gestor/ADM e/ou Supervisor), o carimbo
      // correspondente precisa continuar aparecendo mesmo depois de
      // uma edição. Antes essa função nunca buscava isso, e qualquer
      // edição que disparasse a regeneração (mexer nos anexos) saía
      // sem carimbo nenhum, mesmo numa AP já aprovada.
      const completa = await window.api.ap.buscarPorId(registro.id)

      let documento = ''
      let banco: string | null = null, agencia: string | null = null
      let conta: string | null = null, contaDigito: string | null = null
      let ehBoleto = false
      if (registro.beneficiario_tipo === 'fornecedor') {
        const f = await window.api.fornecedores.buscarPorId(registro.beneficiario_id)
        documento = f.cnpj ? `CNPJ: ${formatCNPJ(f.cnpj)}` : `CPF: ${formatCPF(f.cpf) || '—'}`
        ehBoleto = f.forma_pagamento === 'boleto'
        banco = f.banco ?? null; agencia = f.agencia ?? null
        conta = f.conta ?? null; contaDigito = f.conta_digito ?? null
      } else {
        const c = await window.api.colaboradores.buscarPorId(registro.beneficiario_id)
        documento = `CPF: ${formatCPF(c.cpf) || '—'}`
        banco = c.banco ?? null; agencia = c.agencia ?? null
        conta = c.conta ?? null; contaDigito = c.conta_digito ?? null
      }

      const html = gerarHtmlAP({
        centroCusto:      empresaAtual.razao_social || empresaAtual.nome,
        logoUrl:          empresaAtual.logo_url,
        beneficiarioNome: nome,
        documento,
        descricao,
        boletos:          boletos.map(b => ({
          valor:      Number(b.valor.toString().replace(',', '.')),
          vencimento: b.vencimento,
        })),
        boleto:           ehBoleto,
        banco, agencia, conta, contaDigito,
        observacoes,
        solicitante,
        autorizadoPor,
        dataEmissao:      dataEmissao.split('-').reverse().join('/'),
        // NOVO: carimbo de quem já aprovou a AP (se já aprovada),
        // pra não sumir numa edição posterior.
        carimboUrl:       completa.aprovado_por_carimbo_url ?? null,
      })

      const resultado = await window.api.documentos.salvarPdfInterno({
        html,
        nomeArquivo: `AP - ${nome}`,
        anexos:      anexos.map(a => ({ caminho: a.caminho, vaiAssinatura: a.vaiAssinatura })),
        pastaId:     `AP_${registro.id}`,
        empresa_id:  empresa.id,
        // NOVO: mesmo carimbo pros anexos marcados "Vai Assinatura" —
        // só existe se a AP já tiver sido aprovada por alguém.
        carimbo: completa.aprovado_por
          ? { aprovadoPor: completa.aprovado_por, aprovadoEm: completa.aprovado_em, carimboBase64: completa.aprovado_por_carimbo_url ?? null }
          : undefined,
      })
      if (resultado.ok) {
        await window.api.ap.salvarCaminhoPdf({ id: registro.id, pdf_path: resultado.filePath })
      }
    } catch {
      // A edição já foi salva — só a cópia pronta pra reimpressão que
      // pode não ter sido atualizada; não trava o fluxo por isso.
    }
  }

  return (
    <Modal open onClose={onClose} title="Editar Autorização de Pagamento" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_160px] gap-4">
          <Input label="Beneficiário" value={nome} onChange={e => setNome(e.target.value)} />
          <Input label="Data de Emissão" type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-400">Descrição dos serviços / materiais</label>
          <textarea
            className="input resize-none"
            rows={2}
            value={descricao}
            onChange={e => setDescricao(e.target.value.toUpperCase())}
          />
        </div>

        {/* Boletos/Parcelas */}
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

        <Input label="Observações" value={observacoes} onChange={e => setObservacoes(e.target.value)} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Solicitante" value={solicitante} onChange={e => setSolicitante(e.target.value)} />
          <Input label="Autorizado por" value={autorizadoPor} onChange={e => setAutorizadoPor(e.target.value)} />
        </div>

        {/* NOVO: anexos agora dá pra mexer aqui também — antes só na
            hora de criar a AP. */}
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
                  <label
                    title="Esse anexo também recebe o carimbo de quem aprovar a AP"
                    className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={a.vaiAssinatura}
                      onChange={() => alternarVaiAssinatura(i)}
                      className="accent-brand-500"
                    />
                    Vai Assinatura
                  </label>
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
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} loading={salvando}>
          Salvar alterações
        </Button>
      </div>
    </Modal>
  )
}
