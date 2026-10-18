import { useEffect, useState, type FormEvent } from 'react'
import type { AppStatus } from '@shared/channels'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import BalanceForm from '../components/BalanceForm'
import DbForm from '../components/DbForm'

/** Nom de la société : c'est lui qui s'imprime en tête du ticket. */
function CompanyForm() {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.settings
      .getCompany()
      .then(setName)
      .catch(() => undefined)
  }, [])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaved(false)
    setError(null)
    try {
      const result = await call(api.settings.saveCompany(name))
      if (result.ok) setSaved(true)
      else setError(result.message)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <section className="card">
      <h2>{t('settings.company')}</h2>
      <form className="row" onSubmit={submit}>
        <label style={{ flex: 1 }}>
          {t('settings.companyName')}
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <button type="submit" disabled={name.trim().length === 0}>
          {t('common.save')}
        </button>
        {saved && <span className="ok">{t('settings.saved')}</span>}
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

export default function Settings() {
  const { t } = useI18n()
  const [status, setStatus] = useState<AppStatus | null>(null)

  useEffect(() => {
    api.app
      .status()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  const dbLabel = !status
    ? t('common.loading')
    : !status.dbConfigured
      ? t('db.notConfigured')
      : status.dbConnected
        ? t('db.connected')
        : t('db.disconnected')

  return (
    <div className="settings">
      <h2>{t('settings.title')}</h2>

      <p className={status?.dbConnected ? 'badge ok' : 'badge'}>
        {t('db.title')} : {dbLabel}
      </p>
      <p className="warn-box">{t('settings.adminWarning')}</p>

      <DbForm onConnected={() => void api.app.status().then(setStatus)} />
      <BalanceForm />
      {status?.dbConnected && <CompanyForm />}

      <section className="card">
        <h2>{t('settings.app')}</h2>
        <p className="muted">
          {t('settings.version')} : 0.1.0 — {t('app.station')} : {status?.balance.port ?? '—'}
        </p>
      </section>
    </div>
  )
}
