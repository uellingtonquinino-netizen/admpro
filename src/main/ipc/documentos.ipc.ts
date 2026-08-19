import { ipcMain, BrowserWindow, app, dialog, shell } from 'electron'
import { writeFile, unlink, readFile, mkdir, copyFile } from 'fs/promises'
import { join, extname }                        from 'path'
import { randomUUID }                           from 'crypto'
import { PDFDocument, PDFPage, StandardFonts, rgb }      from 'pdf-lib'
import { baixarDocumento, isStorageUri, uploadDocumento, storagePath } from '../supabase/storage'
import { getDatabaseProvider }                  from '../supabase/client'

interface ImprimirParams {
  html:         string
  landscape?:   boolean
  nomeArquivo?: string  // sugestão de nome ao salvar como PDF
}

interface ComAnexosParams {
  html:         string
  landscape?:   boolean
  nomeArquivo:  string
  anexos:       AnexoParaMesclar[]
  // ALTERADO: era um carimbo só (o de quem tinha acabado de clicar em
  // "Autorizar") — agora é uma LISTA, porque uma AP pode já ter tanto
  // a aprovação do Gestor quanto a do Supervisor no momento de
  // REGENERAR o PDF (ex: reimprimir depois dos dois já terem
  // aprovado). Cada item já traz sua própria posição.
  carimbos?: {
    aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
    posicao: 'inferior-esquerdo' | 'inferior-direito'
  }[]
}

interface AnexoParaMesclar {
  caminho:        string  // caminho completo do arquivo (PDF ou imagem)
  vaiAssinatura?: boolean
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

// NOVO: causa raiz do carimbo sumindo de forma intermitente (Gestor
// aprova, às vezes sai sem carimbo nenhum — nem pra ele mesmo, sem
// erro nenhum, mais comum processando várias APs em sequência
// rápida). `win.loadFile()` resolve quando a página TERMINA DE
// CARREGAR, mas isso não garante que uma imagem embutida como base64
// (o carimbo) já tenha terminado de DECODIFICAR/DESENHAR — são duas
// etapas distintas do Chromium. `printToPDF()` captura o que está
// desenhado NAQUELE INSTANTE; se disparar cedo demais (mais provável
// com a máquina ocupada, processando várias APs seguidas), a imagem
// ainda não apareceu e o PDF sai sem ela — sem nenhum erro, porque
// tecnicamente nada falhou. `img.decode()` garante que a decodificação
// terminou de verdade antes de seguir.
async function aguardarImagens(win: BrowserWindow): Promise<void> {
  await win.webContents.executeJavaScript(`
    (async () => {
      await Promise.all(Array.from(document.images).map(img =>
        img.decode ? img.decode().catch(() => {}) : Promise.resolve()
      ))
      // REFORÇADO: decodificar a imagem garante que os BYTES estão
      // prontos, mas não garante que o Chromium já PINTOU ela na tela
      // — são duas etapas distintas do motor de renderização. Esperar
      // dois requestAnimationFrame seguidos é a forma padrão de
      // garantir que pelo menos um quadro já foi desenhado de verdade
      // antes de continuar (o primeiro só agenda o próximo desenho; o
      // segundo confirma que o desenho anterior já aconteceu).
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
    })()
  `)
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
async function juntarArquivosEmPdf(
  documentoFinal: PDFDocument,
  arquivos: AnexoParaMesclar[],
  carimbos?: ComAnexosParams['carimbos']
): Promise<void> {
  for (const item of arquivos) {
    // CORRIGIDO: um anexo já enviado antes pro Storage vem como
    // "supabase://..." (não é mais um caminho local) — sem baixar
    // primeiro, o Node tentava ler isso como se fosse um caminho de
    // arquivo relativo, e acabava juntando com a pasta do programa
    // instalado (erro ENOENT com um caminho sem nexo nenhum).
    const caminho = isStorageUri(item.caminho) ? await baixarDocumento(item.caminho) : item.caminho
    const ext = extname(caminho).toLowerCase()
    const paginaAntesDoAnexo = documentoFinal.getPageCount()

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

    // ALTERADO: anexo marcado "Vai Assinatura" — carimba a PRIMEIRA
    // página desse anexo específico com TODOS os carimbos já
    // aplicados na AP até agora (Gestor e/ou Supervisor), não só o
    // de quem clicou por último.
    if (item.vaiAssinatura && carimbos?.length && documentoFinal.getPageCount() > paginaAntesDoAnexo) {
      const primeiraPaginaDoAnexo = documentoFinal.getPage(paginaAntesDoAnexo)
      for (const carimbo of carimbos) {
        await desenharCarimboNaPagina(primeiraPaginaDoAnexo, documentoFinal, { ...carimbo, tamanho: 'pequeno' })
      }
    }
  }
}

async function gerarBytesComAnexos(win: BrowserWindow, p: ComAnexosParams): Promise<Uint8Array> {
  await aguardarImagens(win)
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
  await juntarArquivosEmPdf(documentoFinal, p.anexos, p.carimbos)

  return documentoFinal.save()
}

// NOVO: junta só os anexos, sem nenhum documento base — usado pela
// Nota Fiscal, que não gera documento nenhum (a nota é física,
// escaneada) — só precisa juntar os arquivos anexados num PDF só.
async function gerarBytesSoAnexos(arquivos: string[]): Promise<Uint8Array> {
  const documentoFinal = await PDFDocument.create()
  // NF não usa "vai assinatura" (o carimbo dela é aplicado depois,
  // por cima do PDF pronto, via carimbarPrimeiraPagina) — só precisa
  // do formato novo de item pra chamar juntarArquivosEmPdf.
  await juntarArquivosEmPdf(documentoFinal, arquivos.map(caminho => ({ caminho })))
  return documentoFinal.save()
}

// ALTERADO: agora o carimbo pode ser a IMAGEM que o próprio usuário
// subiu em Configurações, sobreposta no canto da página. Se o usuário
// ainda não subiu nenhum carimbo (ou a imagem falha ao carregar por
// algum motivo), cai pro carimbo de texto de sempre, pra nunca ficar
// sem nenhuma assinatura no documento.
//
// CORRIGIDO: o carimbo do Gestor/ADM na AP (posição junto de "DADOS
// BANCARIOS:") deixou de vir por aqui — carimbar por cima de um PDF
// pronto usa uma coordenada FIXA da página, e o documento muda de
// altura conforme a quantidade de parcelas, fazendo o carimbo cair
// fora do lugar (foi exatamente o que aconteceu — chegou a ser
// ajustado várias vezes tentando acertar a posição fixa, até ficar
// claro que esse caminho nunca ia ser 100% confiável). Agora esse
// carimbo é HTML de verdade, embutido direto na célula de "Dados
// Bancários" (ver ap.ts) — acompanha o fluxo do documento sozinho,
// não importa o tamanho que ele fique. Aqui continua só o carimbo do
// Supervisor (canto inferior direito), que não tem esse problema
// porque a posição dele nunca dependeu do tamanho do corpo da AP.
// NOVO: lógica de desenho do carimbo extraída pra função própria —
// antes só vivia dentro de carimbarPrimeiraPagina (que sempre
// carregava/salvava um arquivo inteiro). Agora também é usada direto
// numa página específica de um PDF já em memória (o caso da AP: o
// anexo marcado "vai assinatura" ganha o carimbo ANTES de entrar no
// PDF final mesclado, sem precisar salvar/reabrir nada à parte).
async function desenharCarimboNaPagina(pagina: PDFPage, pdfDoc: PDFDocument, p: {
  aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
  posicao?: 'inferior-esquerdo' | 'inferior-direito'
  tamanho?: 'normal' | 'pequeno'
}) {
  const { width: larguraPagina } = pagina.getSize()
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

      const alturaImg = 80
      const larguraImg = (imagem.width / imagem.height) * alturaImg
      const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - larguraImg : margem
      pagina.drawImage(imagem, { x, y: margem, width: larguraImg, height: alturaImg })
      return
    } catch (erro) {
      console.error('Erro ao desenhar o carimbo de imagem — usando o carimbo de texto como reserva:', erro)
      // segue pro carimbo de texto abaixo, sem interromper o processo
    }
  }

  // ── Carimbo de texto — reserva pra quem ainda não subiu uma
  // imagem de carimbo (ou se a imagem falhar por algum motivo).
  const fonteTexto = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const corBorda = rgb(0.184, 0.498, 0.961) // #2f7ff5, mesma da AP
  const texto = `Aprovado por ${p.aprovadoPor} em ${dataFormatada}`
  const tamanhoFonte = pequeno ? 7 : 9
  const larguraTexto = fonteTexto.widthOfTextAtSize(texto, tamanhoFonte)

  const paddingH = pequeno ? 7 : 10
  const espacoCheck = pequeno ? 12 : 16
  const largura = larguraTexto + paddingH * 2 + espacoCheck
  const altura  = pequeno ? 17 : 22

  const x = p.posicao === 'inferior-direito' ? larguraPagina - margem - largura : margem

  pagina.drawRectangle({
    x, y: margem, width: largura, height: altura,
    color: rgb(1, 1, 1), opacity: 0.78,
    borderColor: corBorda, borderWidth: 1, borderOpacity: 0.9,
  })

  const cx = x + paddingH + (pequeno ? 2 : 3)
  const cy = margem + altura / 2
  const tamanhoCheck = pequeno ? 0.75 : 1
  pagina.drawLine({ start: { x: cx, y: cy }, end: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })
  pagina.drawLine({ start: { x: cx + 3 * tamanhoCheck, y: cy - 3.5 * tamanhoCheck }, end: { x: cx + 9 * tamanhoCheck, y: cy + 5 * tamanhoCheck }, thickness: 1.2, color: corTexto, opacity: 0.95 })

  pagina.drawText(texto, {
    x: x + paddingH + espacoCheck, y: margem + altura / 2 - tamanhoFonte / 2 + 1,
    size: tamanhoFonte, font: fonteTexto, color: corTexto, opacity: 0.95,
  })
}

async function carimbarPrimeiraPagina(caminhoPdf: string, p: {
  aprovadoPor: string; aprovadoEm: string; carimboBase64?: string | null
  posicao?: 'inferior-esquerdo' | 'inferior-direito'
  tamanho?: 'normal' | 'pequeno'
}) {
  // CORRIGIDO: quando o PDF já mora no Storage (supabase://...), essa
  // função tentava ler/escrever esse "caminho" como se fosse um
  // arquivo local de verdade — sempre falhava. Agora baixa antes de
  // mexer, e sobe de volta pro MESMO endereço depois de carimbar, sem
  // trocar o que fica salvo no banco.
  const eraNuvem = isStorageUri(caminhoPdf)
  const caminhoRemoto = eraNuvem ? storagePath(caminhoPdf) : null
  const caminhoLocal = eraNuvem ? await baixarDocumento(caminhoPdf) : caminhoPdf

  async function salvarDeVolta(bytesFinais: Uint8Array) {
    await writeFile(caminhoLocal, bytesFinais)
    if (eraNuvem && caminhoRemoto) await uploadDocumento(caminhoLocal, caminhoRemoto)
  }

  const bytes = await readFile(caminhoLocal)
  const pdfDoc = await PDFDocument.load(bytes)
  const paginas = pdfDoc.getPages()
  if (paginas.length === 0) return

  await desenharCarimboNaPagina(paginas[0], pdfDoc, p)
  await salvarDeVolta(await pdfDoc.save())
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

      // CORRIGIDO: sem "margins: marginType none", o Electron ignora
      // a margem que cada documento define no próprio CSS (@page
      // margin, em documentoBase) e usa sempre a margem padrão do
      // Chromium (~10mm) por baixo dos panos — foi por isso que
      // "margem zerada" na Ficha de EPI nunca fazia efeito de
      // verdade, e o conteúdo (que já contava com mais espaço
      // disponível) acabava estourando pra uma 3ª página. Agora quem
      // manda na margem é mesmo o CSS de cada documento.
      await aguardarImagens(win)
      const bytes = await win.webContents.printToPDF({
        printBackground: true,
        landscape:       p.landscape ?? false,
        margins:         { marginType: 'none' },
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
  // CORRIGIDO: o PDF só ficava salvo no disco do computador que gerou
  // — o caminho ia pro banco (compartilhado), mas o ARQUIVO em si
  // nunca saía da máquina, então abrir de outro computador sempre
  // falhava ("arquivo não encontrado"). Agora, em modo Supabase, o
  // PDF sobe pro Storage depois de gerado, e o que fica salvo no
  // banco é o endereço na nuvem (supabase://...) — documentos:abrirArquivo
  // já sabia baixar esse formato antes de abrir, só faltava alguém
  // realmente subir o arquivo pra lá.
  ipcMain.handle('documentos:salvarPdfInterno', async (_e, p: ComAnexosParams & { pastaId: string; empresa_id?: number }) => {
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

      if (getDatabaseProvider() === 'supabase') {
        if (!p.empresa_id) throw new Error('empresa_id é obrigatório pra salvar o documento na nuvem.')
        const remoto = `${p.empresa_id}/documentos-gerados/${sanitizarNomeArquivo(p.pastaId)}/${nomeArquivo}`
        const caminhoNuvem = await uploadDocumento(caminhoFinal, remoto)
        return { ok: true, filePath: caminhoNuvem }
      }

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
  // CORRIGIDO: mesmo problema do salvarPdfInterno — sem subir pro
  // Storage, o arquivo só existia no computador que gerou.
  ipcMain.handle('documentos:gerarPdfsSeparados', async (_e, p: {
    notaArquivos: string[]; boletoArquivos: string[]; pastaId: string; empresa_id?: number
  }) => {
    const pastaDestino = join(app.getPath('userData'), 'notas_fiscais')
    await mkdir(pastaDestino, { recursive: true })
    const idBase = sanitizarNomeArquivo(p.pastaId)
    const nuvem = getDatabaseProvider() === 'supabase'
    if (nuvem && !p.empresa_id) throw new Error('empresa_id é obrigatório pra salvar o documento na nuvem.')

    let notaPdfPath: string | null = null
    let boletosPdfPath: string | null = null

    if (p.notaArquivos.length > 0) {
      const bytes = await gerarBytesSoAnexos(p.notaArquivos)
      const local = join(pastaDestino, `${idBase}_nota.pdf`)
      await writeFile(local, bytes)
      notaPdfPath = nuvem
        ? await uploadDocumento(local, `${p.empresa_id}/documentos-gerados/${idBase}/${idBase}_nota.pdf`)
        : local
    }
    if (p.boletoArquivos.length > 0) {
      const bytes = await gerarBytesSoAnexos(p.boletoArquivos)
      const local = join(pastaDestino, `${idBase}_boletos.pdf`)
      await writeFile(local, bytes)
      boletosPdfPath = nuvem
        ? await uploadDocumento(local, `${p.empresa_id}/documentos-gerados/${idBase}/${idBase}_boletos.pdf`)
        : local
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
        // CORRIGIDO: mesmo problema do juntarArquivosEmPdf — um PDF
        // já salvo na nuvem vem como "supabase://...", precisa baixar
        // antes de copiar, não dá pra copiar direto um endereço.
        const origem = isStorageUri(arq.origem) ? await baixarDocumento(arq.origem) : arq.origem
        await copyFile(origem, join(pastaDestino, nomeFinal))
        copiados++
      } catch {
        falhas.push(arq.nomeArquivo)
      }
    }

    return { ok: true, pasta: pastaDestino, copiados, total: arquivos.length, falhas }
  })
}
