import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { useWsStore } from '../lib/wsStore'
import { TofSensorRow } from '../components/TofSensorRow'
import { apiFetch } from '../lib/api'

type SensorConfig = { index: number; label: string; minDist: number; maxDist: number }

export function CalibrationPage() {
  useWebSocket()
  const { unitId } = useParams<{ unitId: string }>()
  const unitState = useWsStore(s => s.units[unitId!])
  const [sensors, setSensors] = useState<SensorConfig[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    apiFetch<{ sensors: SensorConfig[] }>(`/api/units/${unitId}/sensors`)
      .then(d => setSensors(d.sensors))
      .catch(() => setNotFound(true))
  }, [unitId])

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6">
        <p className="text-red-400">Unit "{unitId}" not found.</p>
        <Link to="/setup/units" className="text-blue-400 text-sm hover:underline">← Back to Units</Link>
      </div>
    )
  }

  const online = unitState?.status === 'online'

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">Calibration</h1>
          <p className="text-gray-400 text-sm">{unitId}</p>
        </div>
        <span className={`flex items-center gap-1 text-sm ${online ? 'text-green-400' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div>
        {sensors.length === 0 ? (
          <p className="text-gray-400 text-sm">Loading sensors…</p>
        ) : (
          sensors.map(cfg => {
            const reading = unitState?.tof?.find(r => r.id === cfg.index)
            return (
              <TofSensorRow
                key={cfg.index}
                label={cfg.label}
                distanceMm={reading?.distance_mm ?? null}
                valid={reading?.status === 'valid'}
                maxDist={cfg.maxDist}
              />
            )
          })
        )}
      </div>

      <div className="mt-6 space-y-2 text-sm text-gray-400 border-t border-gray-800 pt-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" /> Within range
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-orange-400" /> Near threshold
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-600" /> Out of range
        </div>
      </div>

      <Link to="/dashboard" className="mt-6 inline-block text-blue-400 text-sm hover:text-blue-300">
        ← Back to Dashboard
      </Link>
    </div>
  )
}
