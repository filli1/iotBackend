import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { SensorUnitCard } from '../components/SensorUnitCard'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { apiFetch } from '../lib/api'
import type { Unit } from '../hooks/useUnits'

export function DashboardPage() {
  useWebSocket()
  const [registeredUnits, setRegisteredUnits] = useState<Unit[]>([])

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/api/units').then(d => setRegisteredUnits(d.units)).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <ConnectionBanner />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Live Dashboard</h1>
        {registeredUnits.length === 0 ? (
          <p className="text-gray-400">No units registered. <a href="/setup/units" className="text-blue-400 hover:underline">Register one →</a></p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {registeredUnits.map(u => (
              <SensorUnitCard key={u.id} unitId={u.id} unitName={u.name} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
