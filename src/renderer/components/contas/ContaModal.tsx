import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import { clsx }                 from 'clsx'

interface Conta {
  id:      number
  nome:    string
  tipo:    string
  saldo:   number
  banco:   string | null
  agencia: string | null
  numero:  string | null
  ativo:   number
}

interface Props {
  open:    boolean
  onClose: () => void
  onSaved: () => void
  conta?:  Conta | null
}

interface FormData {
  nome:    string
  tipo:    string
  saldo:   string
  banco:   string
  agencia: string
  numero:  string
  ativo:   boolean
}

const EMPTY: FormData = {
  nome:    '',
  tipo:    'corrente',
  saldo:   '0,00',
  banco:   '',
  agencia: '',
  numero:  '',
  ativo:   true,
}

const TIPOS = [
  { value: 'corrente',     label: 'Conta Corrente' },
  { value: 'poupanca',     label: 'Poupança'       },
  { value: 'cartao',       label: 'Cartão'         },
  { value: 'investimento', label: 'Investimento'   },
]

export default function ContaModal({
  open, onClose, onSaved, conta,
}: Props) {
  const empresaId      = useEmpresaStore(s => s.empresaId)
  const [form,    setForm]    = useState<FormData>(EMPTY)
  const [errors,  setErrors]  = useState<Partial<FormData>>({})
  const [loading, setLoading] = useState(false)

  // ── Popular form ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (conta) {
      setForm({
        nome:    conta.nome,
        tipo:    conta.tipo,
        saldo:   conta.saldo.toFixed(2).replace('.', ','),
        banco:   conta.banco   ?? '',
        agencia: conta.agencia ?? '',
        numero:  conta.numero  ?? '',
        ativo:   conta.ativo === 1,
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [open, conta])

  // ── Helpers ───────────────────────────────────────────────
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function parseSaldo(raw: string): number {
    return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.nome.trim()) e.nome = 'Obrigatório'
    if (!form.tipo)        e.tipo = 'Obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate() || !empresaId) return
    setLoading(true)
    try {
      const payload = {
        empresa_id: empresaId,
        nome:       form.nome.trim(),
        tipo:       form.tipo,
        saldo:      parseSaldo(form.saldo),
        banco:      form.banco.trim()   || null,
        agencia:    form.agencia.trim() || null,
        numero:     form.numero.trim()  || null,
        ativo:      form.ativo ? 1 : 0,
      }

      if (conta) {
        await window.api.contas.atualizar({ id: conta.id, ...payload })
        toast.success('Conta atualizada.')
      } else {
        await window.api.contas.criar(payload)
        toast.success('Conta criada.')
      }
      onSaved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={conta ? 'Editar conta' : 'Nova conta'}
    >
      <div className="space-y-4">
        {/* Nome */}
        <Input
          label="Nome da conta"
          placeholder="Ex: Bradesco Corrente"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          error={errors.nome}
        />

        {/* Tipo */}
        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => set('tipo', t.value)}
                className={clsx(
                  'py-2 px-3 rounded-lg text-sm font-medium',
                  'border transition-colors text-left',
                  form.tipo === t.value
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                    : 'border-surface-border text-gray-400 hover:bg-surface-hover'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Saldo inicial */}
        <Input
          label={conta ? 'Saldo atual (R$)' : 'Saldo inicial (R$)'}
          placeholder="0,00"
          value={form.saldo}
          onChange={e => set('saldo', e.target.value)}
          error={errors.saldo}
        />

        {/* Banco + Agência + Número */}
        <Input
          label="Banco (opcional)"
          placeholder="Ex: Bradesco"
          value={form.banco}
          onChange={e => set('banco', e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Agência (opcional)"
            placeholder="0000"
            value={form.agencia}
            onChange={e => set('agencia', e.target.value)}
          />
          <Input
            label="Número (opcional)"
            placeholder="00000-0"
            value={form.numero}
            onChange={e => set('numero', e.target.value)}
          />
        </div>

        {/* Ativo toggle */}
        <div className="flex items-center justify-between
                        p-3 bg-surface-hover rounded-lg">
          <div>
            <p className="text-sm text-gray-200">Conta ativa</p>
            <p className="text-xs text-gray-500">
              Contas inativas não aparecem nos filtros
            </p>
          </div>
          <button
            onClick={() => set('ativo', !form.ativo)}
            className={clsx(
              'w-11 h-6 rounded-full relative transition-colors',
              form.ativo ? 'bg-brand-600' : 'bg-gray-600'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 w-5 h-5 bg-white rounded-full',
              'shadow transition-transform',
              form.ativo ? 'translate-x-5' : 'translate-x-0.5'
            )} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {conta ? 'Salvar alterações' : 'Criar conta'}
        </Button>
      </div>
    </Modal>
  )
}
