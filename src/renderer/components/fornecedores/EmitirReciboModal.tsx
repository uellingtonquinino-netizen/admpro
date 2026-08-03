import { useEffect, useState } from 'react'
import { useEmpresaStore } from '@store/empresa.store'
import { toast }           from '@components/ui/ToastContainer'
import Modal                from '@components/ui/Modal'
import Button                from '@components/ui/Button'
import Input                  from '@components/ui/Input'
import { getTipoDocumento }   from '../../documentos/tipos'
import { FileText } from 'lucide-react'

interface Props {
  nome:     string
  documento: string  // CPF ou CNPJ, já formatado para exibição
  onClose:  () => void
}

// Reaproveita o template "recibo_pagamento" já usado no módulo de RH —
// aqui exposto também para fornecedores, já que o recibo serve para
// qualquer beneficiário (fornecedor ou colaborador).
// ALTERADO: número do recibo agora é gerado automaticamente e sequencial
// (não é mais digitado), e a Cidade/UF vem do cadastro da obra.
export default function EmitirReciboModal({ nome, documento, onClose }: Props) {
  const empresa = useEmpresaStore(s => s.empresa)

  const [local, setLocal]         = useState('')
  const [valor, setValor]         = useState('')
  const [referente, setReferente] = useState('')
  const [gerando, setGerando]     = useState(false)

  useEffect(() => {
    if (empresa?.cidade) {
      setLocal(empresa.estado ? `${empresa.cidade} - ${empresa.estado}` : empresa.cidade)
    }
  }, [empresa])

  async function handleGerar() {
    if (!empresa) return
    if (!valor || Number(valor) <= 0) { toast.error('Informe o valor.'); return }

    const tipo = getTipoDocumento('recibo_pagamento')
    if (!tipo) return

    setGerando(true)
    try {
      // CORRIGIDO: busca a empresa atualizada direto do banco (inclusive a
      // logo), em vez de usar o valor em cache da store.
      const empresaAtual = await window.api.empresas.buscarPorId(empresa.id)

      const { numero } = await window.api.recibos.emitir({
        empresa_id:        empresaAtual.id,
        beneficiario_nome: nome,
        valor:             Number(valor.toString().replace(',', '.')),
        referente,
      })

      const html = tipo.gerarHtml(
        { id: 0, nome, cpf: documento },
        empresaAtual,
        { local, numero: String(numero), valor, referente }
      )
      const result = await window.api.documentos.imprimir({
        html,
        nomeArquivo: `Recibo - ${nome}`,
      })

      if (result.ok) {
        onClose()
      } else {
        toast.error('Erro ao abrir a impressão.')
      }
    } catch {
      toast.error('Erro ao gerar o recibo.')
    } finally {
      setGerando(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Recibo de pagamento — ${nome}`} size="md">
      <div className="space-y-4">
        <Input label="Valor (R$)" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
        <Input label="Referente a" value={referente} onChange={e => setReferente(e.target.value)} placeholder="Ex: Pagamento de serviço prestado" />
        <Input label="Cidade - UF" value={local} onChange={e => setLocal(e.target.value)} />
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-surface-border">
        <Button variant="ghost" onClick={onClose} disabled={gerando}>
          Cancelar
        </Button>
        <Button icon={<FileText size={14} />} onClick={handleGerar} loading={gerando}>
          Imprimir / Salvar PDF
        </Button>
      </div>
    </Modal>
  )
}
