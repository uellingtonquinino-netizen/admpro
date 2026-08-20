import { useEffect, useState } from 'react'
import { useEmpresaStore }      from '@store/empresa.store'
import { toast }                from '@components/ui/ToastContainer'
import Modal                    from '@components/ui/Modal'
import Button                   from '@components/ui/Button'
import Input                    from '@components/ui/Input'
import Select                   from '@components/ui/Select'
import OpcoesCadastroModal      from './OpcoesCadastroModal'
import SolicitarPessoalModal    from './SolicitarPessoalModal'
import { formatCPF, formatMoeda, parseMoeda, formatCEP } from '@utils/documentValidators'
import { Settings, CheckCircle2, Send, Paperclip, Trash2 } from 'lucide-react'

interface Colaborador {
  id: number
  [key: string]: unknown
}

interface Props {
  open:      boolean
  onClose:   () => void
  onSaved:   () => void
  onRefresh?: (id: number) => void  // NOVO: atualiza a lista sem fechar o modal (usado depois de salvar, pra mostrar "Enviar para o Setor Pessoal")
  colaborador?: Colaborador | null
}

interface FormData {
  nome:                          string
  matricula_esocial:             string
  cpf:                           string
  rg:                            string
  rg_orgao_emissor:              string
  nascimento:                    string
  estado_civil:                  string
  nacionalidade:                 string
  nome_mae:                      string
  nome_pai:                      string
  escolaridade:                  string
  pcd:                           boolean
  funcao:                        string
  setor:                         string
  equipe:                        string
  tipo_contrato:                 string
  data_admissao:                 string
  dias_experiencia:              string
  data_vencimento_experiencia:   string
  status:                        string
  data_demissao:                 string
  ctps:                          string
  ctps_serie:                    string
  pis:                           string
  telefone:                      string
  email:                         string
  contato_emergencia_nome:       string
  contato_emergencia_telefone:   string
  endereco:                      string
  numero:                        string
  bairro:                        string
  cidade:                        string
  estado:                        string
  cep:                           string
  banco:                         string
  agencia:                       string
  operacao:                      string
  conta:                         string
  conta_digito:                  string
  tipo_conta:                    string
  passagem:                      string
  valor_ida_volta:               string
  alimentacao:                   string
  tamanho_camisa:                string
  tamanho_calca:                 string
  numero_calcado:                string
  salario_base:                  string
  observacoes:                   string
  titulo_numero:                 string
  titulo_zona:                   string
  titulo_secao:                  string
  reservista:                    string
  cnh_numero:                    string
  cnh_categoria:                 string
  cnh_vencimento:                string
  cor_raca:                      string
  alojado:                       boolean
  tem_baixada:                   boolean
  dias_periodo_baixada:          string
  data_vencimento_baixada:       string
  sexo:                          string
  naturalidade:                  string
  cbo:                           string
  rg_data_emissao:               string
  ctps_data_expedicao:           string
  ctps_uf:                       string
}

const EMPTY: FormData = {
  nome: '', matricula_esocial: '', cpf: '', rg: '', rg_orgao_emissor: '', nascimento: '',
  estado_civil: '', nacionalidade: 'Brasileira', nome_mae: '', nome_pai: '',
  escolaridade: '', pcd: false, funcao: '', setor: '', equipe: '',
  tipo_contrato: 'CLT', data_admissao: '', dias_experiencia: '45',
  data_vencimento_experiencia: '', status: 'ativo', data_demissao: '', ctps: '', ctps_serie: '',
  pis: '', telefone: '', email: '', contato_emergencia_nome: '',
  contato_emergencia_telefone: '', endereco: '', numero: '', bairro: '',
  cidade: '', estado: '', cep: '', banco: '', agencia: '', operacao: '',
  conta: '', conta_digito: '', tipo_conta: 'corrente', passagem: '',
  valor_ida_volta: '', alimentacao: '', tamanho_camisa: '', tamanho_calca: '',
  numero_calcado: '', salario_base: '', observacoes: '',
  titulo_numero: '', titulo_zona: '', titulo_secao: '', reservista: '',
  cnh_numero: '', cnh_categoria: '', cnh_vencimento: '', cor_raca: '',
  alojado: false, tem_baixada: false, dias_periodo_baixada: '', data_vencimento_baixada: '',
  sexo: '', naturalidade: '', cbo: '', rg_data_emissao: '',
  ctps_data_expedicao: '', ctps_uf: '',
}

const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)']
const ESCOLARIDADES = [
  'Fundamental incompleto', 'Fundamental completo',
  'Médio incompleto', 'Médio completo',
  'Superior incompleto', 'Superior completo', 'Pós-graduação',
]
const COR_RACA = ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não informada']
const SEXOS = ['Masculino', 'Feminino']
const CNH_CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E']
const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
  'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

function Secao({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {children}
      </div>
    </div>
  )
}

export default function ColaboradorModal({ open, onClose, onSaved, onRefresh, colaborador }: Props) {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const [form, setForm]       = useState<FormData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [opcoesOpen, setOpcoesOpen] = useState(false)
  const [funcoes, setFuncoes] = useState<{ id: number; nome: string }[]>([])
  const [setores, setSetores] = useState<{ id: number; nome: string }[]>([])
  const [equipes, setEquipes] = useState<{ id: number; nome: string }[]>([])

  // NOVO: depois de salvar (sem fechar o modal), guarda o id pra
  // liberar o botão "Enviar para o Setor Pessoal" e a seção de
  // anexos soltos (certidões etc.) — em edição já vem preenchido.
  const [colaboradorSalvoId, setColaboradorSalvoId] = useState<number | null>(colaborador?.id ?? null)
  const [mostrarSolicitarPessoal, setMostrarSolicitarPessoal] = useState(false)
  const [anexos, setAnexos] = useState<{ id: number; nome: string; caminho: string; descricao: string | null }[]>([])
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)

  function carregarAnexos(id: number) {
    window.api.colaboradores.listarAnexos(id).then(setAnexos)
  }

  async function carregarOpcoes() {
    if (!empresaId) return
    const [f, s, e] = await Promise.all([
      window.api.opcoes.listar({ empresa_id: empresaId, tipo: 'funcao' }),
      window.api.opcoes.listar({ empresa_id: empresaId, tipo: 'setor' }),
      window.api.opcoes.listar({ empresa_id: empresaId, tipo: 'equipe' }),
    ])
    setFuncoes(f); setSetores(s); setEquipes(e)
  }

  useEffect(() => { if (open) carregarOpcoes() }, [open, empresaId])

  useEffect(() => {
    if (!open) return
    if (colaborador) {
      const c = colaborador as Record<string, unknown>
      const next = { ...EMPTY }
      for (const key of Object.keys(EMPTY) as (keyof FormData)[]) {
        const v = c[key]
        if (key === 'pcd' || key === 'alojado' || key === 'tem_baixada') {
          ;(next[key] as boolean) = !!v
        } else if (key === 'salario_base' && v !== null && v !== undefined) {
          ;(next[key] as string) = Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        } else if (v !== null && v !== undefined) {
          ;(next[key] as string) = String(v)
        }
      }
      setForm(next)
      setColaboradorSalvoId(colaborador.id)
      carregarAnexos(colaborador.id)
    } else {
      setForm(EMPTY)
      setColaboradorSalvoId(null)
      setAnexos([])
    }
  }, [open, colaborador])

  // NOVO: vencimento da experiência calculado automaticamente a partir
  // da data de admissão + dias de experiência (mesmo padrão já usado
  // no Comunicado de Dispensa ao Setor Pessoal) — o dia da admissão
  // conta como o 1° dia do período.
  // CORRIGIDO: se a data de admissão vier num formato inesperado (ex:
  // planilha importada com data fora do padrão AAAA-MM-DD), o cálculo
  // agora é ignorado silenciosamente em vez de travar a tela.
  useEffect(() => {
    if (!form.data_admissao || !form.dias_experiencia) return
    if (!/^\d{4}-\d{2}-\d{2}/.test(form.data_admissao)) return
    const admissao = new Date(`${form.data_admissao}T00:00:00`)
    if (Number.isNaN(admissao.getTime())) return
    admissao.setDate(admissao.getDate() + Number(form.dias_experiencia) - 1)
    const iso = admissao.toISOString().slice(0, 10)
    setForm(prev => (prev.data_vencimento_experiencia === iso ? prev : { ...prev, data_vencimento_experiencia: iso }))
  }, [form.data_admissao, form.dias_experiencia])

  // NOVO: vencimento da baixada calculado automaticamente a partir da
  // data de admissão + dias do período de trabalho — mesmo princípio
  // do vencimento da experiência acima, só que só calcula se "Tem
  // baixada" estiver marcado.
  useEffect(() => {
    if (!form.tem_baixada || !form.data_admissao || !form.dias_periodo_baixada) return
    if (!/^\d{4}-\d{2}-\d{2}/.test(form.data_admissao)) return
    const admissao = new Date(`${form.data_admissao}T00:00:00`)
    if (Number.isNaN(admissao.getTime())) return
    admissao.setDate(admissao.getDate() + Number(form.dias_periodo_baixada) - 1)
    const iso = admissao.toISOString().slice(0, 10)
    setForm(prev => (prev.data_vencimento_baixada === iso ? prev : { ...prev, data_vencimento_baixada: iso }))
  }, [form.tem_baixada, form.data_admissao, form.dias_periodo_baixada])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // NOVO: preencher a Data de Demissão já marca o Status como
  // Desligado sozinho — só nessa direção (limpar a data de propósito
  // não desfaz o status, pra não reverter um desligamento por
  // acidente só por apagar a data sem querer).
  function setDataDemissao(valor: string) {
    setForm(prev => ({ ...prev, data_demissao: valor, status: valor ? 'desligado' : prev.status }))
  }

  // NOVO: ao completar os 8 dígitos do CEP, busca o endereço
  // automaticamente e preenche Endereço/Bairro/Cidade/UF.
  const [buscandoCep, setBuscandoCep] = useState(false)
  async function handleCepChange(valorDigitado: string) {
    const formatado = formatCEP(valorDigitado)
    set('cep', formatado)
    const digitos = valorDigitado.replace(/\D/g, '')
    if (digitos.length !== 8) return

    setBuscandoCep(true)
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      const dados = await resp.json()
      if (!dados.erro) {
        setForm(prev => ({
          ...prev,
          endereco: dados.logradouro || prev.endereco,
          bairro:   dados.bairro     || prev.bairro,
          cidade:   dados.localidade || prev.cidade,
          estado:   dados.uf         || prev.estado,
        }))
      }
    } catch {
      // Sem internet ou serviço fora do ar — usuário preenche manualmente
    } finally {
      setBuscandoCep(false)
    }
  }

  async function handleSubmit() {
    if (!form.nome.trim()) { toast.error('Informe o nome do colaborador.'); return }
    if (!empresaId) return

    setLoading(true)
    try {
      const payload = {
        ...form,
        dias_experiencia: form.dias_experiencia ? Number(form.dias_experiencia) : null,
        dias_periodo_baixada: form.dias_periodo_baixada ? Number(form.dias_periodo_baixada) : null,
        salario_base:     parseMoeda(form.salario_base),
        valor_ida_volta:  form.valor_ida_volta  ? Number(form.valor_ida_volta.replace(',', '.'))  : null,
        alimentacao:      form.alimentacao      ? Number(form.alimentacao.replace(',', '.'))      : null,
      }

      let idFinal: number
      if (colaborador) {
        await window.api.colaboradores.atualizar({ id: colaborador.id, ...payload })
        idFinal = colaborador.id
        toast.success('Colaborador atualizado.')
      } else {
        const { id } = await window.api.colaboradores.criar({ empresa_id: empresaId, ...payload })
        idFinal = id
        toast.success('Colaborador cadastrado.')
      }
      // ALTERADO: não fecha mais sozinho — fica aberto com o botão
      // "Enviar para o Setor Pessoal" disponível, e quem fecha é o
      // próprio usuário (Cancelar/X), que já atualiza a lista.
      setColaboradorSalvoId(idFinal)
      carregarAnexos(idFinal)
      onRefresh?.(idFinal)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar colaborador.')
    } finally {
      setLoading(false)
    }
  }

  function handleSelecionarAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    if (!colaboradorSalvoId) return
    const arquivos = Array.from(e.target.files ?? [])
    if (arquivos.length === 0) return
    setEnviandoAnexo(true)
    Promise.all(arquivos.map(f => window.api.colaboradores.adicionarAnexo({
      colaborador_id: colaboradorSalvoId,
      caminho: (f as unknown as { path: string }).path,
      nome: f.name,
    }))).then(() => carregarAnexos(colaboradorSalvoId))
      .catch(() => toast.error('Erro ao anexar arquivo.'))
      .finally(() => setEnviandoAnexo(false))
    e.target.value = ''
  }

  async function handleRemoverAnexo(id: number) {
    if (!colaboradorSalvoId) return
    await window.api.colaboradores.removerAnexo(id)
    carregarAnexos(colaboradorSalvoId)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title={colaborador ? 'Editar colaborador' : 'Novo colaborador'}
    >
      {/* NOVO: aparece assim que o colaborador é salvo (sem fechar o
          modal) — manda a movimentação pro Setor Pessoal direto daqui. */}
      {colaboradorSalvoId && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 mb-5">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-200 flex-1">Colaborador salvo.</p>
          <Button size="sm" icon={<Send size={13} />} onClick={() => setMostrarSolicitarPessoal(true)}>
            Enviar para o Setor Pessoal
          </Button>
        </div>
      )}

      <Secao title="Identificação">
        <Input label="Nome completo" value={form.nome} onChange={e => set('nome', e.target.value)} className="md:col-span-3" />
        <Input label="Código (matrícula e-Social)" value={form.matricula_esocial} onChange={e => set('matricula_esocial', e.target.value)} />
        <Input label="CPF" value={form.cpf} onChange={e => set('cpf', formatCPF(e.target.value))} placeholder="000.000.000-00" />
        <Input label="RG" value={form.rg} onChange={e => set('rg', e.target.value)} />
        <Input label="Órgão emissor" value={form.rg_orgao_emissor} onChange={e => set('rg_orgao_emissor', e.target.value)} placeholder="SSP/UF" />
        <Input label="RG — Data de emissão" type="date" value={form.rg_data_emissao} onChange={e => set('rg_data_emissao', e.target.value)} />
        <Input label="Nascimento" type="date" value={form.nascimento} onChange={e => set('nascimento', e.target.value)} />
        <Input label="Naturalidade (cidade - UF)" value={form.naturalidade} onChange={e => set('naturalidade', e.target.value)} placeholder="Ex: JOÃO PESSOA - PB" />
        <Select label="Sexo" value={form.sexo} onChange={e => set('sexo', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...SEXOS.map(v => ({ value: v, label: v }))]} />
        <Select label="Estado civil" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...ESTADOS_CIVIS.map(v => ({ value: v, label: v }))]} />
        <Input label="Nacionalidade" value={form.nacionalidade} onChange={e => set('nacionalidade', e.target.value)} />
        <Input label="Nome da mãe" value={form.nome_mae} onChange={e => set('nome_mae', e.target.value)} className="md:col-span-2" />
        <Input label="Nome do pai" value={form.nome_pai} onChange={e => set('nome_pai', e.target.value)} className="md:col-span-2" />
        <Select label="Escolaridade" value={form.escolaridade} onChange={e => set('escolaridade', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...ESCOLARIDADES.map(v => ({ value: v, label: v }))]} />
        <Select label="Cor/Raça" value={form.cor_raca} onChange={e => set('cor_raca', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...COR_RACA.map(v => ({ value: v, label: v }))]} />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.pcd} onChange={e => set('pcd', e.target.checked)} className="accent-brand-500 w-4 h-4" />
          Pessoa com deficiência (PCD)
        </label>
      </Secao>

      <Secao title="Contrato">
        <div className="md:col-span-3 flex items-center justify-between -mb-1">
          <p className="text-xs text-gray-500">Função, Setor e Equipe vêm das listas cadastradas.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Settings size={13} />}
            onClick={() => setOpcoesOpen(true)}
          >
            Gerenciar listas
          </Button>
        </div>
        <Select label="Função" value={form.funcao} onChange={e => set('funcao', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...funcoes.map(f => ({ value: f.nome, label: f.nome }))]} />
        <Input label="C.B.O." value={form.cbo} onChange={e => set('cbo', e.target.value)} placeholder="Ex: 717020" />
        <Select label="Setor" value={form.setor} onChange={e => set('setor', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...setores.map(s => ({ value: s.nome, label: s.nome }))]} />
        <Select label="Equipe" value={form.equipe} onChange={e => set('equipe', e.target.value)}
          options={[{ value: '', label: 'Selecione' }, ...equipes.map(eq => ({ value: eq.nome, label: eq.nome }))]} />
        <Select label="Tipo de contrato" value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)}
          options={[
            { value: 'CLT', label: 'CLT' },
            { value: 'Temporário', label: 'Temporário' },
            { value: 'Estágio', label: 'Estágio' },
            { value: 'PJ', label: 'PJ' },
          ]} />
        <Select label="Status" value={form.status} onChange={e => set('status', e.target.value)}
          options={[
            { value: 'ativo', label: 'Ativo' },
            { value: 'afastado', label: 'Afastado' },
            { value: 'ferias', label: 'Férias' },
            { value: 'desligado', label: 'Desligado' },
          ]} />
        <Input label="Salário base (R$)" value={form.salario_base} onChange={e => set('salario_base', formatMoeda(e.target.value))} placeholder="0,00" />
        <Input label="Data de admissão" type="date" value={form.data_admissao} onChange={e => set('data_admissao', e.target.value)} />
        {/* NOVO: campo que faltava — sem ele, desligar um colaborador
            (aqui ou pelo Comunicado de Dispensa) nunca gravava a
            data, só o status. Digitar uma data aqui já marca o
            status como Desligado sozinho, pra não esquecer de trocar
            os dois campos por mão. */}
        <Input label="Data de demissão" type="date" value={form.data_demissao} onChange={e => setDataDemissao(e.target.value)} />
        <Input label="Dias de experiência" type="number" value={form.dias_experiencia} onChange={e => set('dias_experiencia', e.target.value)} />
        <Input label="Vencimento da experiência" type="date" value={form.data_vencimento_experiencia} disabled
          title="Calculado automaticamente a partir da admissão e dos dias de experiência" />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.alojado} onChange={e => set('alojado', e.target.checked)} className="accent-brand-500 w-4 h-4" />
          Alojado
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.tem_baixada} onChange={e => set('tem_baixada', e.target.checked)} className="accent-brand-500 w-4 h-4" />
          Tem baixada
        </label>
        {form.tem_baixada && (
          <>
            <Input label="Período de trabalho (dias)" type="number" value={form.dias_periodo_baixada} onChange={e => set('dias_periodo_baixada', e.target.value)} />
            <Input label="Vencimento da baixada" type="date" value={form.data_vencimento_baixada} disabled
              title="Calculado automaticamente a partir da admissão e dos dias do período de trabalho" />
          </>
        )}
      </Secao>

      <Secao title="Documentos adicionais">
        <Input label="Título de eleitor — N°" value={form.titulo_numero}
          onChange={e => set('titulo_numero', e.target.value.replace(/\D/g, '').slice(0, 12))}
          placeholder="12 dígitos" />
        <Input label="Título de eleitor — Zona" value={form.titulo_zona}
          onChange={e => set('titulo_zona', e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="3 dígitos" />
        <Input label="Título de eleitor — Seção" value={form.titulo_secao}
          onChange={e => set('titulo_secao', e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="4 dígitos" />
        <Input label="Reservista" value={form.reservista} onChange={e => set('reservista', e.target.value)} />
        <Input label="CNH — N°" value={form.cnh_numero} onChange={e => set('cnh_numero', e.target.value)} />
        <Select label="CNH — Categoria" value={form.cnh_categoria} onChange={e => set('cnh_categoria', e.target.value)}
          options={[{ value: '', label: '—' }, ...CNH_CATEGORIAS.map(v => ({ value: v, label: v }))]} />
        <Input label="CNH — Vencimento" type="date" value={form.cnh_vencimento} onChange={e => set('cnh_vencimento', e.target.value)} />
      </Secao>

      <Secao title="Documentos trabalhistas">
        <Input label="CTPS" value={form.ctps} onChange={e => set('ctps', e.target.value)} />
        <Input label="Série" value={form.ctps_serie} onChange={e => set('ctps_serie', e.target.value)} />
        <Select label="CTPS — UF" value={form.ctps_uf} onChange={e => set('ctps_uf', e.target.value)}
          options={[{ value: '', label: '—' }, ...UFS.map(uf => ({ value: uf, label: uf }))]} />
        <Input label="CTPS — Data de expedição" type="date" value={form.ctps_data_expedicao} onChange={e => set('ctps_data_expedicao', e.target.value)} />
        <Input label="PIS/NIS" value={form.pis} onChange={e => set('pis', e.target.value)} />
      </Secao>

      <Secao title="Contato">
        <Input label="Telefone" value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
        <Input label="E-mail" type="email" value={form.email} onChange={e => set('email', e.target.value)} className="md:col-span-2" />
        <Input label="Contato de emergência — nome" value={form.contato_emergencia_nome} onChange={e => set('contato_emergencia_nome', e.target.value)} />
        <Input label="Contato de emergência — telefone" value={form.contato_emergencia_telefone} onChange={e => set('contato_emergencia_telefone', e.target.value)} />
      </Secao>

      <Secao title="Endereço">
        <Input label="Endereço" value={form.endereco} onChange={e => set('endereco', e.target.value)} className="md:col-span-2" />
        <Input label="Número" value={form.numero} onChange={e => set('numero', e.target.value)} />
        <Input label="Bairro" value={form.bairro} onChange={e => set('bairro', e.target.value)} />
        <Input label="Cidade" value={form.cidade} onChange={e => set('cidade', e.target.value)} />
        <Select label="UF" value={form.estado} onChange={e => set('estado', e.target.value)}
          options={[{ value: '', label: '—' }, ...UFS.map(uf => ({ value: uf, label: uf }))]} />
        <Input
          label="CEP"
          value={form.cep}
          onChange={e => handleCepChange(e.target.value)}
          placeholder="00.000-000"
        />
        {buscandoCep && <p className="text-xs text-gray-500 -mt-2">Buscando endereço…</p>}
      </Secao>

      <Secao title="Dados bancários">
        <Input label="Banco" value={form.banco} onChange={e => set('banco', e.target.value)} />
        <Input label="Agência" value={form.agencia} onChange={e => set('agencia', e.target.value)} />
        <Input label="Operação" value={form.operacao} onChange={e => set('operacao', e.target.value)} />
        <Input label="Conta" value={form.conta} onChange={e => set('conta', e.target.value)} />
        <Input label="Dígito" value={form.conta_digito} onChange={e => set('conta_digito', e.target.value)} />
        <Select label="Tipo de conta" value={form.tipo_conta} onChange={e => set('tipo_conta', e.target.value)}
          options={[
            { value: 'corrente', label: 'Corrente' },
            { value: 'poupanca', label: 'Poupança' },
            { value: 'salario', label: 'Salário' },
            { value: 'pix', label: 'Chave PIX' },
          ]} />
      </Secao>

      <Secao title="Benefícios e uniforme">
        <Select label="Passagem" value={form.passagem} onChange={e => set('passagem', e.target.value)}
          options={[
            { value: '', label: 'Selecione' },
            { value: 'Sim', label: 'Sim' },
            { value: 'Não', label: 'Não' },
          ]} />
        <Input label="Valor ida e volta (R$)" value={form.valor_ida_volta} onChange={e => set('valor_ida_volta', e.target.value)} placeholder="0,00" />
        <Input label="Alimentação (R$)" value={form.alimentacao} onChange={e => set('alimentacao', e.target.value)} placeholder="0,00" />
        <Input label="Tamanho da camisa" value={form.tamanho_camisa} onChange={e => set('tamanho_camisa', e.target.value)} placeholder="P/M/G/GG" />
        <Input label="Tamanho da calça" value={form.tamanho_calca} onChange={e => set('tamanho_calca', e.target.value)} />
        <Input label="Número do calçado" value={form.numero_calcado} onChange={e => set('numero_calcado', e.target.value)} />
      </Secao>

      <Secao title="Observações">
        <textarea
          value={form.observacoes}
          onChange={e => set('observacoes', e.target.value.toUpperCase())}
          rows={3}
          className="input md:col-span-3 resize-none"
          placeholder="Observações gerais sobre o colaborador…"
        />
      </Secao>

      {/* NOVO: anexos soltos do cadastro (ex: certidão de nascimento
          de filho) — só depois de salvar pelo menos uma vez, já que
          precisa de um colaborador_id pra vincular o arquivo. */}
      {colaboradorSalvoId && (
        <Secao title="Anexos">
          <div className="md:col-span-3">
            <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-surface-border rounded-lg text-sm text-gray-400 hover:border-brand-500/50 hover:text-brand-400 cursor-pointer transition-colors">
              <Paperclip size={14} /> {enviandoAnexo ? 'Anexando…' : 'Anexar documento(s) — ex: certidão de nascimento de filho'}
              <input type="file" multiple className="hidden" onChange={handleSelecionarAnexo} disabled={enviandoAnexo} />
            </label>
            {anexos.length > 0 && (
              <div className="space-y-1.5 mt-3">
                {anexos.map(a => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg text-sm text-gray-300">
                    <Paperclip size={13} className="shrink-0" /> {a.nome}
                    <button onClick={() => handleRemoverAnexo(a.id)} title="Remover"
                      className="ml-auto text-gray-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Secao>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {colaboradorSalvoId ? 'Fechar' : 'Cancelar'}
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          {colaborador ? 'Salvar alterações' : 'Cadastrar colaborador'}
        </Button>
      </div>

      {opcoesOpen && (
        <OpcoesCadastroModal
          onClose={() => setOpcoesOpen(false)}
          onChange={carregarOpcoes}
        />
      )}
      {mostrarSolicitarPessoal && colaboradorSalvoId && empresaId && (
        <SolicitarPessoalModal
          colaboradorId={colaboradorSalvoId}
          colaboradorNome={form.nome}
          empresaId={empresaId}
          onClose={() => setMostrarSolicitarPessoal(false)}
          onEnviado={() => setMostrarSolicitarPessoal(false)}
        />
      )}
    </Modal>
  )
}
