import { useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { SensorUnitCard } from '../components/SensorUnitCard'
import { ConnectionBanner } from '../components/ConnectionBanner'
import { AlertBanner } from '../components/AlertBanner'
import { apiFetch } from '../lib/api'
import type { Unit } from '../hooks/useUnits'
import { EventFeed } from '../components/EventFeed'
import { useSubscriptions } from '../hooks/useSubscriptions'

export function DashboardPage() {
  useWebSocket()
  const [registeredUnits, setRegisteredUnits] = useState<Unit[]>([])
  const { subscribedUnitIds, subscribe, unsubscribe } = useSubscriptions()

  useEffect(() => {
    apiFetch<{ units: Unit[] }>('/api/units').then(d => setRegisteredUnits(d.units)).catch(() => {})
  }, [])

  const handleSubscribeToggle = (unitId: string, currentlySubscribed: boolean) => {
    if (currentlySubscribed) {
      unsubscribe(unitId)
    } else {
      subscribe(unitId)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AlertBanner />
      <ConnectionBanner />
      <div className="p-6 flex-1 flex flex-col overflow-hidden">
        <h1 className="text-2xl font-bold mb-4">Live Dashboard</h1>
        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {registeredUnits.length === 0 ? (
              <p className="text-gray-400">No units registered. <a href="/setup/units" className="text-blue-400 hover:underline">Register one →</a></p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {registeredUnits.map(u => (
                  <SensorUnitCard
                    key={u.id}
                    unitId={u.id}
                    unitName={u.name}
                    subscribed={subscribedUnitIds.has(u.id)}
                    onSubscribeToggle={handleSubscribeToggle}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="w-72 flex-shrink-0">
            <EventFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
