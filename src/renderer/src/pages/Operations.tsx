import { useCallback, useEffect, useState } from 'react'
import type { Location, OpUpdate } from '@shared/channels'
import type { Operation, OperationStatus, OperationType } from '@shared/types'
import { api, call, errorMessage, formatDateTime, formatKg } from '../api'
import TicketPreview from '../components/TicketPreview'
import { useI18n } from '../i18n'

interface EditDraft {
  plate: string
  driverName: string
  partnerName: string
  blNo: string
  blDate: string
  locationFromId: string
  locationToId: string
  notes: string
}

function toDraft(op: Operation): EditDraft {
  return {
    plate: op.plate ?? '',
    driverName: op.driverName ?? '',
    partnerName: op.partnerName ?? '',
    blNo: op.blNo ?? '',
    blDate: op.blDate ?? '',
    locationFromId: op.locationFromId == null ? '' : String(op.locationFromId),
    locationToId: op.locationToId == null ? '' : String(op.locationToId),
    notes: op.notes ?? ''
  }
}

/**
 * Tickets d'un type de pesée : consultation, correction des champs descriptifs,
 * enregistrement d'un ticket resté ouvert, réimpression.
 *
 * Les poids ne sont pas modifiables ici (ils viennent des pesées enregistrées) et
 * les produits se complètent à la 2e balance, où le total supposé se calcule.
 */
export default function Operations({ type }: { type: OperationType }) {
  const { t, lang } = useI18n()
  const [status, setStatus] = useState<OperationStatus | null>(null)
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Operation[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [preview, setPreview] = useState<{ id: number; html: string } | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setRows(
        await call(
          api.ops.list({
            type,
            status,
            search: search.trim() === '' ? null : search.trim(),
            limit: 200
          })
        )
      )
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [type, status, search])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    api.ref
      .locations()
      .then(setLocations)
      .catch(() => undefined)
  }, [])

  async function confirmCancel(id: number): Promise<void> {
    try {
      await call(api.ops.cancel(id, reason))
      setCancellingId(null)
      setReason('')
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function closeTicket(id: number): Promise<void> {
    setBusy(true)
    try {
      await call(api.ops.close(id))
      await reload()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(id: number): Promise<void> {
    if (!draft) return
    setBusy(true)
    try {
      const patch: OpUpdate = {
        plate: draft.plate || null,
        driverName: draft.driverName || null,
        partnerName: draft.partnerName || null,
        blNo: draft.blNo || null,
        blDate: draft.blDate || null,
        locationFromId: draft.locationFromId === '' ? null : Number(draft.locationFromId),
        locationToId: draft.locationToId === '' ? null : Number(draft.locationToId),
        notes: draft.notes || null
      }
      await call(api.ops.update(id, patch))
      setEditingId(null)
      setDraft(null)
      await reload()
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

  const editField = (key: keyof EditDraft) => ({
    value: draft?.[key] ?? '',
    onChange: (e: { target: { value: string } }) =>
      setDraft((current) => (current ? { ...current, [key]: e.target.value } : current))
  })

  const locationOptions = (
    <>
      <option value="">{t('station.outside')}</option>
      {locations.map((l) => (
        <option key={l.id} value={l.id}>
          {lang === 'ar' && l.nameAr ? l.nameAr : l.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="card">
      <h2>{`${t('ops.title')} — ${t(`station.type.${type}`)}`}</h2>

      <div className="row">
        <select
          value={status ?? ''}
          onChange={(e) => setStatus((e.target.value || null) as OperationStatus | null)}
        >
          <option value="">{t('common.all')}</option>
          <option value="OUVERTE">{t('ops.status.OUVERTE')}</option>
          <option value="FERMEE">{t('ops.status.FERMEE')}</option>
          <option value="ANNULEE">{t('ops.status.ANNULEE')}</option>
        </select>
        <input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="ghost" onClick={() => void reload()}>
          {t('common.refresh')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>{t('station.ticket')}</th>
            <th>{t('ops.date')}</th>
            <th>{t('station.plate')}</th>
            <th>{t('ops.products')}</th>
            <th>{t('station.tare')}</th>
            <th>{t('station.gross')}</th>
            <th>{t('station.net')}</th>
            <th>{t('station.ecart')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id}>
                <td colSpan={9}>
                  <strong>{t('ops.editTitle')}</strong>
                  <div className="grid">
                    <label>
                      {t('station.plate')}
                      <input {...editField('plate')} />
                    </label>
                    <label>
                      {t('station.driver')}
                      <input {...editField('driverName')} />
                    </label>
                    <label>
                      {t('station.partner')}
                      <input {...editField('partnerName')} />
                    </label>
                    <label>
                      {t('station.blNo')}
                      <input {...editField('blNo')} />
                    </label>
                    <label>
                      {t('station.locationFrom')}
                      <select {...editField('locationFromId')}>{locationOptions}</select>
                    </label>
                    <label>
                      {t('station.locationTo')}
                      <select {...editField('locationToId')}>{locationOptions}</select>
                    </label>
                  </div>
                  <label>
                    {t('station.notes')}
                    <textarea rows={2} {...editField('notes')} />
                  </label>
                  <div className="row">
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void saveEdit(row.id)}
                    >
                      {t('common.save')}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingId(null)
                        setDraft(null)
                      }}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={row.id} className={row.status === 'ANNULEE' ? 'cancelled' : undefined}>
                <td>
                  <strong>{row.ticketNo}</strong>
                  <br />
                  <small className="muted">{t(`ops.status.${row.status}`)}</small>
                  {row.status !== 'ANNULEE' && (
                    <span className={row.second == null ? 'badge' : 'badge ok'}>
                      {row.second == null ? t('ops.primary') : t('ops.final')}
                    </span>
                  )}
                </td>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{row.plate || '—'}</td>
                <td>
                  {row.lines.length === 0
                    ? '—'
                    : row.lines.map((l) => `${l.productCode} (${l.quantityKg} kg)`).join(', ')}
                </td>
                <td>{formatKg(row.tareWeight, lang)}</td>
                <td>{formatKg(row.grossWeight, lang)}</td>
                <td>
                  <strong>{formatKg(row.netWeight, lang)}</strong>
                </td>
                <td>
                  {formatKg(row.ecart, lang)}
                  {row.ecartOk != null && (
                    <span className={row.ecartOk ? 'badge ok' : 'badge warn'}>
                      {row.ecartOk ? t('station.ecartOk') : t('station.ecartKo')}
                    </span>
                  )}
                </td>
                <td>
                  <div className="row actions">
                    {row.status === 'OUVERTE' && row.second != null && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void closeTicket(row.id)}
                      >
                        {t('common.save')}
                      </button>
                    )}
                    {row.status !== 'ANNULEE' && (
                      <>
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          onClick={() => void printTicket(row.id)}
                        >
                          {t('ops.print')}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          onClick={() => void openPreview(row.id)}
                        >
                          {t('ops.preview')}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingId(row.id)
                        setDraft(toDraft(row))
                      }}
                    >
                      {t('ops.edit')}
                    </button>
                    {row.status === 'ANNULEE' ? (
                      <small className="muted">{row.cancelReason}</small>
                    ) : cancellingId === row.id ? (
                      <>
                        <input
                          autoFocus
                          placeholder={t('ops.cancelTitle')}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <button
                          type="button"
                          className="danger"
                          disabled={reason.trim().length < 3}
                          onClick={() => void confirmCancel(row.id)}
                        >
                          {t('common.confirm')}
                        </button>
                        <button type="button" className="ghost" onClick={() => setCancellingId(null)}>
                          {t('common.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setCancellingId(row.id)}
                      >
                        {t('common.cancel')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          )}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="muted">
                {t('ops.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

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
