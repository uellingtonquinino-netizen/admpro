import { useCallback } from 'react'
import { toast }       from '@components/ui/ToastContainer'

type Channel = keyof Window['api']

export function useIPC() {

  const call = useCallback(async <T>(
    fn: () => Promise<T>,
    opts?: { successMsg?: string; errorMsg?: string }
  ): Promise<T | null> => {
    try {
      const result = await fn()
      if (opts?.successMsg) toast.success(opts.successMsg)
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado'
      toast.error(opts?.errorMsg ?? msg)
      return null
    }
  }, [])

  return { call }
}
