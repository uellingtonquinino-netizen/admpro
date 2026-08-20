import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import { formatDate }           from '@utils/format'
import { formatCPF }            from '@utils/documentValidators'
import PageHeader               from '@components/layout/PageHeader'
import Button                   from '@components/ui/Button'
import Select                   from '@components/ui/Select'
import FiltroPeriodo            from '@components/ui/FiltroPeriodo'
import { SkeletonTable }        from '@components/ui/Skeleton'
import EmptyState               from '@components/ui/EmptyState'
import {
  gerarRelatorioColaboradoresAtivos, gerarRelatorioPorAdmissao, gerarRelatorioVencimentoExperiencia,
  gerarRelatorioAlojados, gerarRelatorioAfastados, gerarRelatorioInativos,
  gerarRelatorioAniversariantes, gerarRelatorioMovimentacao,
  gerarRelatorioPorSetor, gerarRelatorioContasBancarias,
} from '../documentos/relatoriosRH'
import { FileText, ClipboardList } from 'lucide-react'

type TipoRelatorio = 'ativos' | 'porAdmissao' | 'experiencia' | 'alojados' | 'afastados' | 'inativos' | 'aniversariantes' | 'movimentacao' | 'setor' | 'contas'

const TIPOS: { value: TipoRelatorio; label: string }[] = [
  { value: 'ativos',          label: 'Colaboradores ativos' },
  { value: 'porAdmissao',     label: 'Por data de admissão' },
  { value: 'experiencia',     label: 'Vencimento de experiência' },
  { value: 'alojados',        label: 'Alojados' },
  { value: 'afastados',       label: 'Afastados' },
  { value: 'inativos',        label: 'Inativos' },
  { value: 'aniversariantes', label: 'Aniversariantes do mês' },
  { value: 'movimentacao',    label: 'Admissões e desligamentos' },
  { value: 'setor',           label: 'Por Setor' },
  { value: 'contas',          label: 'Contas Bancárias' },
]

const MESES = [
  { value: '1', label: 'Janeiro' }, { value: '2', label: 'Fevereiro' }, { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' }, { value: '5', label: 'Maio' }, { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' }, { value: '8', label: 'Agosto' }, { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
]

export default function RelatoriosRH() {
  const empresaId = useEmpresaStore(s => s.empresaId)

  const [tipo, setTipo]       = useState<TipoRelatorio>('ativos')
  const [opcoes, setOpcoes]   = useState<{ funcoes: string[]; setores: string[]; equipes: string[] }>({
    funcoes: [], setores: [], equipes: [],
  })

  const [funcao, setFuncao]   = useState('')
  const [setor, setSetor]     = useState('')
  const [equipe, setEquipe]   = useState('')
  const [mes, setMes]         = useState(String(new Date().getMonth() + 1))
  const hoje = new Date().toISOString().slice(0, 10)
  const [expInicio, setExpInicio] = useState(hoje)
  const [expFim, setExpFim] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [inicio, setInicio]   = useState(hoje.slice(0, 8) + '01')
  const [fim, setFim]         = useState(hoje)
  const [contasInicio, setContasInicio] = useState('')
  const [contasFim, setContasFim]       = useState('')
  const [admInicio, setAdmInicio] = useState(() => hoje.slice(0, 4) + '-01-01')
  const [admFim, setAdmFim]       = useState(hoje)

  const [colunas, setColunas] = useState<string[]>([])
  const [linhas, setLinhas]   = useState<string[][]>([])
  const [loading, setLoading] = useState(false)
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    window.api.colaboradores.opcoesFiltro(empresaId).then(setOpcoes).catch(err => {
      toast.error(err instanceof Error ? `Erro ao carregar filtros: ${err.message}` : 'Erro ao carregar filtros.')
    })
  }, [empresaId])

  useEffect(() => { buscar() }, [tipo, empresaId])

  async function buscar(overrideInicio?: string, overrideFim?: string) {
    if (!empresaId) return
    const inicioUsado = overrideInicio ?? inicio
    const fimUsado     = overrideFim ?? fim
    const expInicioUsado = overrideInicio ?? expInicio
    const expFimUsado     = overrideFim ?? expFim
    const contasInicioUsado = overrideInicio ?? contasInicio
    const contasFimUsado    = overrideFim ?? contasFim
    const admInicioUsado = overrideInicio ?? admInicio
    const admFimUsado    = overrideFim ?? admFim
    setLoading(true)
    try {
      if (tipo === 'ativos') {
        const dados = await window.api.relatoriosRH.colaboradoresAtivos({ empresa_id: empresaId, funcao, setor, equipe })
        setColunas(['Nome', 'Código', 'Função', 'Equipe', 'Admissão'])
        setLinhas(dados.map((c: any) => [c.nome, c.matricula_esocial ?? '—', c.funcao ?? '—', c.equipe ?? '—', formatDate(c.data_admissao)]))
      } else if (tipo === 'porAdmissao') {
        const dados = await window.api.relatoriosRH.porAdmissao({
          empresa_id: empresaId, dataInicio: admInicioUsado, dataFim: admFimUsado,
        })
        setColunas(['Nome', 'Função', 'Setor', 'Admissão', 'Status'])
        setLinhas(dados.map((c: any) => [c.nome, c.funcao ?? '—', c.setor ?? '—', formatDate(c.data_admissao), c.status ?? '—']))
      } else if (tipo === 'experiencia') {
        const dados = await window.api.relatoriosRH.vencimentoExperiencia({
          empresa_id: empresaId, inicio: expInicioUsado, fim: expFimUsado,
        })
        setColunas(['Nome', 'Função', 'Admissão', 'Vencimento', 'Situação'])
        setLinhas(dados.map((c: any) => [
          c.nome, c.funcao ?? '—', formatDate(c.data_admissao), formatDate(c.data_vencimento_experiencia),
          c.dias_restantes < 0 ? `Vencido há ${Math.abs(c.dias_restantes)}d` : `${c.dias_restantes}d restantes`,
        ]))
      } else if (tipo === 'alojados') {
        const dados = await window.api.relatoriosRH.alojados(empresaId)
        setColunas(['Nome', 'Função', 'Equipe', 'Cidade', 'Telefone', 'Vencimento Baixada'])
        setLinhas(dados.map((c: any) => [
          c.nome, c.funcao ?? '—', c.equipe ?? '—', c.cidade ?? '—', c.telefone ?? '—',
          c.tem_baixada && c.data_vencimento_baixada ? formatDate(c.data_vencimento_baixada) : '—',
        ]))
      } else if (tipo === 'afastados') {
        const dados = await window.api.relatoriosRH.afastados(empresaId)
        setColunas(['Nome', 'Função', 'Setor', 'Equipe', 'Admissão'])
        setLinhas(dados.map((c: any) => [c.nome, c.funcao ?? '—', c.setor ?? '—', c.equipe ?? '—', formatDate(c.data_admissao)]))
      } else if (tipo === 'inativos') {
        const dados = await window.api.relatoriosRH.inativos(empresaId)
        setColunas(['Nome', 'Função', 'Admissão', 'Desligamento', 'Tipo'])
        setLinhas(dados.map((c: any) => [c.nome, c.funcao ?? '—', formatDate(c.data_admissao), formatDate(c.data_demissao), c.tipo_demissao ?? '—']))
      } else if (tipo === 'aniversariantes') {
        const dados = await window.api.relatoriosRH.aniversariantes({ empresa_id: empresaId, mes: Number(mes) })
        setColunas(['Nome', 'Função', 'Nascimento'])
        setLinhas(dados.map((c: any) => [c.nome, c.funcao ?? '—', formatDate(c.nascimento)]))
      } else if (tipo === 'movimentacao') {
        const dados = await window.api.relatoriosRH.movimentacaoPeriodo({ empresa_id: empresaId, inicio: inicioUsado, fim: fimUsado })
        setColunas(['Tipo', 'Nome', 'Função', 'Data'])
        setLinhas([
          ...dados.admissoes.map((c: any) => ['Admissão', c.nome, c.funcao ?? '—', formatDate(c.data)]),
          ...dados.demissoes.map((c: any) => ['Desligamento', c.nome, c.funcao ?? '—', formatDate(c.data)]),
        ])
      } else if (tipo === 'setor') {
        const dados = await window.api.relatoriosRH.porSetor({ empresa_id: empresaId, setor })
        setColunas(['Nome', 'Função', 'Setor'])
        setLinhas(dados.map((c: any) => [c.nome, c.funcao ?? '—', c.setor ?? '—']))
      } else if (tipo === 'contas') {
        const dados = await window.api.relatoriosRH.contasBancarias({
          empresa_id: empresaId,
          inicio: contasInicioUsado || undefined,
          fim:    contasFimUsado || undefined,
        })
        setColunas(['Nome', 'CPF', 'Banco', 'Agência', 'Conta', 'Dígito', 'Tipo'])
        setLinhas(dados.map((c: any) => [
          c.nome, formatCPF(c.cpf) || '—', c.banco ?? '—', c.agencia ?? '—', c.conta ?? '—', c.conta_digito ?? '—', c.tipo_conta ?? '—',
        ]))
      }
    } catch (err) {
      toast.error(err instanceof Error ? `Erro ao carregar o relatório: ${err.message}` : 'Erro ao carregar o relatório.')
    } finally {
      setLoading(false)
    }
  }

  async function handleImprimir() {
    if (!empresaId) return
    setGerando(true)
    try {
      const empresaAtual = await window.api.empresas.buscarPorId(empresaId)
      let html = ''

      if (tipo === 'ativos') {
        const dados = await window.api.relatoriosRH.colaboradoresAtivos({ empresa_id: empresaId, funcao, setor, equipe })
        html = gerarRelatorioColaboradoresAtivos(empresaAtual, dados)
      } else if (tipo === 'porAdmissao') {
        const dados = await window.api.relatoriosRH.porAdmissao({
          empresa_id: empresaId, dataInicio: admInicio, dataFim: admFim,
        })
        html = gerarRelatorioPorAdmissao(empresaAtual, dados, `${formatDate(admInicio)} a ${formatDate(admFim)}`)
      } else if (tipo === 'experiencia') {
        const dados = await window.api.relatoriosRH.vencimentoExperiencia({
          empresa_id: empresaId, inicio: expInicio, fim: expFim,
        })
        html = gerarRelatorioVencimentoExperiencia(empresaAtual, dados, `${formatDate(expInicio)} a ${formatDate(expFim)}`)
      } else if (tipo === 'alojados') {
        const dados = await window.api.relatoriosRH.alojados(empresaId)
        html = gerarRelatorioAlojados(empresaAtual, dados)
      } else if (tipo === 'afastados') {
        const dados = await window.api.relatoriosRH.afastados(empresaId)
        html = gerarRelatorioAfastados(empresaAtual, dados)
      } else if (tipo === 'inativos') {
        const dados = await window.api.relatoriosRH.inativos(empresaId)
        html = gerarRelatorioInativos(empresaAtual, dados)
      } else if (tipo === 'aniversariantes') {
        const dados = await window.api.relatoriosRH.aniversariantes({ empresa_id: empresaId, mes: Number(mes) })
        html = gerarRelatorioAniversariantes(empresaAtual, dados, Number(mes))
      } else if (tipo === 'movimentacao') {
        const dados = await window.api.relatoriosRH.movimentacaoPeriodo({ empresa_id: empresaId, inicio, fim })
        html = gerarRelatorioMovimentacao(empresaAtual, dados, inicio, fim)
      } else if (tipo === 'setor') {
        const dados = await window.api.relatoriosRH.porSetor({ empresa_id: empresaId, setor })
        html = gerarRelatorioPorSetor(empresaAtual, dados, setor)
      } else if (tipo === 'contas') {
        const dados = await window.api.relatoriosRH.contasBancarias({
          empresa_id: empresaId,
          inicio: contasInicio || undefined,
          fim:    contasFim || undefined,
        })
        html = gerarRelatorioContasBancarias(empresaAtual, dados)
      }

      const result = await window.api.documentos.imprimir({
        html,
        nomeArquivo: `Relatorio - ${TIPOS.find(t => t.value === tipo)?.label}`,
      })
      if (!result.ok) toast.error('Erro ao abrir a impressão.')
    } catch {
      toast.error('Erro ao gerar o relatório.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div>
      <PageHeader title="Relatórios de RH" subtitle="Modelos prontos para consulta e impressão">
        <Button icon={<FileText size={15} />} onClick={handleImprimir} loading={gerando}>
          Imprimir / Salvar PDF
        </Button>
      </PageHeader>

      <div className="bg-surface border border-surface-border rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Relatório"
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoRelatorio)}
            options={TIPOS}
            className="w-64"
          />

          {tipo === 'ativos' && (
            <>
              <Select label="Função" value={funcao} onChange={e => setFuncao(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...opcoes.funcoes.map(f => ({ value: f, label: f }))]} />
              <Select label="Setor" value={setor} onChange={e => setSetor(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...opcoes.setores.map(s => ({ value: s, label: s }))]} />
              <Select label="Equipe" value={equipe} onChange={e => setEquipe(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...opcoes.equipes.map(eq => ({ value: eq, label: eq }))]} />
            </>
          )}

          {tipo === 'experiencia' && (
            <FiltroPeriodo
              dataInicio={expInicio}
              dataFim={expFim}
              onBuscar={(i, f) => { setExpInicio(i); setExpFim(f); buscar(i, f) }}
            />
          )}

          {tipo === 'porAdmissao' && (
            <FiltroPeriodo
              dataInicio={admInicio}
              dataFim={admFim}
              onBuscar={(i, f) => { setAdmInicio(i); setAdmFim(f); buscar(i, f) }}
            />
          )}

          {tipo === 'aniversariantes' && (
            <Select label="Mês" value={mes} onChange={e => setMes(e.target.value)} options={MESES} className="w-40" />
          )}

          {tipo === 'movimentacao' && (
            <FiltroPeriodo
              dataInicio={inicio}
              dataFim={fim}
              onBuscar={(i, f) => { setInicio(i); setFim(f); buscar(i, f) }}
            />
          )}

          {tipo === 'setor' && (
            <Select label="Setor" value={setor} onChange={e => setSetor(e.target.value)}
              options={[{ value: '', label: 'Todos' }, ...opcoes.setores.map(s => ({ value: s, label: s }))]} className="w-56" />
          )}

          {tipo === 'contas' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <FiltroPeriodo
                  dataInicio={contasInicio}
                  dataFim={contasFim}
                  onBuscar={(i, f) => { setContasInicio(i); setContasFim(f); buscar(i, f) }}
                />
                {(contasInicio || contasFim) && (
                  <Button variant="ghost" size="sm" onClick={() => { setContasInicio(''); setContasFim(''); buscar('', '') }}>
                    Limpar
                  </Button>
                )}
              </div>
              <span className="text-[11px] text-gray-500">Opcional — filtra por período de admissão</span>
            </div>
          )}

          {tipo !== 'experiencia' && tipo !== 'movimentacao' && tipo !== 'contas' && tipo !== 'porAdmissao' && (
            <Button variant="outline" onClick={() => buscar()}>Filtrar</Button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={colunas.length || 5} />
      ) : linhas.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhum registro encontrado"
          description="Ajuste os filtros acima ou confira se há colaboradores cadastrados que se encaixem neste relatório."
        />
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                {colunas.map(c => (
                  <th key={c} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-hover transition-colors">
                  {linha.map((v, j) => (
                    <td key={j} className="px-4 py-3 text-gray-300">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
