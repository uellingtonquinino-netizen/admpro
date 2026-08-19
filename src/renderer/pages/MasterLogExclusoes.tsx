import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@components/ui/ToastContainer'
import Input from '@components/ui/Input'
import { ArrowLeft, Trash2, Search } from 'lucide-react'

interface Exclusao {
  id:           number
  tabela:       string
  descricao:    string | null
  usuario_nome: string | null
  empresa_nome: string
  created_at:   string
}

const TABELA_LABEL: Record<string, string> = {
  autorizacoes_pagamento: 'Autorização de Pagamento',
  notas_fiscais:          'Nota Fiscal',
  colaboradores:          'Colaborador',
  produtos:                'Material/Ferramenta',
  fornecedores:            'Fornecedor',
  usuarios:                'Usuário',
}

// NOVO: registro de quem apagou o quê, em qual obra, e quando — só
// exclusões por enquanto (não é um log de tudo que acontece no
// sistema, só o que foi removido). Cobre as 6 entidades mais
// importantes: AP, Nota Fiscal, Colaborador, Material/Ferramenta,
// Fornecedor e Usuário. Só existe de verdade no Supabase — o registro
// acontece automaticamente antes de cada exclusão, não precisa fazer
// nada além de olhar aqui.
export default function MasterLogExclusoes() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<Exclusao[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    window.api.master.listarExclusoes()
      .then(setLista)
      .catch(() => toast.error('Erro ao carregar o log de exclusões.'))
      .finally(() => setCarregando(false))
  }, [])

  const filtrada = busca.trim()
    ? lista.filter(e =>
        (e.descricao ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        (e.usuario_nome ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        e.empresa_nome.toLowerCase().includes(busca.toLowerCase())
      )
    : lista

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => navigate('/master')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Trash2 size={20} className="text-brand-400" />
        <h1 className="text-xl font-bold text-white">Log de Exclusões</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Quem apagou o quê, em qual obra, e quando — Autorizações de Pagamento, Notas Fiscais,
        Colaboradores, Materiais/Ferramentas, Fornecedores e Usuários. Últimos 500 registros.
      </p>

      <Input
        icon={<Search size={14} />}
        placeholder="Buscar por quem apagou, o quê, ou a obra…"
        value={busca}
        onChange={e => setBusca(e.target.value)}
        className="mb-4"
      />

      <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              {['Quando', 'Quem apagou', 'Obra', 'O que era', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrada.map(e => (
              <tr key={e.id} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 text-gray-200">{e.usuario_nome ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">{e.empresa_nome}</td>
                <td className="px-4 py-3 text-gray-300">{e.descricao ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500 bg-surface-hover px-2 py-0.5 rounded">
                    {TABELA_LABEL[e.tabela] ?? e.tabela}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!carregando && filtrada.length === 0 && (
          <div className="py-16 text-center text-sm text-gray-500">
            {busca ? 'Nenhuma exclusão encontrada pra essa busca.' : 'Nenhuma exclusão registrada ainda.'}
          </div>
        )}
      </div>
    </div>
  )
}
