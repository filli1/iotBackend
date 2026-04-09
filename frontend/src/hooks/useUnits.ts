import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export type Unit = {
  id: string
  name: string
  location: string
  productName: string
  online: boolean
  lastSeen: string | null
  createdAt: string
}

export function useUnits() {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ units: Unit[] }>('/api/units')
      setUnits(data.units)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createUnit = async (body: Omit<Unit, 'online' | 'lastSeen' | 'createdAt'>) => {
    await apiFetch('/api/units', { method: 'POST', body: JSON.stringify(body) })
    await load()
  }

  const updateUnit = async (unitId: string, body: Partial<Pick<Unit, 'location' | 'productName'>>) => {
    await apiFetch(`/api/units/${unitId}`, { method: 'PATCH', body: JSON.stringify(body) })
    await load()
  }

  const deleteUnit = async (unitId: string) => {
    await apiFetch(`/api/units/${unitId}`, { method: 'DELETE' })
    await load()
  }

  return { units, loading, error, createUnit, updateUnit, deleteUnit, reload: load }
}
