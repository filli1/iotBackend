import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export type TofSensorConfig = {
  id: string; index: number; label: string; minDist: number; maxDist: number
}
export type UnitConfig = {
  id: string; minSensorAgreement: number; departureTimeoutSeconds: number
  dwellMinSeconds: number; pirEnabled: boolean; pirCooldownSeconds: number
  imuPickupThresholdG: number; imuExaminationEnabled: boolean; imuDurationThresholdMs: number
}
export type AlertRuleConfig = {
  id: string; dwellThresholdSeconds: number; requirePickup: boolean; enabled: boolean
}

export type FullConfig = { configuration: UnitConfig; sensors: TofSensorConfig[]; alertRule: AlertRuleConfig }

export function useUnitConfig(unitId: string) {
  const [config, setConfig] = useState<FullConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<FullConfig>(`/api/units/${unitId}/config`)
      setConfig(data)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [unitId])

  useEffect(() => { load() }, [load])

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true)
    setSaved(false)
    try {
      await apiFetch(`/api/units/${unitId}/config`, { method: 'PATCH', body: JSON.stringify(patch) })
      await load()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { config, loading, error, saving, saved, save }
}
