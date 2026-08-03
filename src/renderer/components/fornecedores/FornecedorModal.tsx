import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import Select                   from '@components/ui/Select'
import { formatCPF, formatCNPJ } from '@utils/documentValidators'

interface Fornecedor {
  id: number
  [key: string]: unknown
}

interface Props {
  open:        boolean
  onClose:     () => void
  onSaved:     () => void
  fornecedor?: Fornecedor | null
}

interface FormData {
  nome:            string
  tipo_pessoa:     'pj' | 'pf'
  cnpj:            string
  cpf:             string
  email:           string
  telefone:        string
  endereco:        string
  categoria:       string
  forma_pagamento: 'boleto' | 'conta'
  banco:           string
  agencia:         string
  operacao:        string
  conta:           string
  conta_digito:    string
  tipo_conta:      string
  chave_pix:       string
  ativo:           boolean
}

const EMPTY: FormData = {
  nome: '', tipo_pessoa: 'pj', cnpj: '', cpf: '', email: '', telefone: '',
  endereco: '', categoria: '', forma_pagamento: 'boleto', banco: '',
  agencia: '', operacao: '', conta: '', conta_digito: '', tipo_conta: 'corrente',
  chave_pix: '', ativo: true,
}

export default function FornecedorModal({ open, onClose, onSaved, fornecedor }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const [form, setForm]       = useState<FormData>(EMPTY)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    if (fornecedor) {
      const f = fornecedor as Record<string, unknown>
      const next = { ...EMPTY }
      for (const key of Object.keys(EMPTY) as (keyof FormData)[]) {
        const v = f[key]
        if (key === 'ativo') {
          ;(next[key] as boolean) = v === undefined ? true : !!v
        } else if (v !== null && v !== undefined) {
          ;(next[key] as string) = String(v)
        }
      }
      setForm(next)
    } else {
      setForm(EMPTY)
    }
  }, [open, fornecedor])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.nome.trim()) { toast.error('Informe o nome/razão social.'); return }
    if (!empresaId) return

    setLoading(true)
    try {
      if (fornecedor) {
        await window.api.fornecedores.atualizar({ id: fornecedor.id, ...form })
        toast.success('Fornecedor atualizado.')
      } else {
        await window.api.fornecedores.criar({ empresa_id: empresaId, ...form })
        toast.success('Fornecedor cadastrado.')
      }
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Input
          label="Nome / Razão Social"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          className="md:col-span-2"
        />
        <Select
          label="Tipo"
          value={form.tipo_pessoa}
          onChange={e => set('tipo_pessoa', e.target.value as 'pj' | 'pf')}
          options={[
            { value: 'pj', label: 'Pessoa Jurídica (CNPJ)' },
            { value: 'pf', label: 'Pessoa Física / Autônomo (CPF)' },
          ]}
        />
        <Input
          label="Categoria (opcional)"
          value={form.categoria}
          onChange={e => set('categoria', e.target.value)}
          placeholder="Ex: Locação de equipamentos"
        />
        {form.tipo_pessoa === 'pj' ? (
          <Input label="CNPJ" value={form.cnpj} onChange={e => set('cnpj', formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
        ) : (
          <Input label="CPF" value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} placeholder="000.000.000-00" />
        )}
        <Input label="Telefone" value={form.telefone} onChange={e => set('telefone', e.target.value)} />
        <Input label="E-mail" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        <Input label="Endereço" value={form.endereco} onChange={e => set('endereco', e.target.value)} className="md:col-span-2" />
      </div>

      <div className="pt-3 border-t border-surface-border">
        <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
          Dados de pagamento
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Forma de pagamento"
            value={form.forma_pagamento}
            onChange={e => set('forma_pagamento', e.target.value as 'boleto' | 'conta')}
            options={[
              { value: 'boleto', label: 'Boleto' },
              { value: 'conta', label: 'Conta bancária / PIX' },
            ]}
            className="md:col-span-2"
          />

          {form.forma_pagamento === 'conta' && (
            <>
              <Input label="Banco" value={form.banco} onChange={e => set('banco', e.target.value)} />
              <Input label="Agência" value={form.agencia} onChange={e => set('agencia', e.target.value)} />
              <Input label="Operação" value={form.operacao} onChange={e => set('operacao', e.target.value)} />
              <Input label="Conta" value={form.conta} onChange={e => set('conta', e.target.value)} />
              <Input label="Dígito" value={form.conta_digito} onChange={e => set('conta_digito', e.target.value)} />
              <Select
                label="Tipo de conta"
                value={form.tipo_conta}
                onChange={e => set('tipo_conta', e.target.value)}
                options={[
                  { value: 'corrente', label: 'Corrente' },
                  { value: 'poupanca', label: 'Poupança' },
                ]}
              />
              <Input label="Chave PIX (opcional)" value={form.chave_pix} onChange={e => set('chave_pix', e.target.value)} className="md:col-span-2" />
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
        </Button>
      </div>
    </Modal>
  )
}
