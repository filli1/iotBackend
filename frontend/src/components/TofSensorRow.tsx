type Props = {
  label: string
  distanceMm: number | null
  valid: boolean
  maxDist: number
}

export function TofSensorRow({ label, distanceMm, valid, maxDist }: Props) {
  const pct = valid && distanceMm !== null ? Math.min((distanceMm / maxDist) * 100, 100) : 0

  const barColour =
    !valid || distanceMm === null ? 'bg-gray-600' :
    distanceMm <= maxDist * 0.75 ? 'bg-green-500' :
    distanceMm <= maxDist ? 'bg-orange-400' :
    'bg-gray-600'

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-800">
      <div className="w-32 text-sm font-mono text-gray-300 uppercase tracking-wide">{label}</div>
      <div className="w-24 text-right text-xl font-bold tabular-nums">
        {valid && distanceMm !== null ? `${(distanceMm / 10).toFixed(1)}` : '—'}
        {valid && distanceMm !== null && <span className="text-sm font-normal text-gray-400 ml-1">cm</span>}
      </div>
      <div className="flex-1 bg-gray-700 rounded-full h-3">
        <div
          className={`h-3 rounded-full transition-all ${barColour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
