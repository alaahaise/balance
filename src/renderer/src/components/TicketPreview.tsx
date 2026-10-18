import { useI18n } from '../i18n'

/**
 * Aperçu du ticket, rendu dans un cadre à partir du HTML que le processus
 * principal enverra à l'imprimante : ce que l'opérateur voit est exactement ce
 * qui sortira sur le papier.
 */
export default function TicketPreview({
  html,
  onPrint,
  onClose,
  busy
}: {
  html: string
  onPrint: () => void
  onClose: () => void
  busy: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('ticket.previewTitle')}</h2>
        <iframe title="ticket" className="ticket-frame" srcDoc={html} />
        <div className="row">
          <button type="button" className="primary" onClick={onPrint} disabled={busy}>
            {t('ops.print')}
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
