import { useEffect, useState } from 'react'
import type { BalanceStatus } from '@shared/channels'
import { DEFAULT_BALANCE_CONFIG, type BalanceConfig } from '@shared/domain/balance-parser'
import type { WeightSample } from '@shared/types'
import { api, call, errorMessage, formatKg } from '../api'
import { useI18n } from '../i18n'

const OFFLINE: BalanceStatus = { running: false, port: null, lastError: null, simulated: false }

/** Réglage de la liaison série, avec test à l'écran : la regex de trame se vérifie sur le flux brut. */
export default function BalanceForm() {
  const { t, lang } = useI18n()
  const [cfg, setCfg] = useState<BalanceConfig>(DEFAULT_BALANCE_CONFIG)
  const [ports, setPorts] = useState<string[]>([])
  const [status, setStatus] = useState<BalanceStatus>(OFFLINE)
  const [sample, setSample] = useState<WeightSample | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        if (s.balance) setCfg(s.balance)
      })
      .catch(() => undefined)
    api.balance.status().then(setStatus).catch(() => undefined)
    return api.balance.onSample(setSample)
  }, [])

  function set<K extends keyof BalanceConfig>(key: K, value: BalanceConfig[K]): void {
    setCfg({ ...cfg, [key]: value })
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setOk(false)
      setMessage(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>{t('bal.title')}</h2>
      <label className="inline">
        <input
          type="checkbox"
          checked={cfg.simulate === true}
          onChange={(e) => set('simulate', e.target.checked)}
        />
        {t('bal.simulate')}
      </label>
      {cfg.simulate === true && <p className="warn-box">{t('bal.simulateHint')}</p>}
      <div className="grid">
        <label>
          {t('bal.port')}
          <input value={cfg.port} onChange={(e) => set('port', e.target.value)} />
        </label>
        <label>
          {t('bal.baud')}
          <input type="number" value={cfg.baud} onChange={(e) => set('baud', Number(e.target.value))} />
        </label>
        <label>
          {t('bal.dataBits')}
          <select value={cfg.dataBits} onChange={(e) => set('dataBits', Number(e.target.value) === 7 ? 7 : 8)}>
            <option value={7}>7</option>
            <option value={8}>8</option>
          </select>
        </label>
        <label>
          {t('bal.parity')}
          <select
            value={cfg.parity}
            onChange={(e) => set('parity', e.target.value as BalanceConfig['parity'])}
          >
            <option value="none">none</option>
            <option value="even">even</option>
            <option value="odd">odd</option>
          </select>
        </label>
        <label>
          {t('bal.stopBits')}
          <select value={cfg.stopBits} onChange={(e) => set('stopBits', Number(e.target.value) === 2 ? 2 : 1)}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label>
          {t('bal.request')}
          <input
            value={cfg.requestHex ?? ''}
            placeholder={t('bal.requestHint')}
            onChange={(e) => set('requestHex', e.target.value.trim() === '' ? null : e.target.value)}
          />
        </label>
        <label>
          {t('bal.pollMs')}
          <input
            type="number"
            value={cfg.pollMs}
            onChange={(e) => set('pollMs', Number(e.target.value))}
          />
        </label>
        <label>
          {t('bal.frameRegex')}
          <input value={cfg.frameRegex} onChange={(e) => set('frameRegex', e.target.value)} />
        </label>
        <label>
          {t('bal.decimalSep')}
          <select
            value={cfg.decimalSep}
            onChange={(e) => set('decimalSep', e.target.value === ',' ? ',' : '.')}
          >
            <option value=".">.</option>
            <option value=",">,</option>
          </select>
        </label>
        <label>
          {t('bal.unit')}
          <input value={cfg.unit} onChange={(e) => set('unit', e.target.value)} />
        </label>
        <label>
          {t('bal.stableMs')}
          <input
            type="number"
            value={cfg.stableMs}
            onChange={(e) => set('stableMs', Number(e.target.value))}
          />
        </label>
        <label>
          {t('bal.stableEpsilon')}
          <input
            type="number"
            step="0.1"
            value={cfg.stableEpsilon}
            onChange={(e) => set('stableEpsilon', Number(e.target.value))}
          />
        </label>
        <label>
          {t('bal.uiHz')}
          <input type="number" value={cfg.uiHz} onChange={(e) => set('uiHz', Number(e.target.value))} />
        </label>
      </div>

      <div className="row">
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const found = await call(api.balance.ports())
              setPorts(found)
              setOk(true)
              setMessage(`${t('common.detected')} : ${found.join(', ') || '—'}`)
            })
          }
        >
          {t('bal.detect')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await call(api.settings.saveBalance(cfg))
              setOk(result.ok)
              setMessage(result.message)
            })
          }
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          disabled={busy || status.running}
          onClick={() =>
            void run(async () => {
              await call(api.settings.saveBalance(cfg))
              setStatus(await call(api.balance.start()))
              setMessage(null)
            })
          }
        >
          {t('bal.start')}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy || !status.running}
          onClick={() => void run(async () => setStatus(await call(api.balance.stop())))}
        >
          {t('bal.stop')}
        </button>
        <span className={status.running ? 'badge ok' : 'badge'}>
          {status.running ? `${t('bal.running')} — ${status.port}` : t('bal.stopped')}
        </span>
      </div>

      {ports.length > 0 && <p className="muted">{ports.join(' · ')}</p>}
      {message && <p className={ok ? 'ok' : 'error'}>{message}</p>}
      {status.lastError && <p className="error">{status.lastError}</p>}

      <div className="test-strip">
        <div>
          <span className="muted">{t('bal.testWeight')}</span>
          <strong className="test-weight">{formatKg(sample?.weight ?? null, lang)}</strong>
          <span className={sample?.stable ? 'badge ok' : 'badge'}>
            {sample?.stable ? t('station.stable') : t('station.unstable')}
          </span>
        </div>
        <code className="raw">{sample?.raw ?? t('station.noSample')}</code>
      </div>
      <p className="muted">{t('bal.hint')}</p>
    </section>
  )
}
