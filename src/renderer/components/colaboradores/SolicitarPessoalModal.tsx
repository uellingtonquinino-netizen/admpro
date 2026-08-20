import { useState } from 'react'
import { useAuthStore } from '@store/auth.store'
import { toast }        from '@components/ui/ToastContainer'
import Modal              from '@components/ui/Modal'
import Button             from '@components/ui/Button'
import Select             from '@components/ui/Select'
import { Paperclip, Send } from 'lucide-react'

interface Props {
  colaboradorId:   number
  colaboradorNome: string
  empresaId:       number
  onClose:         () => void
  onEnviado:       () => void
}

const TIPOS = [
  { value: 'admissao',           label: 'Admissão' },
  { value: 'desligamento',       label: 'Desligamento' },
  { value: 'alteracao_salarial', label: 'Alteração salarial' },
  { value: 'outro',              label: 'Outra movimentação' },
]

export default function SolicitarPessoalModal({ colaboradorId, colaboradorNome, empresaId, onClose, onEnviado }: Props) {
  const usuario = useAuthStore(s => s.usuario)
  const [tipo, setTipo] = useState('admissao')
  const [observacoes, setObservacoes] = useState('')
  const [anexos, setAnexos] = useState<{ nome: string; caminho: string; arquivo?: File }[]>([])
  const [enviando, setEnviando] = useState(false)

  function handleSelecionarAnexos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    const novos = arquivos.map(f => {
      const caminhoLocal = (f as unknown as { path?: string }).path
      return { nome: f.name, caminho: caminhoLocal ?? f.name, arquivo: caminhoLocal ? undefined : f }
    })
    setAnexos(prev => [...prev, ...novos])
    e.target.value = ''
  }

  async function handleEnviar() {
    if (!usuario) return
    setEnviando(true)
    try {
      // NOVO: rodando na web, resolve cada File pra um caminho de
      // verdade (subindo pro Storage) antes de mandar — no desktop
      // `.path` já resolve isso sozinho.
      const anexosProntos = window.api.documentos.prepararAnexoWeb
        ? await Promise.all(anexos.map(async a => a.arquivo
            ? { nome: a.nome, caminho: await window.api.documentos.prepararAnexoWeb!({ empresa_id: empresaId, pasta_id: 'solicitacoes-temp', arquivo: a.arquivo }) }
            : { nome: a.nome, caminho: a.caminho }))
        : anexos

      await window.api.solicitacoesPessoal.criar({
        empresa_id:     empresaId,
        colaborador_id: colaboradorId,
        tipo,
        observacoes:    observacoes || null,
        solicitado_por: usuario.nome,
        anexos:         anexosProntos,
      })
      toast.success('Enviado para o Setor Pessoal.')
      onEnviado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar para o Setor Pessoal.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal open title={`Enviar para o Setor Pessoal — ${colaboradorNome}`} onClose={onClose}>
      <div className="space-y-4">
        <Select
          label="Tipo de movimentação"
          value={tipo}
          onChange={e => setTipo(e.target.value)}
          options={TIPOS}
        />

        <div>
          <label className="text-xs font-medium text-gray-400">Observações (opcional)</label>
          <textarea
            className="input resize-none w-full mt-1"
            rows={3}
            placeholder="Algo que o Setor Pessoal precisa saber sobre esse caso"
            value={observacoes}
            onChange={e => setObservacoes(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-surface-border rounded-lg text-sm text-gray-400 hover:border-brand-500/50 hover:text-brand-400 cursor-pointer transition-colors">
            <Paperclip size={14} /> Anexar documento(s) — ex: certidões, comprovantes
            <input type="file" multiple className="hidden" onChange={handleSelecionarAnexos} />
          </label>
          {anexos.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {anexos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300">
                  <Paperclip size={13} className="shrink-0" /> {a.nome}
                  <button onClick={() => setAnexos(prev => prev.filter((_, idx) => idx !== i))} className="ml-auto text-gray-500 hover:text-red-400">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button icon={<Send size={14} />} onClick={handleEnviar} loading={enviando}>
          Enviar
        </Button>
      </div>
    </Modal>
  )
}
