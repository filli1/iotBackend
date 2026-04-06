import { useWsStore } from '../lib/wsStore'
import type { ActiveAlert } from '../lib/wsStore'

const REASON_LABELS: Record<string, string> = {
  dwell_threshold: 'Customer has been waiting a while',
  pickup: 'Customer picked up the product',
  dwell_and_pickup: 'Customer picked up the product after waiting',
}

const SNOOZE_OPTIONS = [
  { label: '2 min', ms: 2 * 60 * 1000 },
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
]

function SingleAlert({ alert, onDismiss, onSnooze }: {
  alert: ActiveAlert
  onDismiss: () => void
  onSnooze: (ms: number) => void
}) {
  const isSnoozed = alert.snoozedUntil && Date.now() < alert.snoozedUntil
  if (isSnoozed) return null

  const hasPickup = alert.reason === 'pickup' || alert.reason === 'dwell_and_pickup'
  const bg = hasPickup ? 'bg-red-700' : 'bg-amber-600'

  return (
    <div className={`${bg} text-white px-4 py-3 flex items-center justify-between gap-4`}>
      <div>
        <span className="font-semibold">🔔 Salesperson needed — {alert.unitId}</span>
        <span className="text-sm opacity-90 ml-2">{REASON_LABELS[alert.reason] ?? alert.reason}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {SNOOZE_OPTIONS.map(opt => (
          <button
            key={opt.ms}
            onClick={() => onSnooze(opt.ms)}
            className="text-xs bg-black/20 hover:bg-black/30 px-2 py-1 rounded"
          >
            Snooze {opt.label}
          </button>
        ))}
        <button
          onClick={onDismiss}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-semibold"
        >
          Acknowledge ✓
        </button>
      </div>
    </div>
  )
}

export function AlertBanner() {
  const activeAlerts = useWsStore(s => s.activeAlerts)
  const dismissAlert = useWsStore(s => s.dismissAlert)
  const snoozeAlert = useWsStore(s => s.snoozeAlert)

  const visible = activeAlerts.filter(a => !a.snoozedUntil || Date.now() >= a.snoozedUntil)
  if (visible.length === 0) return null

  return (
    <div className="fixed top-0 inset-x-0 z-40 flex flex-col">
      {visible.slice(0, 3).map(alert => (
        <SingleAlert
          key={alert.id}
          alert={alert}
          onDismiss={() => dismissAlert(alert.id)}
          onSnooze={ms => snoozeAlert(alert.id, ms)}
        />
      ))}
      {visible.length > 3 && (
        <div className="bg-gray-800 text-white text-xs text-center py-1">
          +{visible.length - 3} more alerts
        </div>
      )}
    </div>
  )
}
