import { useEffect, useState, useRef } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import Select                   from '@components/ui/Select'
import Card                     from '@components/ui/Card'
import { Save, Upload } from 'lucide-react'
import { formatCNPJ } from '@utils/documentValidators'

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

interface FormData {
  nome:                   string
  cnpj:                   string
  email:                  string
  telefone:               string
  endereco:               string
  cidade:                 string
  estado:                 string
  logo_url:               string
  solicitante_padrao:     string
  autorizado_por_padrao:  string
}

const EMPTY: FormData = {
  nome:     '',
  cnpj:     '',
  email:    '',
  telefone: '',
  endereco: '',
  cidade:   '',
  estado:   '',
  logo_url: '',
  solicitante_padrao:    '',
  autorizado_por_padrao: '',
}

export default function ConfigEmpresa() {
  const { empresaId, empresa, setEmpresa } = useEmpresaStore()
  const [form,    setForm]    = useState<FormData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Popular form ──────────────────────────────────────────
  useEffect(() => {
    if (!empresa) return
    setForm({
      nome:     empresa.nome     ?? '',
      cnpj:     empresa.cnpj     ?? '',
      email:    empresa.email    ?? '',
      telefone: empresa.telefone ?? '',
      endereco: empresa.endereco ?? '',
      cidade:   empresa.cidade   ?? '',
      estado:   empresa.estado   ?? '',
      logo_url: empresa.logo_url ?? '',
      solicitante_padrao:    empresa.solicitante_padrao    ?? '',
      autorizado_por_padrao: empresa.autorizado_por_padrao ?? '',
    })
  }, [empresa])

  function set<K extends keyof FormData>(key: K, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // ── Upload de logo (redimensiona no navegador antes de salvar) ──
  function handleArquivoLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const leitor = new FileReader()
    leitor.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 300
        const escala = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width  = img.width  * escala
        canvas.height = img.height * escala
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
        set('logo_url', canvas.toDataURL('image/png'))
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Salvar ─────────────────────────────────────────────────
  async function handleSalvar() {
    if (!empresaId) return
    setLoading(true)
    try {
      await window.api.empresas.atualizar({ id: empresaId, ...form })
      const updated = await window.api.empresas.buscarPorId(empresaId)
      setEmpresa(updated)
      toast.success('Dados da empresa atualizados.')
    } catch {
      toast.error('Erro ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-200 mb-5">
        Dados da empresa
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nome da empresa"
          value={form.nome}
          onChange={e => set('nome', e.target.value)}
          className="md:col-span-2"
        />
        <Input
          label="CNPJ"
          value={form.cnpj}
          onChange={e => set('cnpj', formatCNPJ(e.target.value))}
          placeholder="00.000.000/0000-00"
        />
        <Input
          label="E-mail"
          type="email"
          value={form.email}
          onChange={e => set('email', e.target.value)}
        />
        <Input
          label="Telefone"
          value={form.telefone}
          onChange={e => set('telefone', e.target.value)}
          placeholder="(00) 00000-0000"
        />
        <Input
          label="Endereço"
          value={form.endereco}
          onChange={e => set('endereco', e.target.value)}
          className="md:col-span-2"
        />
        <Input
          label="Cidade"
          value={form.cidade}
          onChange={e => set('cidade', e.target.value)}
        />
        <Select
          label="UF"
          value={form.estado}
          onChange={e => set('estado', e.target.value)}
          options={[{ value: '', label: '—' }, ...UFS.map(uf => ({ value: uf, label: uf }))]}
        />
      </div>
      <p className="text-xs text-gray-500 -mt-2 mb-4">
        Cidade/UF preenchem automaticamente o campo "local" em todos os documentos gerados.
      </p>

      {/* Logo */}
      <div className="mt-4">
        <label className="text-xs font-medium text-gray-400">Logotipo da obra/empresa</label>
        <div className="mt-1 flex items-center gap-3">
          {form.logo_url ? (
            <img
              src={form.logo_url}
              alt="Logo"
              className="h-14 w-14 object-contain rounded-lg bg-surface-hover p-1"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-surface-hover flex items-center justify-center text-gray-600 text-xs">
              sem logo
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleArquivoLogo}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            icon={<Upload size={13} />}
            onClick={() => fileInputRef.current?.click()}
          >
            {form.logo_url ? 'Trocar logo' : 'Enviar logo'}
          </Button>
          {form.logo_url && (
            <Button variant="ghost" size="sm" onClick={() => set('logo_url', '')}>
              Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Aparece nas Autorizações de Pagamento emitidas para esta obra.
        </p>
      </div>

      <div className="mt-6 pt-5 border-t border-surface-border">
        <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1">
          Centro de Custo
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Preenchidos automaticamente ao emitir uma Autorização de Pagamento — podem ser ajustados a cada emissão.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Solicitante padrão"
            value={form.solicitante_padrao}
            onChange={e => set('solicitante_padrao', e.target.value)}
          />
          <Input
            label="Autorizado por (padrão)"
            value={form.autorizado_por_padrao}
            onChange={e => set('autorizado_por_padrao', e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end mt-6">
        <Button
          icon={<Save size={14} />}
          onClick={handleSalvar}
          loading={loading}
        >
          Salvar alterações
        </Button>
      </div>
    </Card>
  )
}
