import { useState } from 'react'

// NOVO: guarda a última data escolhida num filtro de período, mesmo
// depois de atualizar a página (localStorage) — mesmo comportamento
// que os filtros de período já têm no programa desktop. `chave` tem
// que ser única por filtro (Painel e Aprovações usam cada um a sua,
// senão um pisaria no valor do outro).
export function usePeriodoPersistido(chave: string, dataInicioPadrao: string, dataFimPadrao: string) {
  const [dataInicio, setDataInicioState] = useState(
    () => localStorage.getItem(`${chave}:inicio`) ?? dataInicioPadrao
  )
  const [dataFim, setDataFimState] = useState(
    () => localStorage.getItem(`${chave}:fim`) ?? dataFimPadrao
  )

  function setDataInicio(v: string) {
    setDataInicioState(v)
    localStorage.setItem(`${chave}:inicio`, v)
  }
  function setDataFim(v: string) {
    setDataFimState(v)
    localStorage.setItem(`${chave}:fim`, v)
  }

  return { dataInicio, setDataInicio, dataFim, setDataFim }
}
