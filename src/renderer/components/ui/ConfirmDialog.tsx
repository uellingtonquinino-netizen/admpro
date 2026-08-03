import { AlertTriangle } from 'lucide-react'
import Modal             from './Modal'
import Button            from './Button'

interface Props {
  open:       boolean
  onClose:    () => void
  onConfirm:  () => void
  title?:     string
  message?:   string
  loading?:   boolean
  danger?:    boolean
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title   = 'Confirmar ação',
  message = 'Tem certeza que deseja continuar? Esta ação não pode ser desfeita.',
  loading = false,
  danger  = true,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center
          ${danger ? 'bg-red-500/20' : 'bg-yellow-500/20'}
        `}>
          <AlertTriangle
            size={22}
            className={danger ? 'text-red-400' : 'text-yellow-400'}
          />
        </div>

        <div>
          <p className="text-base font-semibold text-white mb-1">{title}</p>
          <p className="text-sm text-gray-400">{message}</p>
        </div>

        <div className="flex gap-3 w-full">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
