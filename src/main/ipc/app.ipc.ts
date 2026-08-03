import { ipcMain, app, shell, BrowserWindow } from 'electron'

export function registerAppIpc() {
  // ── Versão ────────────────────────────────────────────────
  ipcMain.handle('app:getVersion', () => app.getVersion())

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
