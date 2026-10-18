/**
 * Pont entre le renderer et le processus principal.
 *
 * Le preload tourne en sandbox : il n'expose que des fonctions nommées, jamais
 * `ipcRenderer` ni un module Node.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH, type AppApi } from '@shared/channels'

const invoke = (channel: string, ...args: unknown[]): Promise<never> =>
  ipcRenderer.invoke(channel, ...args) as Promise<never>

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api: AppApi = {
  settings: {
    get: () => invoke(CH.settingsGet),
    saveDb: (cfg) => invoke(CH.settingsSaveDb, cfg),
    saveBalance: (cfg) => invoke(CH.settingsSaveBalance, cfg),
    getCompany: () => invoke(CH.settingsGetCompany),
    saveCompany: (name) => invoke(CH.settingsSaveCompany, { name })
  },
  db: {
    test: (cfg) => invoke(CH.dbTest, cfg),
    migrate: () => invoke(CH.dbMigrate)
  },
  app: {
    status: () => invoke(CH.appStatus)
  },
  auth: {
    login: (username, password) => invoke(CH.authLogin, { username, password }),
    logout: () => invoke(CH.authLogout),
    current: () => invoke(CH.authCurrent)
  },
  ops: {
    create: (draft) => invoke(CH.opsCreate, draft),
    capture: (input) => invoke(CH.opsCapture, input),
    redoFirst: (input) => invoke(CH.opsRedoFirst, input),
    list: (filter) => invoke(CH.opsList, filter),
    cancel: (id, reason) => invoke(CH.opsCancel, { id, reason }),
    close: (id) => invoke(CH.opsClose, { id }),
    update: (id, patch) => invoke(CH.opsUpdate, { id, patch }),
    setLines: (id, lines) => invoke(CH.opsSetLines, { id, lines }),
    html: (id, lang) => invoke(CH.opsHtml, { id, lang }),
    print: (id, lang) => invoke(CH.opsPrint, { id, lang })
  },
  ref: {
    locations: () => invoke(CH.refLocations)
  },
  balance: {
    start: () => invoke(CH.balanceStart),
    stop: () => invoke(CH.balanceStop),
    status: () => invoke(CH.balanceStatus),
    ports: () => invoke(CH.balancePorts),
    simSet: (weight) => invoke(CH.balanceSimSet, { weight }),
    onSample: (cb) => subscribe(CH.evSample, cb),
    onStable: (cb) => subscribe(CH.evStable, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
