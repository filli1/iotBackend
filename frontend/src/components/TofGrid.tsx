import type { TofReading } from '../lib/wsStore'

type SensorConfig = { index: number; label: string; maxDist: number }
type Props = { readings: TofReading[]; configs: SensorConfig[] }

export function TofGrid({ readings, configs }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {configs.map(cfg => {
        const reading = readings.find(r => r.id === cfg.index)
        const active = reading?.status === 'valid' && reading.distance_mm <= cfg.maxDist
        const bg = !reading || reading.status !== 'valid'
          ? 'bg-gray-800 text-gray-600'
          : active
            ? 'bg-green-700 text-white'
            : 'bg-blue-900 text-blue-300'
        return (
          <div key={cfg.index} className={`rounded p-2 text-center ${bg}`}>
            <div className="text-xs truncate">{cfg.label}</div>
            <div className="text-sm font-mono mt-1">
              {reading?.status === 'valid' ? `${reading.distance_mm}mm` : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
