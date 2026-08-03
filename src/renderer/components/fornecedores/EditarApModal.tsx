import { useState, useEffect } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }     from '@components/ui/ToastContainer'
import Modal         from '@components/ui/Modal'
import Button        from '@components/ui/Button'
import Input         from '@components/ui/Input'
import { gerarHtmlAP }           from '../../documentos/ap'
import { formatCPF, formatCNPJ } from '../../utils/documentValidators'
import { Plus, Trash2 } from 'lucide-react'

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
  boletos:            { valor: number; vencimento: string }[]
  anexos?:            string[]
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
      })

      // NOVO: se essa AP tem anexos, a cópia pronta pra reimpressão
      // (AP + anexos) precisa ser refeita com os valores atualizados —
      // senão continuaria mostrando os dados de antes da edição.
      if (registro.anexos && registro.anexos.length > 0 && empresa) {
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
      })

      const resultado = await window.api.documentos.salvarPdfInterno({
        html,
        nomeArquivo: `AP - ${nome}`,
        anexos:      registro.anexos,
        pastaId:     `AP_${registro.id}`,
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
        <Input label="Beneficiário" value={nome} onChange={e => setNome(e.target.value)} />

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
