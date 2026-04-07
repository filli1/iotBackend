import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export function useSubscriptions() {
  const [subscribedUnitIds, setSubscribedUnitIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<{ unitIds: string[] }>('/api/me/subscriptions')
      .then(d => setSubscribedUnitIds(new Set(d.unitIds)))
      .catch((err: unknown) => { console.error('Failed to load subscriptions:', err) })
      .finally(() => setLoading(false))
  }, [])

  const subscribe = useCallback(async (unitId: string) => {
    setSubscribedUnitIds(prev => new Set([...prev, unitId]))
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions`, { method: 'POST' })
    } catch {
      setSubscribedUnitIds(prev => {
        const next = new Set(prev)
        next.delete(unitId)
        return next
      })
    }
  }, [])

  const unsubscribe = useCallback(async (unitId: string) => {
    setSubscribedUnitIds(prev => {
      const next = new Set(prev)
      next.delete(unitId)
      return next
    })
    try {
      await apiFetch(`/api/units/${unitId}/subscriptions`, { method: 'DELETE' })
    } catch {
      setSubscribedUnitIds(prev => new Set([...prev, unitId]))
    }
  }, [])

  return { subscribedUnitIds, loading, subscribe, unsubscribe }
}
