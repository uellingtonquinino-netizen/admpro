import { useState, useCallback } from 'react'

interface State<T> {
  data:    T | null
  loading: boolean
  error:   string | null
}

export function useAsync<T>() {
  const [state, setState] = useState<State<T>>({
    data:    null,
    loading: false,
    error:   null,
  })

  const run = useCallback(async (promise: Promise<T>) => {
    setState({ data: null, loading: true, error: null })
    try {
      const data = await promise
      setState({ data, loading: false, error: null })
      return data
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      setState({ data: null, loading: false, error: msg })
      throw err
    }
  }, [])

  return { ...state, run }
}
