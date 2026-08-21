import { useEffect, useState } from 'react'
import { apiWeb } from '../api-web'
import MobileLogin from './MobileLogin'
import MobilePainel from './MobilePainel'
import MobileColaboradores from './MobileColaboradores'
import MobileEstoque from './MobileEstoque'
import MobileAprovacoes from './MobileAprovacoes'
import MobileDiarioObra from './MobileDiarioObra'
import MobileNovaSenha from './MobileNovaSenha'
import BottomNav, { type AbaId } from './BottomNav'

type Perfil = Awaited<ReturnType<typeof apiWeb.usuarios.login>>
interface Obra { id: number; nome: string; estado: string | null }

export default function MobileShell() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  // NOVO: enquanto ainda não sabe se existe uma sessão válida salva
  // (o Supabase guarda sozinho, em localStorage), mostra um
  // carregamento simples em vez de já cravar a tela de login — evita
  // um "pisca login, depois entra" ao recarregar.
  const [verificandoSessao, setVerificandoSessao] = useState(true)
  // NOVO: fica true quando o Supabase detecta que o usuário clicou no
  // link do e-mail de "esqueci minha senha" — nesse caso, mostra a
  // tela de nova senha em vez do login/app normal.
  const [modoRecuperacaoSenha, setModoRecuperacaoSenha] = useState(false)
  const [obras, setObras] = useState<Obra[]>([])
  const [aba, setAba] = useState<AbaId>('painel')
  // NOVO: obra que o Gestor/ADM está vendo AGORA (igual o "Trocar de
  // Obra" do programa) — só existe/importa pra quem administra mais
  // de uma obra e NÃO é Supervisor.
  // ALTERADO: agora começa lendo o que já estava salvo (localStorage)
  // — antes, atualizar a página sempre voltava pra "todos os
  // estados"/primeira obra, mesmo se o usuário tivesse escolhido
  // outra coisa de propósito.
  const [obraAtivaId, setObraAtivaId] = useState<number | null>(
    () => { const v = localStorage.getItem('mobile-obra-ativa-id'); return v ? Number(v) : null }
  )
  // NOVO: fluxo do Supervisor — igual o programa (Painel do
  // Supervisor → "Obras por Estado" → obra individual). Escolhe um
  // Estado primeiro, depois (opcional) uma obra específica dentro
  // dele. Sem nada escolhido = tudo agregado, do jeito que já era.
  const [estadoSelecionado, setEstadoSelecionado] = useState<string | null>(
    () => localStorage.getItem('mobile-estado-selecionado')
  )
  const [obraSupervisorId, setObraSupervisorId] = useState<number | null>(
    () => { const v = localStorage.getItem('mobile-obra-supervisor-id'); return v ? Number(v) : null }
  )

  // NOVO: guarda os 3 filtros acima toda vez que mudam, pra
  // sobreviver a atualizar a página.
  useEffect(() => {
    if (obraAtivaId === null) localStorage.removeItem('mobile-obra-ativa-id')
    else localStorage.setItem('mobile-obra-ativa-id', String(obraAtivaId))
  }, [obraAtivaId])
  useEffect(() => {
    if (estadoSelecionado === null) localStorage.removeItem('mobile-estado-selecionado')
    else localStorage.setItem('mobile-estado-selecionado', estadoSelecionado)
  }, [estadoSelecionado])
  useEffect(() => {
    if (obraSupervisorId === null) localStorage.removeItem('mobile-obra-supervisor-id')
    else localStorage.setItem('mobile-obra-supervisor-id', String(obraSupervisorId))
  }, [obraSupervisorId])

  // NOVO: ao abrir/recarregar a página, checa se já existe uma
  // sessão válida antes de forçar login de novo — antes disso,
  // QUALQUER recarregamento de página deslogava, mesmo com a sessão
  // ainda válida guardada pelo Supabase.
  // CORRIGIDO: limite de 6 segundos — se por qualquer motivo a
  // checagem travar (ex: token velho fazendo o Supabase tentar
  // renovar sem nunca desistir), cai pra tela de login de qualquer
  // jeito, em vez de ficar carregando pra sempre.
  useEffect(() => {
    const comLimiteDeTempo = Promise.race([
      apiWeb.usuarios.sessaoAtual(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 6000)),
    ])
    comLimiteDeTempo.then(setPerfil).finally(() => setVerificandoSessao(false))
  }, [])

  // NOVO: escuta o evento que o Supabase dispara quando alguém clica
  // no link do e-mail de recuperação — chave pra saber a hora de
  // mostrar a tela de nova senha.
  useEffect(() => {
    return apiWeb.auth.aoDetectarRecuperacaoSenha(() => setModoRecuperacaoSenha(true))
  }, [])

  // NOVO: Supervisor pode gerenciar várias obras (supervisor_obras);
  // Gestor normalmente uma só, mas também respeita vínculo extra
  // (usuario_obras) se um dia ganhar mais de uma — mesma regra já
  // usada no desktop.
  useEffect(() => {
    if (!perfil) { setObras([]); return }
    ;(async () => {
      if (perfil.perfil === 'supervisor') {
        if (perfil.obras_supervisor.length === 0) { setObras([]); return }
        const lista = await apiWeb.empresas.listar()
        setObras((lista as Obra[]).filter(o => perfil.obras_supervisor.includes(o.id)))
      } else {
        const lista = await apiWeb.usuarios.minhasObras(perfil.id)
        setObras(lista as Obra[])
      }
    })()
  }, [perfil])

  // NOVO: assim que a lista de obras chega (ou muda), garante que
  // sempre tem uma obra ativa escolhida — começa na primeira (só
  // Gestor/ADM, o fluxo do Supervisor é outro, abaixo).
  useEffect(() => {
    if (perfil?.perfil === 'supervisor') return
    if (obras.length === 0) { setObraAtivaId(null); return }
    setObraAtivaId(atual => (atual && obras.some(o => o.id === atual)) ? atual : obras[0].id)
  }, [obras, perfil])

  // NOVO: trocar de Estado limpa a obra escolhida dentro dele — a
  // lista de opções muda, então a obra anterior pode nem pertencer
  // ao novo Estado escolhido.
  // REMOVIDO: useEffect(() => { setObraSupervisorId(null) }, [estadoSelecionado])
  // — resetava toda vez que estadoSelecionado mudava, inclusive no
  // carregamento inicial da página (todo useEffect roda pelo menos
  // uma vez ao montar), apagando o valor recém-lido do
  // armazenamento. Agora só reseta quando o usuário troca o Estado
  // de propósito, direto no onChange do seletor (mais abaixo).

  // NOVO: sair de verdade — sem isso, a sessão persistente (que
  // acabei de adicionar) significa que fechar a aba/guia NÃO desloga
  // mais ninguém (ela continua válida da próxima vez que abrir).
  // Precisa de um jeito explícito de encerrar.
  async function handleSair() {
    await apiWeb.auth.logout()
    setPerfil(null)
    setObras([])
    setObraAtivaId(null)
    setEstadoSelecionado(null)
    setObraSupervisorId(null)
  }

  // ALTERADO: liberado o acesso pelo computador — antes bloqueava
  // com "Acesse pelo Celular" (DesktopBloqueado.tsx), a pedido do
  // usuário, quando o acesso via computador ainda não estava pronto.

  // NOVO: prioridade máxima — se veio do link de recuperação, mostra
  // a tela de nova senha, não importa se já tinha sessão ou não.
  if (modoRecuperacaoSenha) {
    return <MobileNovaSenha onConcluido={() => setModoRecuperacaoSenha(false)} />
  }

  if (verificandoSessao) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f172a' }}>
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!perfil) {
    return <MobileLogin onLogado={setPerfil} />
  }

  const ehSupervisor = perfil.perfil === 'supervisor'

  // NOVO: estados disponíveis (só entre as obras que esse Supervisor
  // realmente acompanha), e as obras dentro do estado escolhido.
  const estadosDisponiveis = Array.from(
    new Set(obras.map(o => o.estado).filter((e): e is string => !!e))
  ).sort()
  const obrasDoEstado = estadoSelecionado ? obras.filter(o => o.estado === estadoSelecionado) : obras

  // ALTERADO: pro Supervisor, escolher uma obra específica (dentro de
  // um Estado) faz TUDO seguir só ela — inclusive os cards que antes
  // eram sempre o total (diferente do Gestor: lá, "Sua Gestão"
  // continua sendo sempre o total de tudo, só as abas operacionais
  // seguem a obra ativa). Sem Estado/obra escolhidos, continua tudo
  // agregado, como sempre foi.
  const escopoSupervisor = obraSupervisorId ? [obraSupervisorId] : obrasDoEstado.map(o => o.id)

  const empresaIds = ehSupervisor
    ? escopoSupervisor
    : (obraAtivaId ? [obraAtivaId] : [])
  // Pro Gestor, "Sua Gestão" continua o total de TUDO que administra.
  // Pro Supervisor, segue o mesmo escopo do resto (ver comentário
  // acima) — os dois conjuntos só divergem mesmo pro Gestor.
  const todasEmpresaIds = ehSupervisor ? escopoSupervisor : obras.map(o => o.id)

  const obraAtiva = obras.find(o => o.id === obraAtivaId)
  const obraSupervisorAtiva = obras.find(o => o.id === obraSupervisorId)
  // Nome mostrado na barra do topo / dentro do Painel.
  const nomeObraAtiva = ehSupervisor
    ? (obraSupervisorAtiva?.nome ?? (estadoSelecionado ? `${obrasDoEstado.length} obra(s) em ${estadoSelecionado}` : `${obras.length} obras`))
    : (obraAtiva?.nome ?? '—')
  const nomeParaPainel = ehSupervisor ? nomeObraAtiva : (obras.length === 1 ? obras[0].nome : `${obras.length} obras`)

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9' }}>
      {/* ALTERADO: essa barra agora aparece SEMPRE (antes só quando
          tinha mais de 1 obra) — o seletor de obra continua condicional,
          mas o botão de Sair precisa estar sempre visível, já que a
          sessão persistente (fechar a aba não desloga mais) tornou
          necessário um jeito explícito de encerrar. */}
      <div
        className="sticky top-0 z-20 bg-[#0f172a] border-b border-surface-border px-4 py-2 flex flex-col gap-2"
        style={{ paddingTop: 'calc(8px + env(safe-area-inset-top))' }}
      >
        {ehSupervisor ? (
          <>
            {/* NOVO: fluxo do Supervisor — Estado primeiro (igual o
                programa), depois (se quiser) uma obra específica
                dentro dele. */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0 w-11">Estado</span>
              <select
                value={estadoSelecionado ?? ''}
                onChange={e => { setEstadoSelecionado(e.target.value || null); setObraSupervisorId(null) }}
                className="flex-1 min-w-0 bg-surface border border-surface-border rounded-lg text-gray-100 text-[13px] font-semibold px-2.5 py-1.5"
              >
                <option value="">Todos os Estados</option>
                {estadosDisponiveis.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </select>
              <button
                onClick={handleSair}
                className="shrink-0 text-[11px] font-bold text-gray-400 hover:text-red-400 border border-surface-border hover:border-red-500/40 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                Sair
              </button>
            </div>
            {estadoSelecionado && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0 w-11">Obra</span>
                <select
                  value={obraSupervisorId ?? ''}
                  onChange={e => setObraSupervisorId(e.target.value ? Number(e.target.value) : null)}
                  className="flex-1 min-w-0 bg-surface border border-surface-border rounded-lg text-gray-100 text-[13px] font-semibold px-2.5 py-1.5"
                >
                  <option value="">Todas as obras de {estadoSelecionado}</option>
                  {obrasDoEstado.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            {obras.length > 1 ? (
              <>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide shrink-0">Obra</span>
                <select
                  value={obraAtivaId ?? ''}
                  onChange={e => setObraAtivaId(Number(e.target.value))}
                  className="flex-1 min-w-0 bg-surface border border-surface-border rounded-lg text-gray-100 text-[13px] font-semibold px-2.5 py-1.5"
                >
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </>
            ) : (
              <span className="flex-1 min-w-0 text-[13px] font-semibold text-gray-300 truncate">{nomeObraAtiva}</span>
            )}
            <button
              onClick={handleSair}
              className="shrink-0 text-[11px] font-bold text-gray-400 hover:text-red-400 border border-surface-border hover:border-red-500/40 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {aba === 'painel' && <MobilePainel empresaIdsAgregado={todasEmpresaIds} empresaIdsSelecionado={empresaIds} nomeObra={nomeParaPainel} ehSupervisor={ehSupervisor} />}
      {aba === 'estoque' && <MobileEstoque empresaIds={empresaIds} />}
      {aba === 'colaboradores' && <MobileColaboradores empresaIds={empresaIds} />}
      {aba === 'aprovacoes' && <MobileAprovacoes empresaIds={empresaIds} ehSupervisor={ehSupervisor} />}
      {/* NOVO: Diário de Obra pelo celular — só pro Gestor (mesma
          regra de quem edita no programa; empresaIds aqui já é só a
          obra ativa dele, nunca a agregada). */}
      {aba === 'diario' && !ehSupervisor && <MobileDiarioObra empresaIds={empresaIds} />}
      <BottomNav abaAtual={aba} onMudar={setAba} mostrarDiario={!ehSupervisor} />
    </div>
  )
}
