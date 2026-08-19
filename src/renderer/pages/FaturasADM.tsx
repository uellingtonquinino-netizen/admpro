import { useEffect, useState, useCallback } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { useAuthStore }    from '@store/auth.store'
import { toast }           from '@components/ui/ToastContainer'
import PageHeader          from '@components/layout/PageHeader'
import Button               from '@components/ui/Button'
import Modal                 from '@components/ui/Modal'
import Input                 from '@components/ui/Input'
import { Receipt, FileText, Zap, PauseCircle, FileSignature, CheckCircle2 } from 'lucide-react'

// ALTERADO: liberado — a única condição agora é a assinatura do
// contrato (ver handleAssinar). A pausa geral que existia antes foi
// removida a pedido do usuário.
const GERACAO_HABILITADA = true

interface Fatura {
  id: number
  mes_competencia: string
  vencimento: string
  valor: number
  status: 'aberta' | 'paga' | 'cancelada'
  boleto_pdf_url: string | null
  data_pagamento: string | null
}

// NOVO: Contrato de Prestação de Serviços, com assinatura eletrônica
// simples (nome digitado + confirmação).
interface Contrato {
  id: number
  texto_completo: string
  status: 'pendente' | 'assinado'
  assinado_por_nome: string | null
  data_assinatura: string | null
}

function formatReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function formatDataBR(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/')
}
function nomeDoMes(mesCompetencia: string): string {
  const [ano, mes] = mesCompetencia.slice(0, 7).split('-')
  const nomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${nomes[Number(mes) - 1]} de ${ano}`
}

// ALTERADO: antes precisava gerar a fatura (e o boleto) todo mês, na
// mão. Agora é só ATIVAR a cobrança automática uma vez — o Asaas
// (via Assinatura) passa a gerar sozinho um boleto novo todo mês, e
// ele já chega pronto aqui na lista (o webhook cuida disso em
// segundo plano, sem precisar o programa estar aberto).
export default function FaturasADM() {
  const empresaId = useEmpresaStore(s => s.empresaId)
  const usuario    = useAuthStore(s => s.usuario)

  const [assinaturaAtiva, setAssinaturaAtiva] = useState<boolean | null>(null)
  const [ativando, setAtivando] = useState(false)
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [carregando, setCarregando] = useState(true)

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [modalContratoAberto, setModalContratoAberto] = useState(false)
  const [nomeAssinatura, setNomeAssinatura] = useState('')
  const [assinando, setAssinando] = useState(false)

  const carregarContrato = useCallback(() => {
    if (!empresaId) return
    window.api.contratos.buscarOuCriar(empresaId).then(setContrato).catch(() => {})
  }, [empresaId])

  useEffect(() => { carregarContrato() }, [carregarContrato])

  async function handleAtivar() {
    if (!empresaId) return
    setAtivando(true)
    try {
      await window.api.faturas.ativarAssinatura(empresaId)
      toast.success('Cobrança automática ativada — o primeiro boleto deve aparecer aqui em instantes.')
      carregar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ativar. Confere se o valor da mensalidade já foi definido pelo Master.')
    } finally {
      setAtivando(false)
    }
  }

  // ALTERADO: assinar o contrato agora já ativa a cobrança automática
  // na hora, sem precisar de um segundo clique separado — pedido
  // explícito do usuário. Só ativa se GERACAO_HABILITADA (a pausa
  // geral continua valendo, mesmo com contrato assinado).
  async function handleAssinar() {
    if (!contrato || !usuario || !empresaId) return
    if (nomeAssinatura.trim().length < 5) { toast.error('Digite seu nome completo.'); return }
    setAssinando(true)
    try {
      await window.api.contratos.assinar({ contrato_id: contrato.id, nome_completo: nomeAssinatura.trim(), usuario_id: usuario.id })
      carregarContrato()

      if (GERACAO_HABILITADA) {
        try {
          await window.api.faturas.ativarAssinatura(empresaId)
          toast.success('Contrato assinado e cobrança automática já ativada — o primeiro boleto aparece aqui em instantes.')
        } catch (erroAtivacao) {
          // Contrato assinado com sucesso, mas a ativação da cobrança
          // falhou — não desfaz a assinatura do contrato, só avisa
          // que precisa tentar ativar de novo (o botão de fallback
          // aparece sozinho, já que assinaturaAtiva continua false).
          toast.error(erroAtivacao instanceof Error
            ? `Contrato assinado, mas não consegui ativar a cobrança automática: ${erroAtivacao.message}`
            : 'Contrato assinado, mas não consegui ativar a cobrança automática.')
        }
      } else {
        toast.success('Contrato assinado.')
      }

      setModalContratoAberto(false)
      carregar()
    } catch {
      toast.error('Erro ao assinar o contrato.')
    } finally {
      setAssinando(false)
    }
  }

  const carregar = useCallback(() => {
    if (!empresaId) return
    setCarregando(true)
    Promise.all([
      window.api.faturas.statusAssinatura(empresaId),
      window.api.faturas.listar(empresaId),
    ]).then(([status, lista]) => {
      setAssinaturaAtiva(status.ativa)
      setFaturas(lista)
    }).finally(() => setCarregando(false))
  }, [empresaId])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div>
      <PageHeader title="Faturas" subtitle="Mensalidade de uso do sistema" />

      {/* NOVO: Contrato de Prestação de Serviços */}
      {contrato && (
        <div className={
          contrato.status === 'assinado'
            ? 'flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-5 py-4 mb-6'
            : 'flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-4 mb-6'
        }>
          <div className="flex items-center gap-3">
            {contrato.status === 'assinado'
              ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
              : <FileSignature size={20} className="text-amber-400 shrink-0" />}
            <div>
              <p className="text-sm font-semibold text-white">Contrato de Prestação de Serviços</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {contrato.status === 'assinado'
                  ? `Assinado por ${contrato.assinado_por_nome} em ${formatDataBR(contrato.data_assinatura!)}`
                  : 'Pendente de assinatura'}
              </p>
            </div>
          </div>
          <Button
            size="sm" variant={contrato.status === 'assinado' ? 'outline' : 'primary'}
            icon={<FileSignature size={13} />}
            onClick={() => { setNomeAssinatura(contrato.assinado_por_nome ?? ''); setModalContratoAberto(true) }}
          >
            {contrato.status === 'assinado' ? 'Ver Contrato' : 'Ver e Assinar'}
          </Button>
        </div>
      )}

      {carregando ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 shimmer rounded-xl" />)}</div>
      ) : !assinaturaAtiva ? (
        <div className="py-16 text-center bg-surface border border-surface-border rounded-xl">
          {!GERACAO_HABILITADA ? (
            <>
              <PauseCircle size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400">A geração de faturas está temporariamente pausada.</p>
            </>
          ) : contrato?.status !== 'assinado' ? (
            // ALTERADO: contrato ainda não assinado — não mostra botão
            // de ativar aqui, já que assinar o contrato (acima) é
            // quem ativa a cobrança sozinho agora, automaticamente.
            <>
              <FileSignature size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400">Assine o Contrato de Prestação de Serviços acima pra ativar a cobrança automática.</p>
            </>
          ) : (
            // Contrato já assinado, mas a ativação não aconteceu (ex:
            // falhou na hora de assinar) — fallback pra tentar de novo
            // manualmente, sem precisar assinar tudo outra vez.
            <>
              <Zap size={36} className="mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400 mb-1">O contrato já foi assinado, mas a cobrança automática ainda não foi ativada.</p>
              <p className="text-xs text-gray-500 mb-5">Isso pode acontecer se a ativação falhou no momento da assinatura — tenta de novo abaixo.</p>
              <Button icon={<Zap size={15} />} onClick={handleAtivar} loading={ativando}>
                Tentar Ativar Novamente
              </Button>
            </>
          )}
        </div>
      ) : faturas.length === 0 ? (
        <div className="py-16 text-center bg-surface border border-surface-border rounded-xl">
          <Receipt size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">Cobrança automática ativa — a primeira fatura aparece aqui assim que o Asaas gerar.</p>
        </div>
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_110px_110px_120px] gap-2 px-4 py-2.5 border-b border-surface-border text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Competência</span>
            <span>Vencimento</span>
            <span className="text-right">Valor</span>
            <span>Situação</span>
            <span></span>
          </div>
          {faturas.map(f => (
            <div key={f.id} className="grid grid-cols-[1fr_120px_110px_110px_120px] gap-2 px-4 py-3 border-b border-surface-border/50 items-center">
              <span className="text-sm font-medium text-white">{nomeDoMes(f.mes_competencia)}</span>
              <span className="text-sm text-gray-300">{formatDataBR(f.vencimento)}</span>
              <span className="text-sm text-gray-300 text-right font-mono">{formatReais(f.valor)}</span>
              <span>
                {f.status === 'paga' ? (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded">Paga</span>
                ) : f.status === 'cancelada' ? (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500 bg-gray-500/15 px-2 py-0.5 rounded">Cancelada</span>
                ) : (
                  <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">Em aberto</span>
                )}
              </span>
              <div className="flex justify-end">
                {f.boleto_pdf_url ? (
                  <Button size="sm" variant="outline" icon={<FileText size={13} />} onClick={() => window.open(f.boleto_pdf_url!, '_blank')}>
                    Imprimir
                  </Button>
                ) : (
                  <span className="text-xs text-gray-500">Gerando…</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal — ver e assinar o contrato */}
      <Modal open={modalContratoAberto} onClose={() => setModalContratoAberto(false)} title="Contrato de Prestação de Serviços" size="lg">
        {contrato && (
          <div>
            <div className="bg-surface-hover border border-surface-border rounded-xl p-4 max-h-[50vh] overflow-y-auto mb-4">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{contrato.texto_completo}</pre>
            </div>

            {contrato.status === 'assinado' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <p className="text-sm text-gray-200">
                  Assinado eletronicamente por <b>{contrato.assinado_por_nome}</b> em {formatDataBR(contrato.data_assinatura!)}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  label="Digite seu nome completo pra assinar"
                  value={nomeAssinatura}
                  onChange={e => setNomeAssinatura(e.target.value)}
                  placeholder="Nome completo"
                />
                <p className="text-[11px] text-gray-500">
                  Ao clicar em "Li e concordo", você declara ter lido e concordado com todos os termos acima, valendo como assinatura eletrônica deste contrato, nos termos da MP 2.200-2/2001.
                </p>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" onClick={() => setModalContratoAberto(false)} disabled={assinando}>Cancelar</Button>
                  <Button icon={<FileSignature size={14} />} onClick={handleAssinar} loading={assinando}>Li e concordo</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
