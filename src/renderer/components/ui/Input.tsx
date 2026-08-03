import { clsx }                      from 'clsx'
import { InputHTMLAttributes, forwardRef, ChangeEvent } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?:   string
  error?:   string
  hint?:    string
  icon?:    React.ReactNode
  // NOVO: por padrão, texto digitado pelo usuário vira maiúsculo
  // automaticamente. Passe preserveCase pra desligar isso num campo
  // específico (não deveria precisar, mas fica disponível).
  preserveCase?: boolean
}

// Tipos onde forçar maiúscula atrapalharia (senha não pode mudar de
// caso, e-mail/número/data não fazem sentido em maiúscula).
const TIPOS_SEM_MAIUSCULA = new Set(['password', 'email', 'number', 'date', 'time', 'datetime-local', 'file', 'color', 'checkbox', 'radio', 'range', 'hidden'])

const Input = forwardRef<HTMLInputElement, Props>(({
  label,
  error,
  hint,
  icon,
  className,
  id,
  preserveCase,
  onChange,
  type,
  ...props
}, ref) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  const aplicaMaiuscula = !preserveCase && !TIPOS_SEM_MAIUSCULA.has(type ?? 'text')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (aplicaMaiuscula) {
      const posicao = e.target.selectionStart
      e.target.value = e.target.value.toUpperCase()
      if (posicao !== null) e.target.setSelectionRange(posicao, posicao)
    }
    onChange?.(e)
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-gray-400"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          onChange={handleChange}
          className={clsx(
            'input',
            icon && 'pl-9',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30',
            className
          )}
          {...props}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint  && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
})

Input.displayName = 'Input'
export default Input
