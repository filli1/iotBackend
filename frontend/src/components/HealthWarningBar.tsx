import { useWsStore } from '../lib/wsStore'

type Props = { unitId: string }

export function HealthWarningBar({ unitId }: Props) {
  const warnings = useWsStore(s => s.healthWarnings[unitId] ?? [])
  const dismiss = useWsStore(s => s.dismissHealthWarning)

  if (warnings.length === 0) return null

  return (
    <div className="space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-center justify-between bg-yellow-900/50 border border-yellow-600/30 rounded px-2 py-1 text-xs text-yellow-300">
          <span>⚠ {w.message}</span>
          <button
            onClick={() => dismiss(unitId, w.condition, w.sensorIndex)}
            className="ml-2 text-yellow-500 hover:text-yellow-300"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
