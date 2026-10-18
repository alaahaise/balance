/**
 * Fenêtre principale, verrouillée.
 *
 * Une application de pesée lit un port série et parle à MySQL : un renderer
 * compromis (une page web ouverte par erreur) ne doit pouvoir ni ouvrir ce port
 * ni atteindre la base. D'où contextIsolation + sandbox, et une politique de
 * sécurité de contenu injectée à la construction.
 */
import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Gestion des pesées',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Aucune navigation hors de l'application : un lien externe s'ouvre dans le
  // navigateur du système, jamais dans une fenêtre qui a accès au pont IPC.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  // `ELECTRON_RENDERER_URL` n'existe qu'en développement : le serveur Vite a
  // besoin de son websocket et de scripts injectés, la CSP n'y est donc pas
  // appliquée (elle est injectée dans le HTML au build, cf. electron.vite.config).
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void win.loadURL(devServer)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
