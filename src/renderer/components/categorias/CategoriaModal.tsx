import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import { CORES_PADRAO }         from '@pages/Categorias'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import { clsx }                 from 'clsx'

interface Categoria {
  id:   number
  nome: string
  tipo: 'receita' | 'despesa' | 'ambos'
  cor:  string | null
}

interface Props {
  open:       boolean
  onClose:    () => void
  onSaved:    (nova?: { id: number; nome: string }) => void
  categoria?: Categoria | null
}

interface FormData {
  nome: string
  tipo: 'receita' | 'despesa' | 'ambos'
  cor:  string
}

const EMPTY: FormData = {
  nome: '',
  tipo: 'despesa',
  cor:  '#6366f1',
}

export default function CategoriaModal({
  open, onClose, onSaved, categoria,
}: Props) {
  const empresaId      = useEmpresaStore(s => s.empresaId)
  const [form,    setForm]    = useState<FormData>(EMPTY)
  const [errors,  setErrors]  = useState<Partial<FormData>>({})
  const [loading, setLoading] = useState(false)

  // ── Popular form ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (categoria) {
      setForm({
        nome: categoria.nome,
        tipo: categoria.tipo,
        cor:  categoria.cor ?? '#6366f1',
      })
    } else {
      setForm(EMPTY)
    }
    setErrors({})
  }, [open, categoria])

  // ── Helpers ───────────────────────────────────────────────
  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.nome.trim()) e.nome = 'Obrigatório'
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
        cor:        form.cor,
      }

      if (categoria) {
        await window.api.categorias.atualizar({ id: categoria.id, ...payload })
        toast.success('Categoria atualizada.')
        onSaved()
      } else {
        const { id } = await window.api.categorias.criar(payload)
        toast.success('Categoria criada.')
        onSaved({ id, nome: payload.nome })
      }
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
      title={categoria ? 'Editar categoria' : 'Nova categoria'}
    >
      <div className="space-y-5">
        {/* Nome */}
        <Input
          label="Nome"
          placeholder="Ex: Alimentação"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          error={errors.nome}
        />

        {/* Tipo */}
        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'despesa', label: '↓ Despesa' },
              { value: 'receita', label: '↑ Receita' },
              { value: 'ambos',   label: '⇅ Ambos'   },
            ] as const).map(t => (
              <button
                key={t.value}
                onClick={() => set('tipo', t.value)}
                className={clsx(
                  'py-2 rounded-lg text-sm font-medium border transition-colors',
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

        {/* Cor */}
        <div>
          <label className="label">Cor</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {CORES_PADRAO.map(cor => (
              <button
                key={cor}
                onClick={() => set('cor', cor)}
                className={clsx(
                  'w-7 h-7 rounded-full transition-transform',
                  form.cor === cor
                    ? 'ring-2 ring-offset-2 ring-offset-surface ring-white scale-110'
                    : 'hover:scale-105'
                )}
                style={{ backgroundColor: cor }}
              />
            ))}
          </div>

          {/* Cor personalizada */}
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.cor}
              onChange={e => set('cor', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer
                         bg-transparent border-0 p-0"
            />
            <span className="text-xs text-gray-500">
              Cor personalizada: <code className="text-gray-300">{form.cor}</code>
            </span>
          </div>
        </div>

        {/* Preview */}
        <div className="flex items-center gap-2
                        p-3 bg-surface-hover rounded-lg">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: form.cor }}
          />
          <span className="text-sm text-gray-300">
            {form.nome.trim() || 'Nome da categoria'}
          </span>
          <span className={clsx(
            'ml-auto text-xs px-2 py-0.5 rounded-full',
            form.tipo === 'receita'
              ? 'bg-emerald-500/10 text-emerald-400'
              : form.tipo === 'despesa'
              ? 'bg-red-500/10 text-red-400'
              : 'bg-gray-500/10 text-gray-400'
          )}>
            {form.tipo}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {categoria ? 'Salvar alterações' : 'Criar categoria'}
        </Button>
      </div>
    </Modal>
  )
}
