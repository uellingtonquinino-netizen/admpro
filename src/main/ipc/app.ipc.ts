import { ipcMain, app, shell, BrowserWindow } from 'electron'
import { getDatabaseProvider } from '../supabase/client'

export function registerAppIpc() {
  // ── Versão ────────────────────────────────────────────────
  ipcMain.handle('app:getVersion', () => app.getVersion())

  // NOVO: qual banco está ativo de verdade (sqlite local ou supabase
  // compartilhado) — mostrado na barra de título, pra nunca mais um
  // problema de configuração (.env não encontrado, por exemplo) passar
  // despercebido. Se um dia isso mostrar "SQLite local" numa máquina
  // que deveria estar sincronizada, já dá pra saber na hora, só
  // olhando a tela, sem precisar investigar.
  ipcMain.handle('app:getDatabaseProvider', () => getDatabaseProvider())

  // ── Abrir link externo ────────────────────────────────────
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    shell.openExternal(url)
  })

  // ── Controles da janela ───────────────────────────────────
  ipcMain.handle('app:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })

  ipcMain.handle('app:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })

  ipcMain.handle('app:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })

  // ── Reiniciar o programa (usado depois de restaurar um backup) ──
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit()
  })
}
