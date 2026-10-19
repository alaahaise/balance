import { useCallback, useEffect, useRef, useState } from 'react'
import type { Location, OpUpdate } from '@shared/channels'
import { asksFrom, asksTo, locationFieldsFor } from '@shared/domain/locations'
import { isManualKind } from '@shared/domain/weighing'
import type { Operation, OperationType, ProductLine, WeightSample } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg } from '../api'
import CaptureBox, { type CaptureRequest } from '../components/CaptureBox'
import LocationPickers from '../components/LocationPickers'
import ManualMark from '../components/ManualMark'
import Pagination from '../components/Pagination'
import ProductLines, { cleanLines, hasIncompleteLine } from '../components/ProductLines'
import RetourToggle from '../components/RetourToggle'
import SimulatorPanel from '../components/SimulatorPanel'
import TicketFilters from '../components/TicketFilters'
import TicketPreview from '../components/TicketPreview'
import WeightReadout from '../components/WeightReadout'
import { useBalance } from '../hooks/useBalance'
import { useTicketPage } from '../hooks/useTicketPage'
import { useI18n } from '../i18n'

interface CompleteForm {
  isRetour: boolean
  partnerName: string
  blNo: string
  locationFromId: string
  locationToId: string
  notes: string
}

/**
 * Champs descriptifs saisis à l'écran, au format de `ops.update`.
 * Seuls les lieux que ce type de ticket demande sont envoyés : le serveur fixe
 * les autres (une sortie part du stock central vers l'extérieur).
 */
function infoPatch(form: CompleteForm, type: OperationType): OpUpdate {
  const fields = locationFieldsFor(type, form.isRetour)
  const patch: OpUpdate = {
    isRetour: form.isRetour,
    partnerName: form.partnerName || null,
    blNo: form.blNo || null,
    notes: form.notes || null
  }
  if (asksFrom(fields)) {
    patch.locationFromId = form.locationFromId === '' ? null : Number(form.locationFromId)
  }
  if (asksTo(fields)) {
    patch.locationToId = form.locationToId === '' ? null : Number(form.locationToId)
  }
  return patch
}

const EMPTY_FORM: CompleteForm = {
  isRetour: false,
  partnerName: '',
  blNo: '',
  locationFromId: '',
  locationToId: '',
  notes: ''
}

/**
 * Deuxième balance : on reprend un ticket déjà pesé une fois, on complète ce qui
 * manque (produits, tiers, lieux), puis on pèse la 2e fois.
 *
 * Le poids supposé est la somme des produits déclarés ; l'écart se calcule
 * contre elle. Les produits sont envoyés avec la pesée, pour qu'un total resté
 * à l'écran ne puisse pas décaler l'écart.
 */
export default function Balance2({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const [selected, setSelected] = useState<Operation | null>(null)
  const [form, setForm] = useState<CompleteForm>(EMPTY_FORM)
  const [lines, setLines] = useState<ProductLine[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  // Camion repassé sur la balance : la 1re pesée du ticket choisi est à refaire.
  const [redo, setRedo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const ticketRef = useRef<Operation | null>(null)

  // Liste paginée côté serveur : tickets pesés une fois, en attente de la 2e pesée.
  const list = useTicketPage({ type, status: 'OUVERTE', awaitingSecond: true })

  useEffect(() => {
    api.ref
      .locations()
      .then(setLocations)
      .catch(() => undefined)
  }, [])

  const captureSecond = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      const current = ticketRef.current
      if (!current) return
      if (hasIncompleteLine(lines)) {
        setError(t('lines.incomplete'))
        return
      }
      const clean = cleanLines(lines)
      if (clean.length === 0) {
        setError(t('bal2.needLines'))
        return
      }
      setBusy(true)
      setError(null)
      try {
        // Les informations saisies partent avec la pesée : pas d'étape
        // « enregistrer » à oublier avant de peser.
        await call(api.ops.update(current.id, infoPatch(form, type)))
        const updated = await call(
          api.ops.capture({
            operationId: current.id,
            weight,
            isManual: manual,
            stableMs: source?.stableMs ?? null,
            raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null,
            lines: clean
          })
        )
        ticketRef.current = updated
        setSelected(updated)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [lines, form, type, t]
  )

  /** La 1re pesée est refaite : nouveau poids ; l'ancienne reste tracée côté base. */
  const redoFirstNow = useCallback(
    async (weight: number, manual: boolean, source: WeightSample | null): Promise<void> => {
      const current = ticketRef.current
      if (!current?.first) return
      setBusy(true)
      setError(null)
      try {
        const updated = await call(
          api.ops.redoFirst({
            operationId: current.id,
            weight,
            isManual: manual,
            stableMs: source?.stableMs ?? null,
            raw: source?.raw ? source.raw.slice(-255) : manual && !source ? 'MANUEL' : null
          })
        )
        ticketRef.current = updated
        setSelected(updated)
        setRedo(false)
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const balance = useBalance(setError)

  function startRedo(): void {
    setRedo(true)
    setError(null)
  }

  function stopRedo(): void {
    setRedo(false)
  }

  // Changer de menu change de type : revenir à la liste des tickets en attente.
  useEffect(() => {
    ticketRef.current = null
    setSelected(null)
    setLines([])
    setForm(EMPTY_FORM)
    setError(null)
  }, [type])

  function choose(op: Operation): void {
    stopRedo()
    ticketRef.current = op
    setSelected(op)
    setForm({
      isRetour: op.isRetour,
      partnerName: op.partnerName ?? '',
      blNo: op.blNo ?? '',
      locationFromId: op.locationFromId == null ? '' : String(op.locationFromId),
      locationToId: op.locationToId == null ? '' : String(op.locationToId),
      notes: op.notes ?? ''
    })
    // Au moins une ligne prête à remplir : le produit est la première chose à saisir ici.
    setLines(
      op.lines.length > 0 ? op.lines.map((l) => ({ ...l })) : [{ productCode: '', quantityKg: 0 }]
    )
    setConfirmSave(false)
    setError(null)
  }

  function back(): void {
    stopRedo()
    list.setSearch('')
    ticketRef.current = null
    setSelected(null)
    setLines([])
    setForm(EMPTY_FORM)
    void list.reload()
  }

  /** La 2e pesée faite ne suffit pas : c'est cette confirmation qui enregistre. */
  async function saveTicket(): Promise<void> {
    const current = ticketRef.current
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const closed = await call(api.ops.close(current.id))
      ticketRef.current = closed
      setSelected(closed)
      setConfirmSave(false)
      await list.reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
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

  async function captureNow(request: CaptureRequest): Promise<void> {
    if (!selected?.first) return
    const source = request.manual ? null : balance.sample
    if (redo) await redoFirstNow(request.weight, request.manual, source)
    else await captureSecond(request.weight, request.manual, source)
  }

  const complete = selected?.second != null
  const closed = selected != null && selected.status !== 'OUVERTE'
  const incomplete = hasIncompleteLine(lines)

  const rows = list.data?.rows ?? []

  return (
    <div className="station">
      {(error ?? list.error) && <p className="error">{error ?? list.error}</p>}

      {!selected && (
        <div className="card form-card">
          <h2>{t('bal2.pending')}</h2>
          <TicketFilters
            autoFocus
            search={list.search}
            onSearch={list.setSearch}
            placeholder={t('bal2.search')}
            dateFrom={list.dateFrom}
            dateTo={list.dateTo}
            onDateFrom={list.setDateFrom}
            onDateTo={list.setDateTo}
          />

          <table>
            <thead>
              <tr>
                <th>{t('station.ticket')}</th>
                <th>{t('ops.date')}</th>
                <th>{t('station.plate')}</th>
                <th>{t('station.driver')}</th>
                <th>{t('station.firstWeigh')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((op) => (
                <tr key={op.id}>
                  <td>
                    <strong>{op.ticketNo}</strong>
                    {op.isRetour && <span className="badge warn">{t('station.retour')}</span>}
                  </td>
                  <td>{formatDateTime(op.createdAt)}</td>
                  <td>{op.plate || '—'}</td>
                  <td>{op.driverName || '—'}</td>
                  <td>
                    {formatKg(op.first?.weight, lang)}
                    {op.first?.isManual && <ManualMark />}
                  </td>
                  <td>
                    <button type="button" className="primary" onClick={() => choose(op)}>
                      {t('bal2.choose')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !list.loading && (
                <tr>
                  <td colSpan={6} className="muted">
                    {list.filtered ? t('bal2.noMatch') : t('bal2.none')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {list.data && (
            <Pagination
              page={list.data.page}
              pages={list.data.pages}
              total={list.data.total}
              pageSize={list.data.pageSize}
              loading={list.loading}
              onPage={list.setPage}
              onPageSize={list.setPageSize}
            />
          )}
        </div>
      )}

      {selected && (
        <>
          <WeightReadout
            sample={balance.sample}
            running={balance.running}
            busy={busy}
            onStart={() => void balance.startBalance()}
          />

          <div className="card form-card">
            <div className="ticket-head">
              <span className={`badge${closed ? ' ok' : ''}`}>
                {closed ? t('ops.final') : t('ops.primary')}
              </span>
              {selected.isRetour && <span className="badge warn">{t('station.retour')}</span>}
              <strong>{selected.ticketNo}</strong>
              {!complete && (
                <div className="head-actions">
                  {!redo && (
                    <button type="button" disabled={busy} onClick={startRedo}>
                      {t('bal.redo')}
                    </button>
                  )}
                  <button type="button" className="ghost" onClick={back}>
                    {t('bal2.back')}
                  </button>
                </div>
              )}
            </div>

            <div className="summary">
              <div>
                <span className="muted">{t('station.plate')}</span>
                <p>{selected.plate || '—'}</p>
              </div>
              <div>
                <span className="muted">{t('station.driver')}</span>
                <p>{selected.driverName || '—'}</p>
              </div>
              <div>
                <span className="muted">{t('station.firstWeigh')}</span>
                <p>
                  <strong>{formatKg(selected.first?.weight, lang)}</strong>
                  {selected.first?.isManual && <ManualMark />}
                </p>
              </div>
            </div>

            {redo && (
              <p className="warn-box">
                {t('bal.redoHint', { weight: formatKg(selected.first?.weight, lang) })}
              </p>
            )}

            {!complete && (
              <div className="form-col">
                <ProductLines lines={lines} onChange={setLines} disabled={busy} />
                <div className="pair">
                  <label>
                    {t('station.partner')}
                    <input
                      value={form.partnerName}
                      onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('station.blNo')}
                    <input
                      value={form.blNo}
                      onChange={(e) => setForm({ ...form, blNo: e.target.value })}
                    />
                  </label>
                </div>
                <RetourToggle
                  type={type}
                  checked={form.isRetour}
                  onChange={(value) => setForm({ ...form, isRetour: value })}
                  disabled={busy}
                />
                <LocationPickers
                  type={type}
                  isRetour={form.isRetour}
                  locations={locations}
                  from={form.locationFromId}
                  to={form.locationToId}
                  onFrom={(value) => setForm({ ...form, locationFromId: value })}
                  onTo={(value) => setForm({ ...form, locationToId: value })}
                  disabled={busy}
                />
                <label>
                  {t('station.notes')}
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </label>
              </div>
            )}

            {complete && (
              <>
                <div className="weighings">
                  <div className="weigh">
                    <span className="muted">{t('station.firstWeigh')}</span>
                    <strong>
                      {formatKg(selected.first?.weight, lang)}
                      {selected.first?.isManual && <ManualMark />}
                    </strong>
                    <small>{selected.first ? formatDateTime(selected.first.at) : '—'}</small>
                  </div>
                  <div className="weigh">
                    <span className="muted">{t('station.secondWeigh')}</span>
                    <strong>
                      {formatKg(selected.second?.weight, lang)}
                      {selected.second?.isManual && <ManualMark />}
                    </strong>
                    <small>{selected.second ? formatDateTime(selected.second.at) : '—'}</small>
                  </div>
                </div>

                {selected.lines.length > 0 && (
                  <div className="lines-readonly">
                    <span className="muted">{t('lines.title')}</span>
                    {selected.lines.map((line, index) => (
                      <div className="row" key={index}>
                        <span>{line.productCode}</span>
                        <strong>{formatKg(line.quantityKg, lang)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <div className="totals">
                  <div>
                    <span className="muted">{t('station.tare')}</span>
                    <strong>
                      {formatKg(selected.tareWeight, lang)}
                      {isManualKind(selected, 'TARE') && <ManualMark />}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">{t('station.gross')}</span>
                    <strong>
                      {formatKg(selected.grossWeight, lang)}
                      {isManualKind(selected, 'BRUT') && <ManualMark />}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">{t('station.net')}</span>
                    <strong className="net">{formatKg(selected.netWeight, lang)}</strong>
                  </div>
                  <div>
                    <span className="muted">{t('station.weightSupposed')}</span>
                    <strong>{formatKg(selected.weightSupposed, lang)}</strong>
                  </div>
                  <div>
                    <span className="muted">{t('station.ecart')}</span>
                    <strong>{formatKg(selected.ecart, lang)}</strong>
                    {selected.ecartOk != null && (
                      <span className={selected.ecartOk ? 'badge ok' : 'badge warn'}>
                        {selected.ecartOk ? t('station.ecartOk') : t('station.ecartKo')}
                      </span>
                    )}
                  </div>
                </div>

                {!closed && (
                  <div className="row">
                    <p className="ok">{t('station.readyToSave')}</p>
                    {confirmSave ? (
                      <>
                        <strong>{t('station.confirmSave', { ticket: selected.ticketNo })}</strong>
                        <button
                          type="button"
                          className="primary"
                          disabled={busy}
                          onClick={() => void saveTicket()}
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setConfirmSave(false)}
                        >
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() => setConfirmSave(true)}
                      >
                        {t('station.save')}
                      </button>
                    )}
                  </div>
                )}

                {closed && <p className="ok">{t('station.closed')}</p>}
              </>
            )}

            {!complete && (
              <>
                <CaptureBox
                  label={redo ? t('bal.redoCapture') : t('bal2.capture')}
                  sample={balance.sample}
                  busy={busy}
                  blocked={!redo && incomplete}
                  onCapture={(request) => void captureNow(request)}
                  onCancel={redo ? stopRedo : undefined}
                />
              </>
            )}

            {complete && (
              <div className="actions-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void printTicket(selected.id)}
                >
                  {t('station.print')}
                </button>
                <button type="button" disabled={busy} onClick={() => void openPreview(selected.id)}>
                  {t('station.preview')}
                </button>
                <button type="button" className="ghost" onClick={back}>
                  {t('bal2.back')}
                </button>
              </div>
            )}
          </div>

          {balance.simulated && <SimulatorPanel />}
        </>
      )}

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
