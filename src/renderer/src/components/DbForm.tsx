import { useEffect, useState, type FormEvent } from 'react'
import type { DbConfig } from '@shared/channels'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'

const EMPTY: DbConfig = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'balance'
}

/** Connexion MySQL + création des tables. Réutilisé avant connexion et dans Paramètres. */
export default function DbForm({ onConnected }: { onConnected?: () => void }) {
  const { t } = useI18n()
  const [cfg, setCfg] = useState<DbConfig>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        if (s.db) setCfg(s.db)
      })
      .catch(() => undefined)
  }, [])

  async function connect(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(api.settings.saveDb(cfg))
      setOk(result.ok)
      setMessage(result.message)
      if (result.ok) onConnected?.()
    } catch (err) {
      setOk(false)
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function createTables(): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      const result = await call(api.db.migrate())
      setOk(result.ok)
      setMessage(result.message)
    } catch (err) {
      setOk(false)
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={connect}>
      <h2>{t('db.title')}</h2>
      <div className="grid">
        <label>
          {t('db.host')}
          <input value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} />
        </label>
        <label>
          {t('db.port')}
          <input
            type="number"
            value={cfg.port}
            onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })}
          />
        </label>
        <label>
          {t('db.user')}
          <input value={cfg.user} onChange={(e) => setCfg({ ...cfg, user: e.target.value })} />
        </label>
        <label>
          {t('db.password')}
          <input
            type="password"
            value={cfg.password}
            onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
          />
        </label>
        <label>
          {t('db.database')}
          <input value={cfg.database} onChange={(e) => setCfg({ ...cfg, database: e.target.value })} />
        </label>
      </div>

      <div className="row">
        <button type="submit" disabled={busy}>
          {t('db.test')}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void createTables()}>
          {t('db.migrate')}
        </button>
      </div>

      {message && <p className={ok ? 'ok' : 'error'}>{message}</p>}
    </form>
  )
}
