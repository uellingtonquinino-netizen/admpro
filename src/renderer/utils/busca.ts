// Normaliza pra comparar sem se importar com maiúscula/minúscula nem
// acento (o cadastro já força maiúscula, mas a digitação da busca não).
export function normalizar(txt: string): string {
  return txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function bateComBusca(query: string, campos: (string | null | undefined)[]): boolean {
  const q = normalizar(query.trim())
  if (!q) return true
  return campos.some(c => c && normalizar(c).includes(q))
}
