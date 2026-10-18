/**
 * Impression du ticket.
 *
 * Le ticket est rendu dans une fenêtre invisible puis envoyé à l'imprimante.
 * `silent: false` ouvre la boîte de dialogue du système : l'opérateur choisit
 * l'imprimante et confirme, ce qui évite d'imprimer sur la mauvaise.
 *
 * shortcut: pas d'impression silencieuse ni de mémorisation d'imprimante. Le
 * jour où le poste a une imprimante thermique dédiée, passer `silent: true` et
 * `deviceName` (réglable dans settings.json) pour sauter la boîte de dialogue.
 */
import { BrowserWindow } from 'electron'

export async function printHtml(html: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const done = new Promise<void>((resolve, reject) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        // Une annulation n'est pas une panne : ne pas alarmer l'opérateur.
        if (success || /cancel/i.test(reason ?? '')) resolve()
        else reject(new Error(reason || "L'impression a échoué"))
      })
    })
    // Garde-fou : si le pilote ne rappelle jamais, ne pas laisser la fenêtre pendue.
    const guard = new Promise<void>((resolve) => setTimeout(resolve, 60_000))
    done.catch(() => undefined) // sinon un rejet tardif reste non géré après le garde-fou
    await Promise.race([done, guard])
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}
