type Summary = {
  totalSessions: number
  avgDwellSeconds: number
  pickupRate: number
  avgDwellWithPickup: number
}

function formatDwell(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type Props = { summary: Summary }

export function SummaryCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total Sessions</p>
        <p className="text-2xl font-bold">{summary.totalSessions}</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Avg Dwell</p>
        <p className="text-2xl font-bold">{formatDwell(summary.avgDwellSeconds)}</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Pickup Rate</p>
        <p className="text-2xl font-bold">{(summary.pickupRate * 100).toFixed(1)}%</p>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Avg Dwell (Pickup)</p>
        <p className="text-2xl font-bold">{formatDwell(summary.avgDwellWithPickup)}</p>
      </div>
    </div>
  )
}
