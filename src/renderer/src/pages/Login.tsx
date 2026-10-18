import { useState, type FormEvent } from 'react'
import type { SessionUser } from '@shared/types'
import { api, call, errorMessage } from '../api'
import { useI18n } from '../i18n'
import DbForm from '../components/DbForm'

/**
 * La connexion est le premier écran d'un poste neuf : la configuration de la
 * base doit donc être atteignable ici, sinon personne ne peut entrer pour
 * aller la régler.
 */
export default function Login({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const { t } = useI18n()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLogin(await call(api.auth.login(username, password)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <form className="card login" onSubmit={submit}>
        <h1>{t('app.title')}</h1>
        <h2>{t('login.title')}</h2>
        <label>
          {t('login.username')}
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          {t('login.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          {t('login.submit')}
        </button>
        {error && <p className="error">{error}</p>}
        <button type="button" className="link" onClick={() => setShowSetup(!showSetup)}>
          {t('login.setup')}
        </button>
      </form>

      {showSetup && (
        <div className="center-page">
          <DbForm />
          <p className="muted">{t('login.hint')}</p>
        </div>
      )}
    </div>
  )
}
