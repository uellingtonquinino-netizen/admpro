import { useState } from 'react'
import { useEmpresaStore }          from '@store/empresa.store'
import { useAuthStore }             from '@store/auth.store'
import { toast }                    from '@components/ui/ToastContainer'
import Modal                        from '@components/ui/Modal'
import Button                       from '@components/ui/Button'
import Select                       from '@components/ui/Select'
import Input                        from '@components/ui/Input'
import { TIPOS_DOCUMENTO, getTipoDocumento } from '../../documentos/tipos'
import type { ColaboradorDoc } from '../../documentos/base'
import { formatHoras, formatHoraRelogio } from '../../utils/documentValidators'
import { FileText } from 'lucide-react'
import { clsx } from 'clsx'

interface Colaborador {
  id: number
  nome: string
  [key: string]: unknown
}

interface Props {
  colaborador: Colaborador
  onClose:     () => void
}

export default function GerarDocumentoModal({ colaborador, onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)
  const usuario = useAuthStore(s => s.usuario)

  const [tipoId, setTipoId] = useState('')
  const [extras, setExtras] = useState<Record<string, string>>({})
  const [gerando, setGerando] = useState(false)

  const tipo = getTipoDocumento(tipoId)

  function selecionarTipo(id: string) {
    setTipoId(id)
    const t = getTipoDocumento(id)
    const defaults: Record<string, string> = {}
    t?.campos.forEach(c => {
      if (c.key === 'local' && empresa?.cidade) {
        defaults[c.key] = empresa.estado ? `${empresa.cidade} - ${empresa.estado}` : empresa.cidade
      } else if (c.default) {
        defaults[c.key] = c.default
      }
    })
    // Quem autoriza a ASO é sempre o usuário logado no sistema
    if (id === 'aso' && usuario?.nome) {
      defaults.autorizado_nome = usuario.nome
    }
    setExtras(defaults)
  }

  function setCampo(key: string, value: string) {
    setExtras(prev => ({ ...prev, [key]: value }))
  }

  async function handleGerar() {
    if (!tipo || !empresa) return
    setGerando(true)
    try {
      // CORRIGIDO: usa sempre os dados mais recentes da empresa (inclusive
      // a logo) direto do banco, em vez do valor em cache da store — evita
      // gerar documento com logo desatualizada/ausente após reabrir o app.
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      // Recibo tem numeração sequencial automática, não digitada
      if (tipo.id === 'recibo_pagamento') {
        const { numero } = await window.api.recibos.emitir({
          empresa_id:        empresaAtual.id,
          beneficiario_nome: colaborador.nome,
          valor:             Number(String(extras.valor || 0).replace(',', '.')),
          referente:         extras.referente,
        })
        extras.numero = String(numero)
      }

      // Ficha de EPI: larguras das colunas lidas direto do Excel de
      // referência (resources/ficha_epi.xlsm) a cada geração — se o
      // arquivo mudar, o documento reflete automaticamente.
      if (tipo.id === 'ficha_epi') {
        try {
          const larguras = await window.api.templates.larguraColunasFichaEpi()
          extras.larguras_colunas = JSON.stringify(larguras)
        } catch {
          toast.warning('Usando larguras padrão da Ficha de EPI (não foi possível confirmar a leitura do Excel).')
        }
      }

      const html = tipo.gerarHtml(colaborador as unknown as ColaboradorDoc, empresaAtual, extras)

      // NOTA: passamos `landscape: true`, mas alguns drivers de impressão
      // (ex: "Microsoft Print to PDF") ignoram essa preferência quando a
      // caixa de diálogo nativa está visível e mantêm retrato por padrão —
      // por isso o aviso abaixo, para o usuário conferir/trocar manualmente.
      if (tipo.paisagem) {
        toast.warning('Este documento é em formato paisagem — confira a orientação na janela de impressão.')
      }

      const result = await window.api.documentos.imprimir({
        html,
        landscape:   !!tipo.paisagem,
        nomeArquivo: `${tipo.label} - ${colaborador.nome}`,
      })

      if (result.ok) {
        await window.api.colaboradores.registrarDocumento({
          colaborador_id: colaborador.id,
          empresa_id:     empresa.id,
          tipo:           tipo.id,
          dados_json:     JSON.stringify(extras),
        })
        onClose()
      } else {
        toast.error('Erro ao abrir a impressão.')
      }
    } catch {
      toast.error('Erro ao abrir a impressão.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Gerar documento — ${colaborador.nome}`} size="lg">
      <div className="space-y-4">
        <Select
          label="Tipo de documento"
          value={tipoId}
          onChange={e => selecionarTipo(e.target.value)}
          options={[
            { value: '', label: 'Selecione o documento…' },
            ...TIPOS_DOCUMENTO.map(t => ({ value: t.id, label: t.label })),
          ]}
        />

        {tipo && tipo.campos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-surface-border">
            {tipo.campos.map(campo => {
              if (campo.type === 'textarea') {
                return (
                  <div key={campo.key} className="md:col-span-2 flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{campo.label}</label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      value={extras[campo.key] ?? ''}
                      onChange={e => setCampo(campo.key, e.target.value.toUpperCase())}
                    />
                  </div>
                )
              }
              if (campo.type === 'select') {
                return (
                  <Select
                    key={campo.key}
                    label={campo.label}
                    value={extras[campo.key] ?? ''}
                    onChange={e => setCampo(campo.key, e.target.value)}
                    options={[
                      { value: '', label: 'Selecione' },
                      ...(campo.options ?? []).map(o => ({ value: o, label: o })),
                    ]}
                  />
                )
              }
              if (campo.type === 'multiselect') {
                const selecionados = (extras[campo.key] ?? '').split(',').filter(Boolean)
                function toggleOpcao(opcao: string) {
                  const next = selecionados.includes(opcao)
                    ? selecionados.filter(o => o !== opcao)
                    : [...selecionados, opcao]
                  setCampo(campo.key, next.join(','))
                }
                return (
                  <div key={campo.key} className="md:col-span-2 flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-400">{campo.label}</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 p-3 bg-surface-hover rounded-lg">
                      {(campo.options ?? []).map(op => (
                        <label key={op} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selecionados.includes(op)}
                            onChange={() => toggleOpcao(op)}
                            className="accent-brand-500 w-3.5 h-3.5"
                          />
                          {op}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              }
              if (campo.type === 'horas_extras') {
                const pares = (extras[campo.key] ?? '').split(';').filter(Boolean).map(p => {
                  const [pct, horas] = p.split('|')
                  return { pct, horas: horas ?? '' }
                })
                const ativos = new Set(pares.map(p => p.pct))

                function salvar(next: { pct: string; horas: string }[]) {
                  setCampo(campo.key, next.map(p => `${p.pct}|${p.horas}`).join(';'))
                }
                function toggle(pct: string) {
                  ativos.has(pct)
                    ? salvar(pares.filter(p => p.pct !== pct))
                    : salvar([...pares, { pct, horas: '' }])
                }
                function setHoras(pct: string, horas: string) {
                  salvar(pares.map(p => (p.pct === pct ? { ...p, horas } : p)))
                }

                return (
                  <div key={campo.key} className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-400">{campo.label}</label>
                    <div className="flex flex-wrap gap-2">
                      {(campo.options ?? []).map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => toggle(op)}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                            ativos.has(op)
                              ? 'bg-brand-500/20 border-brand-500 text-brand-300'
                              : 'border-surface-border text-gray-400 hover:border-gray-500'
                          )}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                    {pares.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-1">
                        {pares.map(p => (
                          <Input
                            key={p.pct}
                            label={`Horas ${p.pct}`}
                            value={p.horas}
                            onChange={e => setHoras(p.pct, formatHoras(e.target.value))}
                            placeholder="00:00"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              }
              if (campo.type === 'hora') {
                return (
                  <Input
                    key={campo.key}
                    label={campo.label}
                    type="text"
                    value={extras[campo.key] ?? ''}
                    onChange={e => setCampo(campo.key, formatHoraRelogio(e.target.value))}
                    placeholder="00:00"
                  />
                )
              }
              return (
                <Input
                  key={campo.key}
                  label={campo.label}
                  type={campo.type === 'number' ? 'text' : campo.type}
                  value={extras[campo.key] ?? ''}
                  onChange={e => setCampo(campo.key, e.target.value)}
                />
              )
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={gerando}>
          Cancelar
        </Button>
        <Button
          icon={<FileText size={14} />}
          onClick={handleGerar}
          loading={gerando}
          disabled={!tipo}
        >
          Imprimir / Salvar PDF
        </Button>
      </div>
    </Modal>
  )
}
