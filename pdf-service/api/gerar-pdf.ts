import type { VercelRequest, VercelResponse } from '@vercel/node'
import WebSocket from 'ws'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument } from 'pdf-lib'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { juntarArquivosEmPdf, type AnexoParaMesclar, type Carimbo } from '../lib/pdfLogic.js'
import { subirDocumentoBuffer } from '../lib/storage.js'

// CORRIGIDO: tanto o puppeteer-core quanto o @supabase/supabase-js
// esperam encontrar um "WebSocket" pronto no ambiente (padrão em
// Node 22+, mas essa função roda em Node 20 — necessário por causa
// do Chromium, ver comentário do package.json). O puppeteer-core já
// sabe usar o pacote `ws` sozinho, mas o Supabase especificamente só
// procura por WebSocket "global" — sem isso aqui, a criação do
// cliente Supabase falhava com "native WebSocket not found", mesmo
// com o pacote `ws` já instalado.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket as unknown as typeof globalThis.WebSocket
}

// URL pública do "pacote" do Chromium — hospedado pelo próprio autor
// da biblioteca no GitHub. Se um dia a versão do puppeteer-core mudar
// e parar de bater com essa versão do Chromium, é só trocar essa URL
// (e a versão do @sparticuz/chromium-min no package.json) — não
// precisa mexer em mais nada.
const CHROMIUM_PACK_URL = process.env.CHROMIUM_PACK_URL
  ?? 'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar'

interface CorpoRequisicao {
  html?:        string  // ausente = só junta os anexos, sem gerar nenhum documento base (mais rápido, sem abrir o Chrome)
  landscape?:   boolean
  nomeArquivo:  string
  pastaId:      string   // ex: "AP_123" — vira parte do caminho no Storage
  empresa_id:   number
  anexos?:      AnexoParaMesclar[]
  carimbos?:    Carimbo[]
}

function permitirCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  permitirCors(res)
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!token) { res.status(401).json({ error: 'Sessão do Supabase não encontrada.' }); return }

    // Cliente autenticado COMO O USUÁRIO que fez a requisição — não
    // usa service_role. As mesmas políticas de acesso (RLS) do banco
    // continuam valendo aqui, igual já valem no desktop.
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    const p = req.body as CorpoRequisicao
    if (!p?.pastaId || !p?.empresa_id) {
      res.status(400).json({ error: 'Parâmetros obrigatórios faltando (pastaId, empresa_id).' })
      return
    }

    const documentoFinal = await PDFDocument.create()

    // ── 1. Se tiver HTML, abre o Chrome (sem tela) e renderiza ──
    if (p.html) {
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
        executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
        headless: true,
      })

      try {
        const page = await browser.newPage()
        await page.setContent(p.html, { waitUntil: 'load' })
        // Mesmo princípio do aguardarImagens() do Electron — garante
        // que toda imagem embutida (o carimbo, por exemplo) já
        // terminou de decodificar E de ser desenhada antes de capturar
        // o PDF, evitando o mesmo bug intermitente que já resolvemos
        // no desktop (carimbo sumindo sem erro nenhum).
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images).map(img =>
            img.decode ? img.decode().catch(() => {}) : Promise.resolve()
          ))
          await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)))
        })
        const pdfBytes = await page.pdf({ printBackground: true, landscape: p.landscape ?? false, format: 'A4' })
        const pdfDocumento = await PDFDocument.load(Buffer.from(pdfBytes))
        const paginasDoc = await documentoFinal.copyPages(pdfDocumento, pdfDocumento.getPageIndices())
        paginasDoc.forEach(pg => documentoFinal.addPage(pg))
      } finally {
        await browser.close()
      }
    }

    // ── 2. Junta com os anexos, e carimba os marcados "Vai Assinatura" ──
    if (p.anexos?.length) {
      await juntarArquivosEmPdf(supabase, documentoFinal, p.anexos, p.carimbos)
    }

    const bytesFinais = await documentoFinal.save()

    // ── 3. Sobe pro Storage ─────────────────────────────────
    // CORRIGIDO: a limpeza antiga só tirava caracteres proibidos no
    // Windows — mas a "chave" de um arquivo no Storage do Supabase é
    // bem mais restrita (não aceita espaço nem acento, por exemplo).
    // Um nome como "Aviso Prévio Indenizado - Fulano" já dava erro
    // ("Invalid key"). Agora só permite letra, número, ponto,
    // hífen e underscore — troca acento pela letra sem acento antes
    // de filtrar, então "Prévio" vira "Previo", não desaparece.
    const nomeSanitizado = p.nomeArquivo
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120) || 'documento'
    const remoto = `${p.empresa_id}/${p.pastaId}/${Date.now()}-${nomeSanitizado}.pdf`
    const caminhoFinal = await subirDocumentoBuffer(supabase, remoto, bytesFinais)

    res.status(200).json({ ok: true, path: caminhoFinal })
  } catch (erro) {
    console.error('Erro ao gerar PDF:', erro)
    res.status(500).json({ error: erro instanceof Error ? erro.message : 'Erro desconhecido ao gerar o PDF.' })
  }
}
