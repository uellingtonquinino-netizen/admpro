// NOVO: aplica os carimbos de aprovação (Gestor e Supervisor) num PDF
// de AP recém-gerado. Supervisor no canto inferior direito, como
// sempre; Gestor/ADM agora vai dentro da caixa de "DADOS BANCARIOS:"
// — mesmo lugar de uma assinatura física numa AP impressa (posição
// calculada a partir de uma AP real assinada à mão, mandada pelo
// usuário como referência).
//
// ALTERADO: agora usa a imagem de carimbo que o usuário subiu em
// Configurações (aprovado_por_carimbo_url / aprovado_supervisor_
// carimbo_url, já vêm junto do ap:buscarPorId) — se ele ainda não
// subiu nenhuma, o backend cai pro carimbo de texto de sempre sozinho.
//
// CORRIGIDO: antes, se o carimbo falhasse ao aplicar, isso não
// aparecia em lugar nenhum — o PDF simplesmente ficava sem a
// assinatura, sem nenhum aviso. Agora, qualquer falha aqui gera um
// aviso visível, em vez de falhar calado.
export async function aplicarCarimbosAP(pdfPath: string, ap: {
  aprovado_por?: string | null
  aprovado_em?: string | null
  aprovado_por_carimbo_url?: string | null
  aprovado_supervisor_por?: string | null
  aprovado_supervisor_em?: string | null
  aprovado_supervisor_carimbo_url?: string | null
}): Promise<{ ok: boolean; erros: string[] }> {
  const erros: string[] = []

  if (ap.aprovado_por && ap.aprovado_em) {
    const resultado = await window.api.documentos.carimbarPrimeiraPagina({
      caminhoPdf: pdfPath, aprovadoPor: ap.aprovado_por, aprovadoEm: ap.aprovado_em,
      carimboBase64: ap.aprovado_por_carimbo_url ?? null,
      posicao: 'dados-bancarios-ap', tamanho: 'pequeno',
    })
    if (!resultado.ok) erros.push('Não foi possível aplicar a assinatura do Gestor no documento.')
  }
  if (ap.aprovado_supervisor_por && ap.aprovado_supervisor_em) {
    const resultado = await window.api.documentos.carimbarPrimeiraPagina({
      caminhoPdf: pdfPath, aprovadoPor: ap.aprovado_supervisor_por, aprovadoEm: ap.aprovado_supervisor_em,
      carimboBase64: ap.aprovado_supervisor_carimbo_url ?? null,
      posicao: 'inferior-direito', tamanho: 'pequeno',
    })
    if (!resultado.ok) erros.push('Não foi possível aplicar a assinatura do Supervisor no documento.')
  }

  return { ok: erros.length === 0, erros }
}
