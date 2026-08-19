import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore }  from '@store/auth.store'
import { useBuscaStore } from '@store/busca.store'
import { toast }         from '@components/ui/ToastContainer'
import { useConfirm }    from '@hooks/useConfirm'
import Badge              from '@components/ui/Badge'
import Button              from '@components/ui/Button'
import Input                from '@components/ui/Input'
import Modal                from '@components/ui/Modal'
import Select                from '@components/ui/Select'
import ConfirmDialog        from '@components/ui/ConfirmDialog'
import ModalNovoUsuario     from '@components/usuarios/ModalNovoUsuario'
import ModalEditarUsuario   from '@components/usuarios/ModalEditarUsuario'
import { formatCNPJ } from '../utils/documentValidators'
import { bateComBusca } from '../utils/busca'
import {
  Landmark, UserRound, Building2, ArrowLeft, ChevronRight, Plus, Pencil, Trash2,
  Users, Wallet, FileCheck2, Clock, Upload, FileSignature, Mail,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────
interface CentralUsuario { id: number; nome: string; email: string; ativo: boolean; last_login_at: string | null; itens_aprovados: number }
interface SetorPessoalUsuario { id: number; nome: string; email: string; ativo: boolean; last_login_at: string | null; solicitacoes_respondidas: number }
interface SupervisorUsuario {
  id: number; nome: string; email: string; ativo: boolean; last_login_at: string | null
  itens_aprovados: number; obras: { id: number; nome: string }[]
}
interface ObraResumo { id: number; nome: string; cnpj: string | null; cidade: string | null; estado: string | null; logo_url: string | null }
interface ObraDetalhe {
  empresa: { id: number; nome: string; cnpj: string | null; email: string | null; telefone: string | null; endereco: string | null; logo_url: string | null }
  colaboradores: number
  custo_folha: number
  gastos_mes: number
  usuarios: { id: number; nome: string; email: string; perfil: string; ativo: boolean; last_login_at: string | null }[]
  supervisores: { id: number; nome: string }[]
}

type View = 'home' | 'escritorio' | 'supervisores' | 'setor-pessoal' | 'obras' | 'obra-detalhe'

const PERFIL_LABEL: Record<string, string> = { admin: 'ADM', gestor: 'GESTOR', almoxarife: 'ALMOXARIFADO' }
const PERFIL_COR: Record<string, 'blue' | 'green' | 'gray'> = { admin: 'blue', gestor: 'green', almoxarife: 'gray' }

function fmtUltimoAcesso(iso: string | null): string {
  if (!iso) return 'Nunca acessou'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatarMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─────────────────────────────────────────────────────────
// Modal simples de Obra (criar/editar) — só os campos essenciais.
// ─────────────────────────────────────────────────────────
function ModalObra({ obra, onClose, onSaved }: { obra?: ObraResumo | null; onClose: () => void; onSaved: () => void }) {
  const UFS = [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
    'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
  ]

  const [tituloObra, setTituloObra] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj]         = useState('')
  const [email, setEmail]       = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cidade, setCidade]     = useState('')
  const [estado, setEstado]     = useState('')
  const [logoUrl, setLogoUrl]   = useState('')
  // NOVO: código da obra no sistema externo de folha de pagamento —
  // digitado uma vez aqui, usado depois na exportação da Folha de
  // Pagamento (Recursos Humanos), sem precisar redigitar toda vez.
  const [codigoEmpresa, setCodigoEmpresa] = useState('')
  // NOVO: valor da mensalidade de uso do sistema (Faturas/boleto) —
  // pré-preenchido com o valor do Plano Start (R$ 199,90) em obra
  // nova; em obra existente, vem carregado com o que já está salvo.
  const [valorMensalidade, setValorMensalidade] = useState('199,90')
  const [solicitantePadrao, setSolicitantePadrao] = useState('')
  const [autorizadoPorPadrao, setAutorizadoPorPadrao] = useState('')
  const [carregando, setCarregando] = useState(!!obra)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!obra) { setCarregando(false); return }
    window.api.empresas.buscarPorId(obra.id).then((completa: any) => {
      if (!completa) return
      setTituloObra(completa.titulo_obra || completa.nome || '')
      setRazaoSocial(completa.razao_social ?? '')
      setCnpj(completa.cnpj ?? '')
      setEmail(completa.email ?? '')
      setTelefone(completa.telefone ?? '')
      setEndereco(completa.endereco ?? '')
      setCidade(completa.cidade ?? '')
      setEstado(completa.estado ?? '')
      setLogoUrl(completa.logo_url ?? '')
      setCodigoEmpresa(completa.codigo_empresa ?? '')
      if (completa.valor_mensalidade !== undefined && completa.valor_mensalidade !== null) {
        setValorMensalidade(String(completa.valor_mensalidade).replace('.', ','))
      }
      setSolicitantePadrao(completa.solicitante_padrao ?? '')
      setAutorizadoPorPadrao(completa.autorizado_por_padrao ?? '')
    }).finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        setLogoUrl(canvas.toDataURL('image/png'))
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(file)
    e.target.value = ''
  }

  async function salvar() {
    if (!tituloObra.trim()) { toast.error('Informe o título da obra.'); return }
    setSalvando(true)
    const payload = {
      nome: tituloObra, titulo_obra: tituloObra, razao_social: razaoSocial, cnpj, email, telefone, endereco, cidade, estado, logo_url: logoUrl,
      solicitante_padrao: solicitantePadrao, autorizado_por_padrao: autorizadoPorPadrao,
      codigo_empresa: codigoEmpresa,
      valor_mensalidade: Number(valorMensalidade.replace(',', '.')) || 0,
    }
    try {
      if (obra) {
        await window.api.empresas.atualizar({ id: obra.id, ...payload })
        toast.success('Obra atualizada.')
      } else {
        await window.api.empresas.criar(payload)
        toast.success('Obra criada.')
      }
      onSaved()
    } catch {
      toast.error('Erro ao salvar a obra.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open title={obra ? 'Editar obra' : 'Nova obra'} onClose={onClose}>
      {carregando ? (
        <div className="h-40 shimmer rounded-xl" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Título da Obra" value={tituloObra} onChange={e => setTituloObra(e.target.value)} placeholder='Ex: "Residencial Top Life"' />
              <p className="text-xs text-gray-500 mt-1">
                O nome comercial/de divulgação do empreendimento — usado nas caixas do Painel do Supervisor e como o nome da obra em todo o sistema. Diferente da "Razão Social" (nome jurídico do CNPJ).
              </p>
            </div>
            <div className="md:col-span-2">
              <Input label="Razão Social" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} />
              <p className="text-xs text-gray-500 mt-1">
                O nome jurídico registrado no CNPJ abaixo — diferente do Título da Obra, que é só a forma de organizar/identificar a obra no sistema.
              </p>
            </div>
            <Input label="CNPJ" value={cnpj} onChange={e => setCnpj(formatCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
            <div>
              <Input label="Código da Empresa" value={codigoEmpresa} onChange={e => setCodigoEmpresa(e.target.value)} placeholder="Ex: 155" />
              <p className="text-xs text-gray-500 mt-1">
                Código dessa obra no sistema de folha de pagamento — usado na exportação da Folha de Pagamento.
              </p>
            </div>
            <div>
              <Input label="Valor da Mensalidade (R$)" value={valorMensalidade} onChange={e => setValorMensalidade(e.target.value)} placeholder="199,90" />
              <p className="text-xs text-gray-500 mt-1">
                Cobrado por boleto (Faturas) — hoje o Plano Start, R$ 199,90.
              </p>
            </div>
            <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input label="Telefone" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
            <Input label="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} className="md:col-span-2" />
            <Input label="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} />
            <Select
              label="UF"
              value={estado}
              onChange={e => setEstado(e.target.value)}
              options={[{ value: '', label: '—' }, ...UFS.map(uf => ({ value: uf, label: uf }))]}
            />
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium text-gray-400">Logotipo da obra</label>
            <div className="mt-1 flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-lg bg-surface-hover p-1" />
              ) : (
                <div className="h-14 w-14 rounded-lg bg-surface-hover flex items-center justify-center text-gray-600 text-xs">sem logo</div>
              )}
              <input type="file" accept="image/*" onChange={handleArquivoLogo} className="hidden" id="input-logo-obra" />
              <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => document.getElementById('input-logo-obra')?.click()}>
                {logoUrl ? 'Trocar logo' : 'Enviar logo'}
              </Button>
              {logoUrl && <Button variant="ghost" size="sm" onClick={() => setLogoUrl('')}>Remover</Button>}
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-surface-border">
            <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-1">Centro de Custo</h3>
            <p className="text-xs text-gray-500 mb-3">
              Preenchidos automaticamente ao emitir uma Autorização de Pagamento — podem ser ajustados a cada emissão.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Solicitante padrão" value={solicitantePadrao} onChange={e => setSolicitantePadrao(e.target.value)} />
              <Input label="Autorizado por (padrão)" value={autorizadoPorPadrao} onChange={e => setAutorizadoPorPadrao(e.target.value)} />
            </div>
          </div>
        </>
      )}
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando} disabled={carregando}>Salvar</Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Modal de obras de um Supervisor (checklist)
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// Confirmação por senha — pra ações destrutivas demais pra só um
// "sim/não" (excluir uma obra inteira, por exemplo).
// ─────────────────────────────────────────────────────────
function ModalConfirmarSenha({ titulo, mensagem, onClose, onConfirmar }: {
  titulo: string; mensagem: string; onClose: () => void; onConfirmar: (senha: string) => Promise<void>
}) {
  const [senha, setSenha] = useState('')
  const [verificando, setVerificando] = useState(false)

  async function confirmar() {
    if (!senha) return
    setVerificando(true)
    try {
      await onConfirmar(senha)
    } finally {
      setVerificando(false)
    }
  }

  return (
    <Modal open title={titulo} onClose={onClose}>
      <p className="text-sm text-gray-400 mb-4">{mensagem}</p>
      <Input
        label="Sua senha"
        type="password"
        value={senha}
        onChange={e => setSenha(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
      />
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" onClick={confirmar} loading={verificando}>Confirmar exclusão</Button>
      </div>
    </Modal>
  )
}

function ModalObrasSupervisor({ supervisor, todasObras, onClose, onSaved }: {
  supervisor: SupervisorUsuario; todasObras: ObraResumo[]; onClose: () => void; onSaved: () => void
}) {
  const [selecionadas, setSelecionadas] = useState<number[]>(supervisor.obras.map(o => o.id))
  const [salvando, setSalvando] = useState(false)

  function alternar(id: number) {
    setSelecionadas(prev => prev.includes(id) ? prev.filter(o => o !== id) : [...prev, id])
  }

  async function salvar() {
    setSalvando(true)
    try {
      await window.api.master.definirObrasSupervisor({ usuario_id: supervisor.id, empresa_ids: selecionadas })
      toast.success('Obras do Supervisor atualizadas.')
      onSaved()
    } catch {
      toast.error('Erro ao atualizar as obras.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open title={`Obras de ${supervisor.nome}`} onClose={onClose}>
      <div className="max-h-72 overflow-y-auto space-y-1 p-2 rounded-lg bg-surface-hover">
        {todasObras.length === 0 ? (
          <p className="text-xs text-gray-500 px-1 py-1">Nenhuma obra cadastrada ainda.</p>
        ) : todasObras.map(o => (
          <label key={o.id} className="flex items-center gap-2 px-1 py-1.5 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={selecionadas.includes(o.id)} onChange={() => alternar(o.id)} className="accent-brand-500" />
            {o.nome}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button onClick={salvar} loading={salvando}>Salvar</Button>
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────
// Painel principal
// ─────────────────────────────────────────────────────────
export default function PainelMaster() {
  const { confirm, dialogProps } = useConfirm()
  const usuarioLogado = useAuthStore(s => s.usuario)
  const location = useLocation()
  const navigate  = useNavigate()

  const [view, setView] = useState<View>('home')

  // CORRIGIDO: a busca do topo (Navbar) não se aplica a colaborador/
  // fornecedor pra esse perfil — ela escreve nesse store compartilhado,
  // e aqui filtramos a lista que está na tela (Escritório/Supervisores/
  // Obras) por ela.
  const buscaQuery    = useBuscaStore(s => s.query)
  const setBuscaQuery = useBuscaStore(s => s.setQuery)

  // CORRIGIDO: o painel controla a navegação interna sozinho (não são
  // rotas de verdade) — clicar em "Painel Administrador" no menu, já
  // estando dentro de uma obra/supervisor, não fazia nada, porque a
  // URL não mudava. Toda vez que chega uma navegação nova pra essa
  // rota, volta pra tela inicial do painel e limpa a busca — que
  // também é limpa ao sair do painel, pra não deixar filtro "grudado".
  useEffect(() => {
    setView('home')
    setBuscaQuery('')
    return () => setBuscaQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const [central, setCentral] = useState<CentralUsuario[]>([])
  const [supervisores, setSupervisores] = useState<SupervisorUsuario[]>([])
  const [setorPessoal, setSetorPessoal] = useState<SetorPessoalUsuario[]>([])
  const [obras, setObras] = useState<ObraResumo[]>([])
  const [loading, setLoading] = useState(true)

  // Listas filtradas pela busca do topo — cada tela do painel usa a
  // sua. Sem busca digitada, cai de volta na lista inteira.
  const centralFiltrado = useMemo(
    () => central.filter(c => bateComBusca(buscaQuery, [c.nome, c.email])),
    [central, buscaQuery],
  )
  const setorPessoalFiltrado = useMemo(
    () => setorPessoal.filter(s => bateComBusca(buscaQuery, [s.nome, s.email])),
    [setorPessoal, buscaQuery],
  )
  const supervisoresFiltrado = useMemo(
    () => supervisores.filter(s => bateComBusca(buscaQuery, [s.nome, s.email, ...s.obras.map(o => o.nome)])),
    [supervisores, buscaQuery],
  )
  const obrasFiltrado = useMemo(
    () => obras.filter(o => bateComBusca(buscaQuery, [o.nome, o.cnpj, o.cidade, o.estado])),
    [obras, buscaQuery],
  )

  const [obraAtual, setObraAtual] = useState<ObraResumo | null>(null)
  const [obraDetalhe, setObraDetalhe] = useState<ObraDetalhe | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  const usuariosObraFiltrado = useMemo(
    () => (obraDetalhe?.usuarios ?? []).filter(u => bateComBusca(buscaQuery, [u.nome, u.email])),
    [obraDetalhe, buscaQuery],
  )

  const [modalObraAberto, setModalObraAberto] = useState<'novo' | ObraResumo | null>(null)
  const [obraParaExcluir, setObraParaExcluir] = useState<ObraResumo | null>(null)
  const [modalObrasSupervisor, setModalObrasSupervisor] = useState<SupervisorUsuario | null>(null)
  const [modalNovoUsuario, setModalNovoUsuario] = useState(false)
  const [modalNovoCentral, setModalNovoCentral] = useState(false)
  const [modalNovoSetorPessoal, setModalNovoSetorPessoal] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<any | null>(null)

  // CORRIGIDO: os objetos que já tenho em mãos (do Supervisor na
  // lista, ou do usuário dentro da obra) vêm incompletos — sem
  // permissões extras nem obras do supervisor. Buscar o registro
  // inteiro antes de editar evita apagar essas informações ao salvar.
  async function abrirEdicaoUsuario(id: number) {
    try {
      const completo = await window.api.usuarios.buscarPorId(id)
      if (completo) setUsuarioEditando(completo)
      else toast.error('Usuário não encontrado.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar os dados do usuário.')
    }
  }

  useEffect(() => { carregarTudo() }, [])

  function carregarTudo() {
    setLoading(true)
    Promise.all([
      window.api.master.escritorio(),
      window.api.master.supervisores(),
      window.api.master.setorPessoal(),
      window.api.master.obras(),
    ]).then(([c, s, sp, o]) => {
      setCentral(c); setSupervisores(s); setSetorPessoal(sp); setObras(o)
    }).catch(() => toast.error('Erro ao carregar os dados.'))
      .finally(() => setLoading(false))
  }

  function abrirObra(obra: ObraResumo) {
    setObraAtual(obra)
    setView('obra-detalhe')
    setLoadingDetalhe(true)
    window.api.master.obraDetalhe(obra.id)
      .then(setObraDetalhe)
      .finally(() => setLoadingDetalhe(false))
  }

  function recarregarObraDetalhe() {
    if (!obraAtual) return
    window.api.master.obraDetalhe(obraAtual.id).then(setObraDetalhe)
  }

  async function handleExcluirObra(obra: ObraResumo) {
    const ok = await confirm({
      title: 'Excluir obra', danger: true,
      message: `Deseja excluir "${obra.nome}"? Todos os dados dessa obra (colaboradores, lançamentos, usuários) serão apagados. Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    // NOVO: exclusão de obra é destrutiva demais pra só um "sim" —
    // pede a senha do Administrador de novo antes de seguir.
    setObraParaExcluir(obra)
  }

  async function confirmarExclusaoObra(senha: string) {
    if (!obraParaExcluir || !usuarioLogado) return
    const verificacao = await window.api.usuarios.verificarSenha({ id: usuarioLogado.id, senha })
    if (!verificacao.ok) {
      toast.error('Senha incorreta.')
      return
    }
    try {
      await window.api.empresas.excluir(obraParaExcluir.id)
      toast.success('Obra excluída.')
      setObraParaExcluir(null)
      carregarTudo()
    } catch {
      toast.error('Erro ao excluir a obra.')
    }
  }

  async function handleExcluirCentral(c: CentralUsuario) {
    const ok = await confirm({
      title: 'Excluir usuário do Escritório Central', danger: true,
      message: `Deseja excluir "${c.nome}"? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    try {
      await window.api.usuarios.remover({ id: c.id, usuarioLogadoId: usuarioLogado?.id })
      toast.success('Usuário excluído.')
      carregarTudo()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  async function handleExcluirSetorPessoal(s: SetorPessoalUsuario) {
    const ok = await confirm({
      title: 'Excluir usuário do Setor Pessoal', danger: true,
      message: `Deseja excluir "${s.nome}"? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    try {
      await window.api.usuarios.remover({ id: s.id, usuarioLogadoId: usuarioLogado?.id })
      toast.success('Usuário excluído.')
      carregarTudo()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  async function handleExcluirSupervisor(s: SupervisorUsuario) {
    const ok = await confirm({
      title: 'Excluir Supervisor', danger: true,
      message: `Deseja excluir "${s.nome}"? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    try {
      await window.api.usuarios.remover({ id: s.id, usuarioLogadoId: usuarioLogado?.id })
      toast.success('Supervisor excluído.')
      carregarTudo()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  async function handleExcluirUsuarioObra(u: { id: number; nome: string }) {
    const ok = await confirm({
      title: 'Excluir usuário', danger: true,
      message: `Deseja excluir "${u.nome}"? Esta ação não pode ser desfeita.`,
    })
    if (!ok) return
    try {
      await window.api.usuarios.remover({ id: u.id, usuarioLogadoId: usuarioLogado?.id })
      toast.success('Usuário excluído.')
      recarregarObraDetalhe()
    } catch {
      toast.error('Erro ao excluir.')
    }
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}</div>
  }

  // ── Tela inicial: 3 caixas, na ordem certa (Escritório primeiro) ──
  if (view === 'home') {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-white">Painel Administrador</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestão completa da estrutura da empresa</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button onClick={() => setView('escritorio')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left">
            <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
              <Landmark size={20} className="text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Escritório Central</p>
              <p className="text-xs text-gray-500 mt-0.5">{central.length} usuário{central.length !== 1 && 's'}</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>

          <button onClick={() => setView('supervisores')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left">
            <div className="w-11 h-11 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
              <UserRound size={20} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Supervisores</p>
              <p className="text-xs text-gray-500 mt-0.5">{supervisores.length} supervisor{supervisores.length !== 1 && 'es'}</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>

          <button onClick={() => setView('setor-pessoal')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left">
            <div className="w-11 h-11 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0">
              <FileSignature size={20} className="text-teal-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Setor Pessoal</p>
              <p className="text-xs text-gray-500 mt-0.5">{setorPessoal.length} usuário{setorPessoal.length !== 1 && 's'}</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>

          <button onClick={() => setView('obras')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-5 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left">
            <div className="w-11 h-11 rounded-xl bg-brand-500/15 flex items-center justify-center shrink-0">
              <Building2 size={20} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Obras</p>
              <p className="text-xs text-gray-500 mt-0.5">{obras.length} obra{obras.length !== 1 && 's'}</p>
            </div>
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mt-8 mb-3">Sistema</p>
        <div className="flex flex-col md:flex-row gap-3">
          <button onClick={() => navigate('/master/usuarios')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left w-full md:w-auto md:min-w-[280px]">
            <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
              <UserRound size={17} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Todos os Usuários</p>
              <p className="text-xs text-gray-500 mt-0.5">De todas as obras, num lugar só</p>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </button>

          <button onClick={() => navigate('/master/email')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left w-full md:w-auto md:min-w-[280px]">
            <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
              <Mail size={17} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">E-mail</p>
              <p className="text-xs text-gray-500 mt-0.5">Servidor de recuperação de senha</p>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </button>

          <button onClick={() => navigate('/master/exclusoes')} className="flex items-center gap-4 bg-surface border border-surface-border rounded-xl p-4 hover:border-brand-500/50 hover:bg-surface-hover transition-colors text-left w-full md:w-auto md:min-w-[280px]">
            <div className="w-10 h-10 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
              <Trash2 size={17} className="text-brand-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Log de Exclusões</p>
              <p className="text-xs text-gray-500 mt-0.5">Quem apagou o quê, e quando</p>
            </div>
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>

        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Escritório Central ────────────────────────────────
  if (view === 'escritorio') {
    return (
      <div>
        <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Escritório Central</h1>
          <Button icon={<Plus size={15} />} onClick={() => setModalNovoCentral(true)}>Novo usuário</Button>
        </div>

        {central.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum usuário do Escritório Central cadastrado ainda.</p>
        ) : centralFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-2">
            {centralFiltrado.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                    <Landmark size={16} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{c.nome}</p>
                    <p className="text-xs text-gray-500">{c.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FileCheck2 size={13} /> {c.itens_aprovados} aprovado{c.itens_aprovados !== 1 && 's'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock size={13} /> {fmtUltimoAcesso(c.last_login_at)}
                  </span>
                  {!c.ativo && <Badge color="gray">Inativo</Badge>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirEdicaoUsuario(c.id)} title="Editar"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleExcluirCentral(c)} title="Excluir"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {modalNovoCentral && (
          <ModalNovoUsuario
            perfilPadrao="central"
            obraFixa={obras[0]?.id}
            onClose={() => setModalNovoCentral(false)}
            onSuccess={() => { setModalNovoCentral(false); carregarTudo() }}
          />
        )}
        {usuarioEditando && (
          <ModalEditarUsuario
            usuario={usuarioEditando}
            onClose={() => setUsuarioEditando(null)}
            onSuccess={() => { setUsuarioEditando(null); carregarTudo() }}
          />
        )}
        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Setor Pessoal ─────────────────────────────────────
  if (view === 'setor-pessoal') {
    return (
      <div>
        <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Setor Pessoal</h1>
          <Button icon={<Plus size={15} />} onClick={() => setModalNovoSetorPessoal(true)}>Novo usuário</Button>
        </div>

        {setorPessoal.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum usuário do Setor Pessoal cadastrado ainda.</p>
        ) : setorPessoalFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-2">
            {setorPessoalFiltrado.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
                    <FileSignature size={16} className="text-teal-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{s.nome}</p>
                    <p className="text-xs text-gray-500">{s.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FileCheck2 size={13} /> {s.solicitacoes_respondidas} respondida{s.solicitacoes_respondidas !== 1 && 's'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock size={13} /> {fmtUltimoAcesso(s.last_login_at)}
                  </span>
                  {!s.ativo && <Badge color="gray">Inativo</Badge>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirEdicaoUsuario(s.id)} title="Editar"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleExcluirSetorPessoal(s)} title="Excluir"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {modalNovoSetorPessoal && (
          <ModalNovoUsuario
            perfilPadrao="setor_pessoal"
            obraFixa={obras[0]?.id}
            onClose={() => setModalNovoSetorPessoal(false)}
            onSuccess={() => { setModalNovoSetorPessoal(false); carregarTudo() }}
          />
        )}
        {usuarioEditando && (
          <ModalEditarUsuario
            usuario={usuarioEditando}
            onClose={() => setUsuarioEditando(null)}
            onSuccess={() => { setUsuarioEditando(null); carregarTudo() }}
          />
        )}
        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Supervisores ──────────────────────────────────────
  if (view === 'supervisores') {
    return (
      <div>
        <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar
        </button>
        <h1 className="text-xl font-semibold text-white mb-6">Supervisores</h1>

        {supervisores.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum Supervisor cadastrado ainda.</p>
        ) : supervisoresFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-3">
            {supervisoresFiltrado.map(s => (
              <div key={s.id} className="bg-surface border border-surface-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                      <UserRound size={16} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{s.nome}</p>
                      <p className="text-xs text-gray-500">{s.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setModalObrasSupervisor(s)} title="Gerenciar obras"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                      <Building2 size={14} />
                    </button>
                    <button onClick={() => abrirEdicaoUsuario(s.id)} title="Editar"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleExcluirSupervisor(s)} title="Excluir"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-5 mt-2">
                  <span className="text-xs text-gray-400">
                    Obras: {s.obras.length === 0 ? 'nenhuma' : s.obras.map(o => o.nome).join(', ')}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <FileCheck2 size={13} /> {s.itens_aprovados} aprovado{s.itens_aprovados !== 1 && 's'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Clock size={13} /> {fmtUltimoAcesso(s.last_login_at)}
                  </span>
                  {!s.ativo && <Badge color="gray">Inativo</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}

        {modalObrasSupervisor && (
          <ModalObrasSupervisor
            supervisor={modalObrasSupervisor}
            todasObras={obras}
            onClose={() => setModalObrasSupervisor(null)}
            onSaved={() => { setModalObrasSupervisor(null); carregarTudo() }}
          />
        )}
        {usuarioEditando && (
          <ModalEditarUsuario
            usuario={usuarioEditando}
            onClose={() => setUsuarioEditando(null)}
            onSuccess={() => { setUsuarioEditando(null); carregarTudo() }}
          />
        )}
        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Obras (lista, criar/editar/excluir) ──────────────
  if (view === 'obras') {
    return (
      <div>
        <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Obras</h1>
          <Button icon={<Plus size={15} />} onClick={() => setModalObraAberto('novo')}>Nova obra</Button>
        </div>

        {obras.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma obra cadastrada ainda.</p>
        ) : obrasFiltrado.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
        ) : (
          <div className="space-y-2">
            {obrasFiltrado.map(o => (
              <div key={o.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3.5">
                <button onClick={() => abrirObra(o)} className="flex items-center gap-3 flex-1 text-left">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/15 flex items-center justify-center shrink-0">
                    <Building2 size={16} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{o.nome}</p>
                    <p className="text-xs text-gray-500">{[o.cidade, o.estado].filter(Boolean).join(' - ') || '—'}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setModalObraAberto(o)} title="Editar"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleExcluirObra(o)} title="Excluir"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => abrirObra(o)} title="Ver detalhes"
                    className="p-1.5 rounded-lg text-gray-500 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {modalObraAberto && (
          <ModalObra
            obra={modalObraAberto === 'novo' ? null : modalObraAberto}
            onClose={() => setModalObraAberto(null)}
            onSaved={() => { setModalObraAberto(null); carregarTudo() }}
          />
        )}
        {obraParaExcluir && (
          <ModalConfirmarSenha
            titulo="Confirmar exclusão da obra"
            mensagem={`Isso vai apagar "${obraParaExcluir.nome}" e todos os dados ligados a ela, de vez. Digite sua senha pra confirmar.`}
            onClose={() => setObraParaExcluir(null)}
            onConfirmar={confirmarExclusaoObra}
          />
        )}
        <ConfirmDialog {...dialogProps} />
      </div>
    )
  }

  // ── Detalhe de UMA obra: visão geral + gestão de usuários ──
  return (
    <div>
      <button onClick={() => setView('obras')} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
        <ArrowLeft size={14} /> Voltar às obras
      </button>

      {loadingDetalhe || !obraDetalhe ? (
        <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-24 shimmer rounded-xl" />)}</div>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-white mb-1">{obraDetalhe.empresa.nome}</h1>
          <p className="text-sm text-gray-400 mb-6">
            {obraDetalhe.supervisores.length === 0 ? 'Sem Supervisor vinculado' : `Supervisor(es): ${obraDetalhe.supervisores.map(s => s.nome).join(', ')}`}
          </p>

          {/* Visão geral RH + Financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
                <Users size={13} /> Colaboradores ativos
              </div>
              <p className="text-2xl font-bold text-white">{obraDetalhe.colaboradores}</p>
            </div>
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
                <Wallet size={13} /> Custo de Salários
              </div>
              <p className="text-lg font-bold text-white">{formatarMoeda(obraDetalhe.custo_folha)}</p>
            </div>
            <div className="bg-surface border border-surface-border rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">
                <Wallet size={13} /> Gastos do mês
              </div>
              <p className="text-lg font-bold text-white">{formatarMoeda(obraDetalhe.gastos_mes)}</p>
            </div>
          </div>

          {/* Usuários dessa obra */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-brand-400 uppercase tracking-wide">Usuários da obra</p>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setModalNovoUsuario(true)}>Novo usuário</Button>
          </div>

          {obraDetalhe.usuarios.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum usuário cadastrado nessa obra ainda.</p>
          ) : usuariosObraFiltrado.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum resultado para "{buscaQuery}".</p>
          ) : (
            <div className="space-y-2">
              {usuariosObraFiltrado.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-surface border border-surface-border rounded-xl px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{u.nome}</p>
                      <Badge color={PERFIL_COR[u.perfil] ?? 'gray'}>{PERFIL_LABEL[u.perfil] ?? u.perfil}</Badge>
                      {!u.ativo && <Badge color="gray">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{u.email} · último acesso: {fmtUltimoAcesso(u.last_login_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => abrirEdicaoUsuario(u.id)} title="Editar / liberar acessos extras"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleExcluirUsuarioObra(u)} title="Excluir"
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {modalNovoUsuario && (
            <ModalNovoUsuario
              obraFixa={obraDetalhe.empresa.id}
              onClose={() => setModalNovoUsuario(false)}
              onSuccess={() => { setModalNovoUsuario(false); recarregarObraDetalhe() }}
            />
          )}
          {usuarioEditando && (
            <ModalEditarUsuario
              usuario={usuarioEditando}
              onClose={() => setUsuarioEditando(null)}
              onSuccess={() => { setUsuarioEditando(null); recarregarObraDetalhe() }}
            />
          )}
        </>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  )
}
