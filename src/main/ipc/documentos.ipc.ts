import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { writeFile, unlink, readFile, mkdir, copyFile } from 'fs/promises'
import { join, extname }                        from 'path'
import { randomUUID }                           from 'crypto'
import { PDFDocument, StandardFonts, rgb }      from 'pdf-lib'
import { baixarDocumento, isStorageUri }        from '../supabase/storage'

interface ImprimirParams {
  html:         string
  landscape?:   boolean
  nomeArquivo?: string  // sugestão de nome ao salvar como PDF
}

interface ComAnexosParams {
  html:         string
  landscape?:   boolean
  nomeArquivo:  string
  anexos:       string[]  // caminhos completos dos arquivos (PDF ou imagem)
}

// ALTERADO: em vez de ir direto pro diálogo de impressão do Windows
// (que não mostra pré-visualização nenhuma do conteúdo), agora gera o
// PDF de verdade e abre no leitor padrão do usuário (Edge, Adobe
// etc.) — a pessoa confere se está tudo certo ali e só then manda
// imprimir, sem correr o risco de imprimir algo errado sem ter visto
// antes. Se no futuro conseguirmos resolver a pré-visualização do
// próprio diálogo de impressão do Electron, dá pra reconsiderar
// voltar a ir direto pra impressora.
function sanitizarNomeArquivo(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'documento'
}

// Gera o PDF do documento (AP etc.) e junta na sequência os arquivos
// anexados (PDF ou imagem) — usado tanto para salvar quanto para
// imprimir a versão já com os anexos juntados.
//
// CORRIGIDO (revertido): a tentativa anterior de "normalizar" cada
// anexo em PDF abrindo ele no Chromium e reexportando causou um
// problema pior — a página saía preta, porque a exportação às vezes
// capturava o PDF antes do Chromium terminar de desenhar de verdade.
// Na prática essa etapa nem era necessária: juntar PDFs com a
// biblioteca (pdf-lib) só copia a estrutura das páginas — não precisa
// decodificar a imagem por dentro — então funciona bem direto com
// PDFs de scanner, sem passar pelo Chromium.
// Junta uma lista de arquivos (PDF ou imagem) nas páginas de um PDF
// já aberto, na ordem em que aparecem — usada tanto por
// gerarBytesComAnexos (documento + anexos) quanto por
// gerarBytesSoAnexos (só os anexos, sem nenhum documento base).
async function juntarArquivosEmPdf(documentoFinal: PDFDocument, arquivos: string[]): Promise<void> {
  for (const caminho of arquivos) {
    const ext = extname(caminho).toLowerCase()

    if (ext === '.pdf') {
      const bytes = await readFile(caminho)
      const pdfAnexo = await PDFDocument.load(bytes, { ignoreEncryption: true })
      const paginas  = await documentoFinal.copyPages(pdfAnexo, pdfAnexo.getPageIndices())
      paginas.forEach(pg => documentoFinal.addPage(pg))
    } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const bytes = await readFile(caminho)
      const imagem = ext === '.png'
        ? await documentoFinal.embedPng(bytes)
        : await documentoFinal.embedJpg(bytes)
      const pagina = documentoFinal.addPage([imagem.width, imagem.height])
      pagina.drawImage(imagem, { x: 0, y: 0, width: imagem.width, height: imagem.height })
    }
    // outros formatos são ignorados silenciosamente — o campo de
    // anexo do formulário já restringe a PDF/imagem
  }
}

async function gerarBytesComAnexos(win: BrowserWindow, p: ComAnexosParams): Promise<Uint8Array> {
  const bufferDocumento = await win.webContents.printToPDF({
    printBackground: true,
    landscape:       p.landscape ?? false,
  })

  const documentoFinal = await PDFDocument.create()

  // O próprio documento (ex: a AP) entra primeiro.
  const pdfDocumento = await PDFDocument.load(bufferDocumento)
  const paginasDoc = await documentoFinal.copyPages(pdfDocumento, pdfDocumento.getPageIndices())
  paginasDoc.forEach(pg => documentoFinal.addPage(pg))

  // Depois, cada anexo, na ordem em que foram adicionados.
  await juntarArquivosEmPdf(documentoFinal, p.anexos)

  return documentoFinal.save()
}

// NOVO: junta só os anexos, sem nenhum documento base — usado pela
// Nota Fiscal, que não gera documento nenhum (a nota é física,
// escaneada) — só precisa juntar os arquivos anexados num PDF só.
async function gerarBytesSoAnexos(arquivos: string[]): Promise<Uint8Array> {
  const documentoFinal = await PDFDocument.create()
  await juntarArquivosEmPdf(documentoFinal, arquivos)
  return documentoFinal.save()
}

// ALTERADO: agora o carimbo pode ser a IMAGEM que o próprio usuário
// subiu em Configurações — só a data/hora aparece embaixo dela, sem
// o texto "Aprovado por X em Y". Se o usuário ainda não subiu nenhum
// carimbo (ou a imagem falha ao carregar por algum motivo), cai pro
// carimbo de texto de sempre, pra nunca ficar sem nenhuma assinatura
// no documento.
//
// ALTERADO: o carimbo de imagem do Gestor/ADM na AP (posicao
// 'dados-bancarios-ap') deixou de ficar solto no canto inferior da
// página e passou pra dentro da caixa de "DADOS BANCARIOS:" — mesmo
// lugar onde a assinatura cai numa AP impressa e assinada à mão (usei
// uma AP assinada de verdade, mandada pelo usuário, pra calcular essa
// posição: ~264pt da esquerda, ~260pt do topo da página A4). O
// carimbo do Supervisor continua no canto inferior direito, sem
// mudança de posição — só de tamanho, igual o resto.
async function carimbarPrimeiraPagina(caminhoPdf: string, p: {
  aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
  posicao?: 'inferior-esquerdo' | 'inferior-direito' | 'dados-bancarios-ap'
  tamanho?: 'normal' | 'pequeno'
}) {
  const bytes = await readFile(caminhoPdf)
  const pdfDoc = await PDFDocument.load(bytes)
  const paginas = pdfDoc.getPages()
  if (paginas.length === 0) return

  const primeira = paginas[0]
  const { width: larguraPagina, height: alturaPagina } = primeira.getSize()
  const fonteTexto = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const dataFormatada = new Date(p.aprovadoEm).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const corTexto = rgb(0.110, 0.392, 0.910) // #1c64e8, mesma da AP
  const pequeno = p.tamanho === 'pequeno'
  const margem = 14

  if (p.carimboBase64) {
    try {
      const base64Puro = p.carimboBase64.includes(',') ? p.carimboBase64.split(',')[1] : p.carimboBase64
      const imgBytes = Buffer.from(base64Puro, 'base64')
      const imagem = await pdfDoc.embedPng(imgBytes)

      // NOVO: carimbo de imagem maior que antes (estava saindo muito
      // pequeno) — 46pt de altura, contra os 28pt/40pt de antes. O da
      // AP (Gestor/ADM) foi ajustado de novo por cima disso — ver
      // mais abaixo.
      // CORRIGIDO: a data/hora embaixo da imagem foi removida — não
      // precisa mais, só a imagem do carimbo mesmo.
      const alturaImgBase = 46

      function desenhar(alturaImg: number, x: number, yImg: number) {
        const larguraImg = (imagem.width / imagem.height) * alturaImg
        primeira.drawImage(imagem, { x, y: yImg, width: larguraImg, height: alturaImg })
      }

      if (p.posicao === 'dados-bancarios-ap') {
        // Área de "DADOS BANCARIOS:" da AP — mesmo lugar de uma
        // assinatura física. Calculado a partir de uma AP real
        // assinada à mão (mandada pelo usuário), e depois ajustado
        // de novo com base em como ficou impresso de verdade: mais
        // pra esquerda (usa melhor o espaço em branco daquela
        // coluna) e um tamanho menor que o anterior (tinha ficado
        // grande demais e encostava no rodapé — 3x virou 2x). Carimba
        // as DUAS vias da AP (o modelo sempre imprime 2 cópias na
        // mesma página — ver `duasVias` em documentos/base.ts); a
        // distância entre as vias (~388pt) foi medida gerando uma AP
        // de teste com esse mesmo modelo.
        const alturaImg = alturaImgBase * 2
        const distanciaDoTopo = 280 - 28.35
        const distanciaEntreVias = 388
        const x = 140
        desenhar(alturaImg, x, alturaPagina - distanciaDoTopo - alturaImg)
        desenhar(alturaImg, x, alturaPagina - (distanciaDoTopo + distanciaEntreVias) - alturaImg)
      } else {
        const larguraImg = (imagem.width / imagem.height) * alturaImgBase
        const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - larguraImg : margem
        const yImg = margem
        desenhar(alturaImgBase, x, yImg)
      }

      await writeFile(caminhoPdf, await pdfDoc.save())
      return
    } catch (erro) {
      console.error('Erro ao desenhar o carimbo de imagem — usando o carimbo de texto como reserva:', erro)
      // segue pro carimbo de texto abaixo, sem interromper o processo
    }
  }

  // ── Carimbo de texto — reserva pra quem ainda não subiu uma
  // imagem de carimbo (ou se a imagem falhar por algum motivo). O
  // símbolo de "certo" é desenhado como duas linhas (a fonte padrão
  // do PDF não sabe desenhar o caractere ✓).
  const corBorda = rgb(0.184, 0.498, 0.961) // #2f7ff5, mesma da AP
  const texto = `Aprovado por ${p.aprovadoPor} em ${dataFormatada}`
  const tamanhoFonte = pequeno ? 7 : 9
  const larguraTexto = fonteTexto.widthOfTextAtSize(texto, tamanhoFonte)

  const paddingH = pequeno ? 7 : 10
  const espacoCheck = pequeno ? 12 : 16
  const largura = larguraTexto + paddingH * 2 + espacoCheck
  const altura  = pequeno ? 17 : 22

  const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - largura : margem

  primeira.drawRectangle({
    x, y: margem, width: largura, height: altura,
    color: rgb(1, 1, 1), opacity: 0.78,
    borderColor: corBorda, borderWidth: 1, borderOpacity: 0.9,
  })

  const cx = x + paddingH + (pequeno ? 2 : 3)
  const cy = margem + altura / 2
  const tamanhoCheck = pequeno ? 0.75 : 1
  primeira.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })
  primeira.drawLine({ start: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, end: { x: cx + 9 * tamanhoCheck, y: cy + 5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })

  primeira.drawText(texto, {
    x: x + paddingH + espacoCheck, y: margem + altura / 2 - tamanhoFonte / 2 + 1,
    size: tamanhoFonte, font: fonteTexto, color: corTexto, opacity: 0.95,
  })

  const bytesFinais = await pdfDoc.save()
  await writeFile(caminhoPdf, bytesFinais)
}

export function registerDocumentosIpc() {
  // ── Carimbar a primeira página de um PDF já salvo ────────
  ipcMain.handle('documentos:carimbarPrimeiraPagina', async (_e, p: {
    caminhoPdf: string; aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
    posicao?: 'inferior-esquerdo' | 'inferior-direito'; tamanho?: 'normal' | 'pequeno'
  }) => {
    try {
      await carimbarPrimeiraPagina(p.caminhoPdf, p)
      return { ok: true }
    } catch (erro) {
      // CORRIGIDO: antes esse erro desaparecia sem deixar rastro — o
      // carimbo simplesmente não aparecia no PDF, sem nenhuma pista
      // do motivo. Agora fica registrado no console do processo
      // principal (visível pelas Ferramentas do Desenvolvedor).
      console.error('Erro ao carimbar PDF:', p.caminhoPdf, erro)
      return { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
    }
  })

  ipcMain.handle('documentos:imprimir', async (_e, p: ImprimirParams) => {
    const nomeBase = sanitizarNomeArquivo(p.nomeArquivo || 'documento')
    const win = new BrowserWindow({ show: false })
    const tempHtmlPath = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.html`)
    const tempPdfPath  = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.pdf`)

    try {
      await writeFile(tempHtmlPath, p.html, 'utf-8')
      await win.loadFile(tempHtmlPath)

      const bytes = await win.webContents.printToPDF({
        printBackground: true,
        landscape:       p.landscape ?? false,
      })
      await writeFile(tempPdfPath, bytes)

      const erro = await shell.openPath(tempPdfPath)
      if (erro) return { ok: false }
      return { ok: true }
    } finally {
      win.destroy()
      unlink(tempHtmlPath).catch(() => {})
      // O PDF gerado NÃO é apagado aqui — o leitor de PDF abre o
      // arquivo de forma assíncrona, e apagar cedo demais faria o
      // visualizador não encontrar mais o conteúdo.
    }
  })

  // ── Gerar o documento como PDF de verdade + juntar anexos (salvar) ──
  // NOVO: usado na Autorização de Pagamento — em vez de abrir o
  // diálogo de impressão, gera a AP direto como PDF e junta na
  // sequência os arquivos anexados (nota/recibo, boletos, medição
  // etc.), formando um único PDF por AP, na ordem que a empresa já
  // usa pra escanear e mandar pro financeiro.
  ipcMain.handle('documentos:gerarPdfComAnexos', async (_e, p: ComAnexosParams) => {
    const nomeBase = sanitizarNomeArquivo(p.nomeArquivo)
    const win = new BrowserWindow({ show: false })
    const tempPath = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.html`)

    try {
      await writeFile(tempPath, p.html, 'utf-8')
      await win.loadFile(tempPath)

      const bytesFinal = await gerarBytesComAnexos(win, p)

      const { filePath, canceled } = await dialog.showSaveDialog(win, {
        title:       'Salvar Autorização de Pagamento',
        defaultPath: `${nomeBase}.pdf`,
        filters:     [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (canceled || !filePath) return { ok: false, canceled: true }

      await writeFile(filePath, bytesFinal)
      return { ok: true, filePath }
    } finally {
      win.destroy()
      unlink(tempPath).catch(() => {})
    }
  })

  // ── Gerar o documento (já com anexos) e abrir pra visualizar ──
  // ALTERADO: usado como reserva pra reimprimir uma AP que ainda não
  // tem o PDF pronto salvo — agora, no mesmo espírito da mudança
  // acima, só gera o arquivo e abre no leitor padrão, sem tentar
  // carregar o PDF de volta no Electron pra imprimir (era o que dava
  // página em branco antes).
  ipcMain.handle('documentos:imprimirComAnexos', async (_e, p: ComAnexosParams) => {
    const nomeBase = sanitizarNomeArquivo(p.nomeArquivo)
    const win = new BrowserWindow({ show: false })
    const tempHtmlPath = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.html`)
    const tempPdfPath  = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.pdf`)

    try {
      await writeFile(tempHtmlPath, p.html, 'utf-8')
      await win.loadFile(tempHtmlPath)

      const bytesFinal = await gerarBytesComAnexos(win, p)
      await writeFile(tempPdfPath, bytesFinal)

      const erro = await shell.openPath(tempPdfPath)
      if (erro) return { ok: false }
      return { ok: true }
    } finally {
      win.destroy()
      unlink(tempHtmlPath).catch(() => {})
    }
  })

  // ── Salvar automaticamente numa pasta própria do programa ──
  // NOVO: chamado assim que uma AP com anexos é registrada — salva o
  // PDF já juntado (AP + anexos) numa pasta dentro dos dados do
  // programa, sem precisar de diálogo. Esse arquivo pronto é o que a
  // tela usa depois pra "reimprimir", evitando o problema de reabrir
  // um PDF dentro do próprio Electron pra imprimir (dava página em
  // branco).
  ipcMain.handle('documentos:salvarPdfInterno', async (_e, p: ComAnexosParams & { pastaId: string }) => {
    const nomeBase = sanitizarNomeArquivo(p.nomeArquivo)
    const win = new BrowserWindow({ show: false })
    const tempPath = join(app.getPath('temp'), `${nomeBase}-${randomUUID().slice(0, 8)}.html`)

    try {
      await writeFile(tempPath, p.html, 'utf-8')
      await win.loadFile(tempPath)

      const bytesFinal = await gerarBytesComAnexos(win, p)

      const pastaDestino = join(app.getPath('userData'), 'autorizacoes_pagamento')
      await mkdir(pastaDestino, { recursive: true })

      const nomeArquivo = `${sanitizarNomeArquivo(p.pastaId)}.pdf`
      const caminhoFinal = join(pastaDestino, nomeArquivo)

      await writeFile(caminhoFinal, bytesFinal)
      return { ok: true, filePath: caminhoFinal }
    } finally {
      win.destroy()
      unlink(tempPath).catch(() => {})
    }
  })

  // ── Gerar dois PDFs separados (Nota Fiscal) ──────────────
  // NOVO: a Nota Fiscal não gera documento nenhum — só junta os
  // anexos de cada categoria (nota e boleto) em DOIS PDFs distintos,
  // salvos numa pasta própria do programa, prontos pro Gestor
  // visualizar e aprovar (mesmo fluxo da AP).
  ipcMain.handle('documentos:gerarPdfsSeparados', async (_e, p: {
    notaArquivos: string[]; boletoArquivos: string[]; pastaId: string
  }) => {
    const pastaDestino = join(app.getPath('userData'), 'notas_fiscais')
    await mkdir(pastaDestino, { recursive: true })
    const idBase = sanitizarNomeArquivo(p.pastaId)

    let notaPdfPath: string | null = null
    let boletosPdfPath: string | null = null

    if (p.notaArquivos.length > 0) {
      const bytes = await gerarBytesSoAnexos(p.notaArquivos)
      notaPdfPath = join(pastaDestino, `${idBase}_nota.pdf`)
      await writeFile(notaPdfPath, bytes)
    }
    if (p.boletoArquivos.length > 0) {
      const bytes = await gerarBytesSoAnexos(p.boletoArquivos)
      boletosPdfPath = join(pastaDestino, `${idBase}_boletos.pdf`)
      await writeFile(boletosPdfPath, bytes)
    }

    return { ok: true, notaPdfPath, boletosPdfPath }
  })

  // ── Abrir um PDF já salvo no leitor padrão do Windows ────
  // Usado pra "reimprimir" uma AP que já tem o PDF pronto — o próprio
  // leitor de PDF do usuário (Edge, Adobe etc.) imprime sem o
  // problema de página em branco.
  ipcMain.handle('documentos:abrirArquivo', async (_e, caminho: string) => {
    if (isStorageUri(caminho)) caminho = await baixarDocumento(caminho)
    const erro = await shell.openPath(caminho)
    return { ok: !erro, erro: erro || null }
  })

  // ── Gerar lote: copia os PDFs das APs selecionadas pra uma
  // pasta escolhida pelo usuário, pronta pra mandar pro financeiro ──
  // NOVO: usado na Programação Financeira Semanal — em vez de um PDF
  // único, cada AP continua como arquivo próprio (jeito que a empresa
  // já usa), só que juntados numa pasta de uma vez.
  ipcMain.handle('documentos:gerarLote', async (_e, arquivos: { origem: string; nomeArquivo: string }[]) => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const { filePaths, canceled } = await dialog.showOpenDialog(win as any, {
      title: 'Escolher pasta para salvar o lote de APs',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (canceled || filePaths.length === 0) return { ok: false, canceled: true }

    const pastaDestino = filePaths[0]
    let copiados = 0
    const falhas: string[] = []

    for (const arq of arquivos) {
      try {
        const nomeFinal = `${sanitizarNomeArquivo(arq.nomeArquivo)}.pdf`
        await copyFile(arq.origem, join(pastaDestino, nomeFinal))
        copiados++
      } catch {
        falhas.push(arq.nomeArquivo)
      }
    }

    return { ok: true, pasta: pastaDestino, copiados, total: arquivos.length, falhas }
  })
}
