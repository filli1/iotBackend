import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import { useWsStore } from '../lib/wsStore'

type UnitDaySummary = {
  totalSessions: number
  avgDwellSeconds: number
  interactionRate: number
  avgDwellWithInteraction: number
}

export function useUnitDayStats(unitId: string) {
  const [stats, setStats] = useState<UnitDaySummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Bump a revision counter whenever a session_ended event arrives for this unit
  const [revision, setRevision] = useState(0)
  const eventFeed = useWsStore(s => s.eventFeed)

  useEffect(() => {
    const latest = eventFeed[0]
    if (latest && latest.unitId === unitId && latest.event === 'session_ended') {
      setRevision(r => r + 1)
    }
  }, [eventFeed, unitId])

  useEffect(() => {
    const today = new Date()
    const from = today.toISOString().slice(0, 10)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const to = tomorrow.toISOString().slice(0, 10)

    setLoading(true)
    apiFetch<UnitDaySummary>(`/api/analytics/summary?unitId=${encodeURIComponent(unitId)}&from=${from}&to=${to}`)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [unitId, revision])

  return { stats, loading }
}
