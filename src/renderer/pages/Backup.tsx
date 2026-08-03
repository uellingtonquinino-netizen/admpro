import { useState } from 'react'
import { useAuthStore }     from '@store/auth.store'
import { useEmpresaStore }  from '@store/empresa.store'
import { toast }            from '@components/ui/ToastContainer'
import { useConfirm }       from '@hooks/useConfirm'
import ConfirmDialog        from '@components/ui/ConfirmDialog'
import Button                from '@components/ui/Button'
import {
  DatabaseBackup, Download, Upload, ShieldCheck, AlertTriangle, RotateCw, Building2,
} from 'lucide-react'

export default function Backup() {
  const perfil    = useAuthStore(s => s.usuario?.perfil)
  const empresaId = useEmpresaStore(s => s.empresaId)
  const empresaNome = useEmpresaStore(s => s.empresaNome)
  const { confirm, dialogProps } = useConfirm()

  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [restaurado, setRestaurado] = useState<string | null>(null)  // null = não restaurou; string = nome da obra/'completo'

  async function handleExportarCompleto() {
    setExportando(true)
    try {
      const resultado = await window.api.backup.exportar()
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error('Erro ao exportar o backup.'); return }
      toast.success(`Backup salvo em: ${resultado.path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar o backup.')
    } finally {
      setExportando(false)
    }
  }

  async function handleImportarCompleto() {
    const ok = await confirm({
      title:   'Restaurar backup completo',
      danger:  true,
      message: 'Isso substitui TODOS os dados atuais do sistema (de TODAS as obras) pelos dados do arquivo de backup escolhido. ' +
                'Uma cópia do banco atual é guardada automaticamente antes, mas essa ação não deve ser feita sem certeza. Continuar?',
    })
    if (!ok) return

    setImportando(true)
    try {
      const resultado = await window.api.backup.importar()
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error(resultado.erro || 'Erro ao restaurar o backup.'); return }
      setRestaurado('completo')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao restaurar o backup.')
    } finally {
      setImportando(false)
    }
  }

  async function handleExportarObra() {
    if (!empresaId) return
    setExportando(true)
    try {
      const resultado = await window.api.backup.exportarObra(empresaId)
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error(resultado.erro || 'Erro ao exportar o backup da obra.'); return }
      toast.success(`Backup da obra salvo em: ${resultado.path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar o backup da obra.')
    } finally {
      setExportando(false)
    }
  }

  async function handleImportarObra() {
    const ok = await confirm({
      title:   'Restaurar backup de obra',
      danger:  true,
      message: 'Isso traz de volta uma obra a partir de um arquivo de backup — usado quando uma obra foi excluída sem querer. ' +
                'Se a obra do arquivo ainda existir no sistema, a restauração é recusada (não sobrepõe uma obra ativa). Continuar?',
    })
    if (!ok) return

    setImportando(true)
    try {
      const resultado = await window.api.backup.importarObra()
      if (resultado.canceled) return
      if (!resultado.ok) { toast.error(resultado.erro || 'Erro ao restaurar o backup da obra.'); return }
      setRestaurado(resultado.nomeObra)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao restaurar o backup da obra.')
    } finally {
      setImportando(false)
    }
  }

  if (restaurado) {
    const ehCompleto = restaurado === 'completo'
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
          <ShieldCheck size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-white mb-1">
            {ehCompleto ? 'Backup restaurado' : `Obra "${restaurado}" restaurada`}
          </p>
          <p className="text-sm text-gray-400 mb-5">
            {ehCompleto
              ? 'O programa precisa reiniciar pra terminar de carregar os dados restaurados.'
              : 'A página precisa recarregar pra mostrar a obra restaurada nas listas.'}
          </p>
          <Button
            icon={<RotateCw size={14} />}
            onClick={() => ehCompleto ? window.api.app.relaunch() : window.location.reload()}
          >
            {ehCompleto ? 'Reiniciar agora' : 'Recarregar agora'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <DatabaseBackup size={20} className="text-brand-400" />
        <h1 className="text-lg font-bold text-white">Backup do Sistema</h1>
      </div>

      {perfil === 'master' ? (
        <>
          <p className="text-sm text-gray-500 mb-6">
            Exporte uma cópia completa de tudo que já foi lançado, em todas as obras — RH, Financeiro,
            Almoxarifado, Setor Pessoal — pra guardar num pendrive, HD externo ou pasta na nuvem.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-surface border border-surface-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center mb-3">
                <Download size={18} className="text-brand-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Exportar Backup Completo</p>
              <p className="text-xs text-gray-500 mb-4">Gera um arquivo com os dados de todas as obras, de agora.</p>
              <Button icon={<Download size={14} />} onClick={handleExportarCompleto} loading={exportando} className="w-full justify-center">
                Exportar
              </Button>
            </div>

            <div className="bg-surface border border-surface-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                <Upload size={18} className="text-red-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Importar Backup Completo</p>
              <p className="text-xs text-gray-500 mb-4">Restaura um backup completo — substitui os dados de TODAS as obras.</p>
              <Button variant="outline" icon={<Upload size={14} />} onClick={handleImportarCompleto} loading={importando} className="w-full justify-center">
                Importar
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mt-5">
            <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-200/90">
              Importar um backup completo substitui TODOS os dados atuais do sistema (de todas as obras) —
              uma cópia de segurança do banco atual é guardada automaticamente antes de sobrescrever, mas
              faça essa ação com certeza do que está escolhendo.
            </p>
          </div>

          <p className="text-xs text-gray-600 mt-4">
            Pra recuperar só UMA obra específica (ex: excluída sem querer), sem mexer nas outras, use o
            Backup desta obra — disponível na tela de Backup de cada ADM, dentro da própria obra.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-1">
            <Building2 size={13} /> {empresaNome || 'obra atual'}
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Exporte uma cópia de tudo que já foi lançado NESSA obra — RH, Financeiro, Almoxarifado, Setor
            Pessoal — pra guardar num pendrive, HD externo ou pasta na nuvem. Se a obra for excluída sem
            querer, a importação traz esses dados de volta, sem mexer nas outras obras do sistema.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-surface border border-surface-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center mb-3">
                <Download size={18} className="text-brand-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Exportar Backup desta Obra</p>
              <p className="text-xs text-gray-500 mb-4">Gera um arquivo só com os dados desta obra, de agora.</p>
              <Button icon={<Download size={14} />} onClick={handleExportarObra} loading={exportando} className="w-full justify-center">
                Exportar
              </Button>
            </div>

            <div className="bg-surface border border-surface-border rounded-xl p-5">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center mb-3">
                <Upload size={18} className="text-red-400" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Restaurar uma Obra Excluída</p>
              <p className="text-xs text-gray-500 mb-4">Traz de volta uma obra a partir de um backup — não sobrepõe uma que já existe.</p>
              <Button variant="outline" icon={<Upload size={14} />} onClick={handleImportarObra} loading={importando} className="w-full justify-center">
                Restaurar
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 mt-5">
            <AlertTriangle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-200/90">
              A restauração só funciona pra trazer de volta uma obra que foi excluída — se uma obra com o
              mesmo identificador já existir no sistema, ela é recusada, pra nunca sobrepor dados de uma
              obra ativa.
            </p>
          </div>
        </>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
