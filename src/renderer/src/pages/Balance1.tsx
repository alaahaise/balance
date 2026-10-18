import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizePlate, staleTicketsForPlate } from '@shared/domain/plate'
import { productKnownAtFirstWeighing } from '@shared/domain/weighing'
import type { Operation, OperationType, ProductLine, WeightSample } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg } from '../api'
import CaptureBox, { type CaptureRequest } from '../components/CaptureBox'
import ManualMark from '../components/ManualMark'
import ProductLines, { cleanLines, hasIncompleteLine } from '../components/ProductLines'
import SimulatorPanel from '../components/SimulatorPanel'
import TicketPreview from '../components/TicketPreview'
import WeightReadout from '../components/WeightReadout'
import { useBalance } from '../hooks/useBalance'
import { useI18n } from '../i18n'

/** Une entrée démarre avec une ligne produit prête à remplir ; les autres types n'en ont pas ici. */
const blankLines = (type: OperationType): ProductLine[] =>
  productKnownAtFirstWeighing(type) ? [{ productCode: '', quantityKg: 0 }] : []

/**
 * Première balance : le camion arrive, on saisit matricule et chauffeur, on pèse.
 *
 * La pesée crée le ticket et l'enregistre : le « bon de pesée n° 1 » est donc
 * imprimable tout de suite, sans attendre la 2e balance.
 *
 * Pour une entrée, le produit et la quantité attendue sont déjà connus et se
 * saisissent ici. Pour une sortie, le camion arrive à vide : ils se saisissent à
 * la 2e balance. Le reste (tiers, lieux) se complète toujours à la 2e balance.
 */
export default function Balance1({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const [plate, setPlate] = useState('')
  const [driverName, setDriverName] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<ProductLine[]>(() => blankLines(type))
  const [ticket, setTicket] = useState<Operation | null>(null)
  // Camion repassé sur la balance : la 1re pesée du ticket existant est à refaire.
  const [redo, setRedo] = useState(false)
  const [busy, setBusy] = useState(false)
  // Anciens tickets du même camion, restés sans 2e pesée (voir plus bas).
  const [stale, setStale] = useState<Operation[]>([])
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const ticketRef = useRef<Operation | null>(null)
  const knowsProduct = productKnownAtFirstWeighing(type)
  const incomplete = knowsProduct && hasIncompleteLine(lines)

  const captureFirst = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      if (!ticketRef.current && knowsProduct && hasIncompleteLine(lines)) {
        setError(t('lines.incomplete'))
        return
      }
      if (!ticketRef.current && stale.length > 0) {
        setError(t('bal1.dup.hint'))
        return
      }
      setBusy(true)
      setError(null)
      try {
        let current = ticketRef.current
        const isRedo = current != null && redo
        if (!current) {
          const clean = knowsProduct ? cleanLines(lines) : []
          current = await call(
            api.ops.create({
              type,
              plate: plate || null,
              driverName: driverName || null,
              notes: notes || null,
              lines: clean.length > 0 ? clean : undefined
            })
          )
          ticketRef.current = current
        }
        const payload = {
          operationId: current.id,
          weight,
          isManual: manual,
          stableMs: source?.stableMs ?? null,
          // Poids tapé au clavier : pas de trame de la balance, on le dit dans la trace.
          raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null
        }
        const updated = await call(isRedo ? api.ops.redoFirst(payload) : api.ops.capture(payload))
        if (isRedo) stopRedo()
        ticketRef.current = updated
        setTicket(updated)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [type, plate, driverName, notes, lines, knowsProduct, redo, stale, t]
  )

  const balance = useBalance(setError)

  function stopRedo(): void {
    setRedo(false)
  }

  function startRedo(): void {
    setRedo(true)
    setError(null)
  }

  function reset(): void {
    stopRedo()
    ticketRef.current = null
    setTicket(null)
    setPlate('')
    setDriverName('')
    setNotes('')
    setLines(blankLines(type))
    setError(null)
  }

  // Changer de menu change de type : repartir d'un camion vierge.
  useEffect(() => {
    reset()
  }, [type])

  // Un camion qui n'est jamais revenu à la 2e balance garde un ticket ouvert. S'il se
  // représente pour une nouvelle 1re pesée, l'ancien ticket doit être annulé avant.
  useEffect(() => {
    if (ticket || normalizePlate(plate) === '') {
      setStale([])
      return
    }
    let active = true
    const timer = setTimeout(() => {
      call(api.ops.list({ status: 'OUVERTE', limit: 200 }))
        .then((rows) => {
          if (active) setStale(staleTicketsForPlate(rows, plate))
        })
        .catch(() => undefined)
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [plate, ticket])

  async function cancelStale(op: Operation): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await call(api.ops.cancel(op.id, t('bal1.dup.reason')))
      setStale((rows) => rows.filter((row) => row.id !== op.id))
      setConfirmCancel(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function captureNow(request: CaptureRequest): Promise<void> {
    await captureFirst(request.weight, request.manual, request.manual ? null : balance.sample)
  }

  function newTruck(): void {
    reset()
  }

  async function printTicket(id: number): Promise<void> {
    setBusy(true)
    try {
      const result = await call(api.ops.print(id, lang))
      if (!result.ok) setError(result.message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function openPreview(id: number): Promise<void> {
    setBusy(true)
    try {
      setPreview({ id, html: await call(api.ops.html(id, lang)) })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const captureBox = (
    <CaptureBox
      label={redo ? t('bal.redoCapture') : t('bal1.capture')}
      sample={balance.sample}
      busy={busy}
      blocked={!redo && (incomplete || stale.length > 0)}
      onCapture={(request) => void captureNow(request)}
      onCancel={redo ? stopRedo : undefined}
    />
  )

  return (
    <div className="station">
      <WeightReadout
        sample={balance.sample}
        running={balance.running}
        busy={busy}
        onStart={() => void balance.startBalance()}
      />

      {error && <p className="error">{error}</p>}

      {!ticket && (
        <div className="card form-card">
          <h2>{t('bal1.title')}</h2>
          <div className="form-col">
            <label>
              {t('station.plate')}
              <input autoFocus value={plate} onChange={(e) => setPlate(e.target.value)} />
            </label>

            {stale.length > 0 && (
              <div className="stale-box">
                <strong>{t('bal1.dup.title')}</strong>
                {stale.map((op) => (
                  <div className="stale-row" key={op.id}>
                    <span>
                      <strong>{op.ticketNo}</strong> · {t(`station.type.${op.type}`)} ·{' '}
                      {formatKg(op.first?.weight, lang)}
                      {op.first ? ` · ${formatDateTime(op.first.at)}` : ''}
                    </span>
                    {confirmCancel === op.id ? (
                      <span className="stale-actions">
                        <strong>{t('bal1.dup.confirm')}</strong>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() => void cancelStale(op)}
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setConfirmCancel(null)}
                        >
                          {t('common.cancel')}
                        </button>
                      </span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => setConfirmCancel(op.id)}>
                        {t('bal1.dup.cancel')}
                      </button>
                    )}
                  </div>
                ))}
                <span className="muted">{t('bal1.dup.hint')}</span>
              </div>
            )}

            <label>
              {t('station.driver')}
              <input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </label>

            {knowsProduct ? (
              <ProductLines lines={lines} onChange={setLines} disabled={busy} />
            ) : (
              <p className="hint-box">{t('bal1.productLater')}</p>
            )}

            <label>
              {t('station.notes')}
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>

          {captureBox}
        </div>
      )}

      {ticket && (
        <div className="card form-card">
          <div className="ticket-head">
            <span className="badge">{t('ops.primary')}</span>
            <strong>{ticket.ticketNo}</strong>
          </div>

          <div className="summary">
            <div>
              <span className="muted">{t('station.plate')}</span>
              <p>{ticket.plate || '—'}</p>
            </div>
            <div>
              <span className="muted">{t('station.driver')}</span>
              <p>{ticket.driverName || '—'}</p>
            </div>
            <div>
              <span className="muted">{t('station.firstWeigh')}</span>
              <p>
                <strong>{formatKg(ticket.first?.weight, lang)}</strong>
                {ticket.first?.isManual && <ManualMark />}
              </p>
              <small className="muted">
                {ticket.first ? formatDateTime(ticket.first.at) : '—'}
              </small>
            </div>
          </div>

          {ticket.lines.length > 0 && (
            <div className="lines-readonly">
              <span className="muted">{t('lines.title')}</span>
              {ticket.lines.map((line, index) => (
                <div className="row" key={index}>
                  <span>{line.productCode}</span>
                  <strong>{formatKg(line.quantityKg, lang)}</strong>
                </div>
              ))}
            </div>
          )}

          {redo ? (
            <>
              <p className="warn-box">
                {t('bal.redoHint', { weight: formatKg(ticket.first?.weight, lang) })}
              </p>
              {captureBox}
            </>
          ) : (
            <>
              <p className="ok">{t('bal1.done')}</p>
              <div className="actions-row">
                <button
                  type="button"
                  className="primary big"
                  disabled={busy}
                  onClick={() => void printTicket(ticket.id)}
                >
                  {t('bal1.printFirst')}
                </button>
                <button type="button" disabled={busy} onClick={() => void openPreview(ticket.id)}>
                  {t('station.preview')}
                </button>
                {!ticket.second && (
                  <button type="button" disabled={busy} onClick={startRedo}>
                    {t('bal.redo')}
                  </button>
                )}
                <button type="button" className="ghost" onClick={newTruck}>
                  {t('bal1.new')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {balance.simulated && <SimulatorPanel />}

      {preview && (
        <TicketPreview
          html={preview.html}
          busy={busy}
          onClose={() => setPreview(null)}
          onPrint={() => {
            const id = preview.id
            setPreview(null)
            void printTicket(id)
          }}
        />
      )}
    </div>
  )
}
