import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }           from '@components/ui/ToastContainer'
import Button               from '@components/ui/Button'
import Badge                from '@components/ui/Badge'
import {
  FileSignature, Paperclip, ChevronDown, ChevronUp, CheckCircle2,
} from 'lucide-react'

interface Anexo { id: number; caminho: string; nome: string; origem: string }

interface Solicitacao {
  id:                    number
  colaborador_nome:      string
  tipo:                  'admissao' | 'desligamento' | 'alteracao_salarial' | 'outro'
  status:                'pendente' | 'respondido' | 'concluido'
  observacoes:           string | null
  solicitado_por:        string
  solicitado_em:         string
  resposta_observacoes:  string | null
  respondido_por:        string | null
  respondido_em:         string | null
}

const TIPO_LABEL: Record<string, string> = {
  admissao:            'Admissão',
  desligamento:        'Desligamento',
  alteracao_salarial:  'Alteração salarial',
  outro:               'Movimentação',
}

function badgeStatus(status: string) {
  if (status === 'pendente')   return <Badge color="yellow">Aguardando o Setor Pessoal</Badge>
  if (status === 'respondido') return <Badge color="blue">Documentos prontos</Badge>
  return <Badge color="green">Concluído</Badge>
}

export default function SolicitacoesPessoal() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [aberta, setAberta] = useState<number | null>(null)
  const [anexosPorId, setAnexosPorId] = useState<Record<number, Anexo[]>>({})

  function carregar() {
    if (!empresaId) return
    setLoading(true)
    window.api.solicitacoesPessoal.listarPorObra(empresaId)
      .then(setItens)
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [empresaId])

  async function alternarAberta(s: Solicitacao) {
    if (aberta === s.id) { setAberta(null); return }
    setAberta(s.id)
    if (!anexosPorId[s.id]) {
      const completo = await window.api.solicitacoesPessoal.buscarPorId(s.id)
      setAnexosPorId(prev => ({ ...prev, [s.id]: [...completo.anexos_adm, ...completo.anexos_setor_pessoal] }))
    }
  }

  async function handleConcluir(id: number) {
    try {
      await window.api.solicitacoesPessoal.concluir(id)
      toast.success('Marcado como concluído.')
      carregar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao concluir.')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FileSignature size={20} className="text-brand-400" />
        <h1 className="text-lg font-bold text-white">Solicitações ao Setor Pessoal</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Admissões, desligamentos e outras movimentações enviadas — acompanhe o status e baixe os documentos assim que o Setor Pessoal responder.
      </p>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-16 shimmer rounded-xl" />)}</div>
      ) : itens.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhuma solicitação enviada ainda — envie uma direto pelo cadastro do colaborador, logo depois de salvar.
        </p>
      ) : (
        <div className="space-y-2">
          {itens.map(s => (
            <div key={s.id} className="bg-surface border border-surface-border rounded-xl overflow-hidden">
              <button
                onClick={() => alternarAberta(s)}
                className="w-full flex items-center gap-4 p-3.5 text-left hover:bg-surface-hover transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate">{s.colaborador_nome}</p>
                  <p className="text-xs text-gray-500">
                    {TIPO_LABEL[s.tipo] ?? s.tipo} · enviado por {s.solicitado_por} em {new Date(s.solicitado_em).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                {badgeStatus(s.status)}
                {aberta === s.id ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
              </button>

              {aberta === s.id && (
                <div className="px-4 pb-4 pt-1 border-t border-surface-border space-y-3">
                  {s.observacoes && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Observações enviadas</p>
                      <p className="text-sm text-gray-300">{s.observacoes}</p>
                    </div>
                  )}

                  {s.status !== 'pendente' && s.resposta_observacoes && (
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Observações do Setor Pessoal</p>
                      <p className="text-sm text-gray-300">{s.resposta_observacoes}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-gray-500 mb-1">Anexos</p>
                    {!anexosPorId[s.id] ? (
                      <div className="h-8 shimmer rounded-lg" />
                    ) : anexosPorId[s.id].length === 0 ? (
                      <p className="text-xs text-gray-500">Nenhum anexo ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {anexosPorId[s.id].map(a => (
                          <button
                            key={a.id}
                            onClick={() => window.api.documentos.abrirArquivo(a.caminho)}
                            className="w-full flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300 hover:text-white transition-colors text-left"
                          >
                            <Paperclip size={13} className="shrink-0" />
                            {a.nome}
                            <span className="ml-auto text-[10px] text-gray-500 uppercase">
                              {a.origem === 'adm' ? 'enviado por você' : 'setor pessoal'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {s.status === 'respondido' && (
                    <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={() => handleConcluir(s.id)}>
                      Marcar como baixado / arquivado
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
