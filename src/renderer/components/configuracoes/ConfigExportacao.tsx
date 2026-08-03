import { useState }        from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }           from '@components/ui/ToastContainer'
import Button              from '@components/ui/Button'
import Card                from '@components/ui/Card'
import {
  FileSpreadsheet,
  FileText,
  Database,
} from 'lucide-react'

type Formato = 'csv' | 'pdf' | 'json'

interface OpcaoExport {
  formato: Formato
  label:   string
  desc:    string
  icon:    React.ReactNode
}

const OPCOES: OpcaoExport[] = [
  {
    formato: 'csv',
    label:   'Planilha CSV',
    desc:    'Compatível com Excel, Google Sheets e LibreOffice.',
    icon:    <FileSpreadsheet size={20} className="text-emerald-400" />,
  },
  {
    formato: 'pdf',
    label:   'Relatório PDF',
    desc:    'Relatório formatado pronto para impressão.',
    icon:    <FileText size={20} className="text-red-400" />,
  },
  {
    formato: 'json',
    label:   'Backup JSON',
    desc:    'Exportação completa para backup ou migração.',
    icon:    <Database size={20} className="text-brand-400" />,
  },
]

export default function ConfigExportacao() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const [loading, setLoading] = useState<Formato | null>(null)

  async function handleExportar(formato: Formato) {
    if (!empresaId) return
    setLoading(formato)
    try {
      const resultado = await window.api.exportacao.exportar({
        empresa_id: empresaId,
        formato,
      })
      // Electron abre diálogo de salvar arquivo via IPC
      await window.api.exportacao.salvarArquivo({
        nome:    `export_${new Date().toISOString().slice(0, 10)}.${formato}`,
        conteudo: resultado,
        formato,
      })
      toast.success(`Exportação em ${formato.toUpperCase()} concluída.`)
    } catch {
      toast.error('Erro ao exportar dados.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-200 mb-5">
        Exportar dados
      </h2>

      <div className="space-y-3">
        {OPCOES.map(o => (
          <div
            key={o.formato}
            className="flex items-center gap-4
                       p-4 rounded-xl border border-surface-border
                       hover:bg-surface-hover transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-surface-hover
                            flex items-center justify-center shrink-0">
              {o.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200">{o.label}</p>
              <p className="text-xs text-gray-500">{o.desc}</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              loading={loading === o.formato}
              onClick={() => handleExportar(o.formato)}
            >
              Exportar
            </Button>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-gray-500">
        Os arquivos exportados contêm todos os lançamentos, contas e
        categorias da empresa selecionada.
      </p>
    </Card>
  )
}
