import { useEffect, useState }  from 'react'
import { useEmpresaStore }       from '@store/empresa.store'
import { useCurrency }           from '@hooks/useCurrency'
import { toast }                 from '@components/ui/ToastContainer'
import Modal                     from '@components/ui/Modal'
import Button                    from '@components/ui/Button'
import Input                     from '@components/ui/Input'
import Select                    from '@components/ui/Select'
import CategoriaModal            from '@components/categorias/CategoriaModal'
import { clsx }                  from 'clsx'
import { Plus } from 'lucide-react'

interface Lancamento {
  id:         number
  descricao:  string
  valor:      number
  tipo:       'receita' | 'despesa'
  status:     string
  data:       string
  data_venc:  string | null
  categoria:  string
  conta:      string
  observacao: string | null
}

interface Props {
  open:        boolean
  onClose:     () => void
  onSaved:     () => void
  lancamento?: Lancamento | null
}

interface FormData {
  descricao:    string
  valor:        string
  tipo:         'receita' | 'despesa'
  status:       string
  data:         string
  data_venc:    string
  categoria_id: string
  conta_id:     string
  observacao:   string
}

const EMPTY: FormData = {
  descricao:    '',
  valor:        '',
  tipo:         'despesa',
  status:       'pendente',
  data:         new Date().toISOString().slice(0, 10),
  data_venc:    '',
  categoria_id: '',
  conta_id:     '',
  observacao:   '',
}

export default function LancamentoModal({
  open,
  onClose,
  onSaved,
  lancamento,
}: Props) {
  const empresaId        = useEmpresaStore(s => s.empresaId)
  const { parse }        = useCurrency()

  const [form,       setForm]       = useState<FormData>(EMPTY)
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([])
  const [contas,     setContas]     = useState<{ id: number; nome: string }[]>([])
  const [loading,    setLoading]    = useState(false)
  const [errors,     setErrors]     = useState<Partial<FormData>>({})
  const [novaCategoriaOpen, setNovaCategoriaOpen] = useState(false)

  function carregarCategorias() {
    if (!empresaId) return
    window.api.categorias.listar({ empresa_id: empresaId }).then(setCategorias)
  }

  // ── Carregar selects ──────────────────────────────────────
  useEffect(() => {
    if (!open || !empresaId) return
    carregarCategorias()
    window.api.contas.listar({ empresa_id: empresaId }).then(setContas)
  }, [open, empresaId])

  // ── Popular form ao editar ────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (lancamento) {
      setForm({
        descricao:    lancamento.descricao,
        valor:        lancamento.valor.toFixed(2).replace('.', ','),
        tipo:         lancamento.tipo,
        status:       lancamento.status,
        data:         lancamento.data.slice(0, 10),
        data_venc:    lancamento.data_venc?.slice(0, 10) ?? '',
        categoria_id: '',   // resolvido via nome abaixo
        conta_id:     '',
        observacao:   lancamento.observacao ?? '',
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [open, lancamento])

  // ── Helpers ───────────────────────────────────────────────
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<FormData> = {}
    if (!form.descricao.trim())   e.descricao   = 'Obrigatório'
    if (!form.valor.trim())       e.valor       = 'Obrigatório'
    if (!form.data)               e.data        = 'Obrigatório'
    if (!form.categoria_id)       e.categoria_id = 'Obrigatório'
    if (!form.conta_id)           e.conta_id    = 'Obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit ────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate() || !empresaId) return
    setLoading(true)
    try {
      const payload = {
        empresa_id:   empresaId,
        descricao:    form.descricao.trim(),
        valor:        parse(form.valor),
        tipo:         form.tipo,
        status:       form.status,
        data:         form.data,
        data_venc:    form.data_venc || null,
        categoria_id: Number(form.categoria_id),
        conta_id:     Number(form.conta_id),
        observacao:   form.observacao.trim() || null,
      }

      if (lancamento) {
        await window.api.lancamentos.atualizar({ id: lancamento.id, ...payload })
        toast.success('Lançamento atualizado.')
      } else {
        await window.api.lancamentos.criar(payload)
        toast.success('Lançamento criado.')
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
      title={lancamento ? 'Editar lançamento' : 'Novo lançamento'}
      size="lg"
    >
      {/* Tipo — toggle */}
      <div className="flex rounded-lg overflow-hidden border border-surface-border mb-5">
        {(['despesa', 'receita'] as const).map(t => (
          <button
            key={t}
            onClick={() => set('tipo', t)}
            className={clsx(
              'flex-1 py-2 text-sm font-medium transition-colors capitalize',
              form.tipo === t
                ? t === 'receita'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
                : 'text-gray-400 hover:bg-surface-hover'
            )}
          >
            {t === 'receita' ? '↑ Receita' : '↓ Despesa'}
          </button>
        ))}
      </div>

      {/* Campos */}
      <div className="space-y-4">
        {/* Descrição */}
        <Input
          label="Descrição"
          placeholder="Ex: Pagamento fornecedor"
          value={form.descricao}
          onChange={e => set('descricao', e.target.value)}
          error={errors.descricao}
        />

        {/* Valor + Status */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Valor (R$)"
            placeholder="0,00"
            value={form.valor}
            onChange={e => set('valor', e.target.value)}
            error={errors.valor}
          />

          <div>
            <label className="label">Status</label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value)}
              className="input w-full text-sm"
            >
              <option value="pendente">Pendente</option>
              <option value={form.tipo === 'receita' ? 'recebido' : 'pago'}>
                {form.tipo === 'receita' ? 'Recebido' : 'Pago'}
              </option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        {/* Data + Vencimento */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Data"
            type="date"
            value={form.data}
            onChange={e => set('data', e.target.value)}
            error={errors.data}
          />
          <Input
            label="Vencimento (opcional)"
            type="date"
            value={form.data_venc}
            onChange={e => set('data_venc', e.target.value)}
          />
        </div>

        {/* Categoria + Conta */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Categoria</label>
              <button
                type="button"
                onClick={() => setNovaCategoriaOpen(true)}
                className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
              >
                <Plus size={12} /> Nova categoria
              </button>
            </div>
            <select
              value={form.categoria_id}
              onChange={e => set('categoria_id', e.target.value)}
              className={clsx(
                'input w-full text-sm',
                errors.categoria_id && 'border-red-500'
              )}
            >
              <option value="">Selecione...</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {errors.categoria_id && (
              <p className="text-xs text-red-400 mt-1">{errors.categoria_id}</p>
            )}
          </div>

          <div>
            <label className="label">Conta</label>
            <select
              value={form.conta_id}
              onChange={e => set('conta_id', e.target.value)}
              className={clsx(
                'input w-full text-sm',
                errors.conta_id && 'border-red-500'
              )}
            >
              <option value="">Selecione...</option>
              {contas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {errors.conta_id && (
              <p className="text-xs text-red-400 mt-1">{errors.conta_id}</p>
            )}
          </div>
        </div>

        {/* Observação */}
        <div>
          <label className="label">Observação (opcional)</label>
          <textarea
            value={form.observacao}
            onChange={e => set('observacao', e.target.value.toUpperCase())}
            rows={2}
            placeholder="Anotações extras..."
            className="input w-full text-sm resize-none"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {lancamento ? 'Salvar alterações' : 'Criar lançamento'}
        </Button>
      </div>

      {novaCategoriaOpen && (
        <CategoriaModal
          open
          onClose={() => setNovaCategoriaOpen(false)}
          onSaved={nova => {
            setNovaCategoriaOpen(false)
            carregarCategorias()
            if (nova) set('categoria_id', String(nova.id))
          }}
        />
      )}
    </Modal>
  )
}
