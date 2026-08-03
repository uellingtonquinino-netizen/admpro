import { useState, useCallback } from 'react'

interface Options {
  title?:   string
  message?: string
  danger?:  boolean
}

export function useConfirm() {
  const [open,    setOpen]    = useState(false)
  const [options, setOptions] = useState<Options>({})
  const [resolve, setResolve] = useState<(v: boolean) => void>(() => () => {})

  const confirm = useCallback((opts: Options = {}): Promise<boolean> => {
    setOptions(opts)
    setOpen(true)
    return new Promise(res => {
      setResolve(() => res)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setOpen(false)
    resolve(true)
  }, [resolve])

  const handleCancel = useCallback(() => {
    setOpen(false)
    resolve(false)
  }, [resolve])

  return {
    confirm,
    dialogProps: {
      open,
      onClose:   handleCancel,
      onConfirm: handleConfirm,
      ...options,
    },
  }
}
