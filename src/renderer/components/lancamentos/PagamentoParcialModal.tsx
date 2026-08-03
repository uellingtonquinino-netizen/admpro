import { useState } from 'react'
import { useCurrency } from '@hooks/useCurrency'
import { toast }       from '@components/ui/ToastContainer'
import Modal            from '@components/ui/Modal'
import Button           from '@components/ui/Button'
import Input             from '@components/ui/Input'

interface Props {
  lancamento:   { id: number; descricao: string; valor: number }
  onClose:      () => void
  onSaved:      () => void
  onConfirmar:  (p: { id: number; valor_pago: number; novo_vencimento: string }) => Promise<unknown>
  titulo?:      string
  labelValor?:  string
  labelBotao?:  string
}

// ALTERADO: agora genérico — recebe a função de confirmação por fora,
// assim serve tanto para Contas a Pagar quanto Contas a Receber, sem
// duplicar a tela. Paga/recebe uma parte agora e gera uma nova
// parcela com o restante, no vencimento escolhido — o valor total
// continua contando no mês em que foi lançado originalmente.
export default function PagamentoParcialModal({
  lancamento, onClose, onSaved, onConfirmar,
  titulo = 'Pagamento parcial', labelValor = 'Valor pago agora (R$)', labelBotao = 'Confirmar pagamento parcial',
}: Props) {
  const { format } = useCurrency()
  const [valorPago, setValorPago]     = useState('')
  const [novoVencimento, setNovoVencimento] = useState('')
  const [salvando, setSalvando]       = useState(false)

  const pago = Number(valorPago.toString().replace(',', '.')) || 0
  const restante = lancamento.valor - pago

  async function handleSalvar() {
    if (pago <= 0 || pago >= lancamento.valor) {
      toast.error('O valor deve ser maior que zero e menor que o valor total.')
      return
    }
    if (!novoVencimento) { toast.error('Escolha o vencimento do restante.'); return }

    setSalvando(true)
    try {
      await onConfirmar({
        id:              lancamento.id,
        valor_pago:      pago,
        novo_vencimento: novoVencimento,
      })
      toast.success('Registrado com sucesso.')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo} size="md">
      <p className="text-sm text-gray-400 mb-1">{lancamento.descricao}</p>
      <p className="text-sm text-gray-300 mb-4">
        Valor total: <span className="font-semibold text-white">{format(lancamento.valor)}</span>
      </p>

      <div className="space-y-4">
        <Input label={labelValor} value={valorPago} onChange={e => setValorPago(e.target.value)} placeholder="0,00" />
        <Input label="Vencimento do restante" type="date" value={novoVencimento} onChange={e => setNovoVencimento(e.target.value)} />

        {pago > 0 && pago < lancamento.valor && (
          <p className="text-sm text-gray-400">
            Restante a lançar: <span className="font-semibold text-amber-400">{format(restante)}</span>
          </p>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={handleSalvar} loading={salvando}>
          {labelBotao}
        </Button>
      </div>
    </Modal>
  )
}
