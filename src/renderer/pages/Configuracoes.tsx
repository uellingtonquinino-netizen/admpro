import { useState }       from 'react'
import PageHeader         from '@components/layout/PageHeader'
import ConfigEmpresa      from '@components/configuracoes/ConfigEmpresa'
import ConfigPreferencias from '@components/configuracoes/ConfigPreferencias'
import ConfigSeguranca    from '@components/configuracoes/ConfigSeguranca'
import ConfigExportacao   from '@components/configuracoes/ConfigExportacao'
import { clsx }           from 'clsx'
import {
  Building2,
  SlidersHorizontal,
  ShieldCheck,
  Download,
} from 'lucide-react'

// ── Abas ──────────────────────────────────────────────────
const ABAS = [
  { id: 'empresa',      label: 'Empresa',      icon: Building2          },
  { id: 'preferencias', label: 'Preferências', icon: SlidersHorizontal  },
  { id: 'seguranca',    label: 'Segurança',    icon: ShieldCheck        },
  { id: 'exportacao',   label: 'Exportação',   icon: Download           },
] as const

type AbaId = typeof ABAS[number]['id']

export default function Configuracoes() {
  const [abaAtiva, setAbaAtiva] = useState<AbaId>('empresa')

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie sua empresa e preferências do sistema"
      />

      <div className="flex gap-6">
        {/* Sidebar de abas */}
        <nav className="w-48 shrink-0 space-y-1">
          {ABAS.map(aba => {
            const Icon = aba.icon
            return (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5',
                  'rounded-lg text-sm transition-colors text-left',
                  abaAtiva === aba.id
                    ? 'bg-brand-500/10 text-brand-400 font-medium'
                    : 'text-gray-400 hover:bg-surface-hover hover:text-gray-200'
                )}
              >
                <Icon size={15} />
                {aba.label}
              </button>
            )
          })}
        </nav>

        {/* Conteúdo da aba */}
        <div className="flex-1 min-w-0">
          {abaAtiva === 'empresa'      && <ConfigEmpresa      />}
          {abaAtiva === 'preferencias' && <ConfigPreferencias />}
          {abaAtiva === 'seguranca'    && <ConfigSeguranca    />}
          {abaAtiva === 'exportacao'   && <ConfigExportacao   />}
        </div>
      </div>
    </div>
  )
}
