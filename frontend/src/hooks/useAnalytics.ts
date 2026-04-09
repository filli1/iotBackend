import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

type Summary = { totalSessions: number; avgDwellSeconds: number; interactionRate: number; avgDwellWithInteraction: number }
type DailyEntry = { date: string; sessions: number; pickups: number }
type HeatmapEntry = { dayOfWeek: number; hour: number; sessions: number }
type DwellEntry = { date: string; avgDwellSeconds: number }

export type AnalyticsData = {
  summary: Summary | null
  daily: DailyEntry[]
  heatmap: HeatmapEntry[]
  dwellTrend: DwellEntry[]
  loading: boolean
}

export function useAnalytics(): AnalyticsData {
  const [params] = useSearchParams()
  const [data, setData] = useState<Omit<AnalyticsData, 'loading'>>({ summary: null, daily: [], heatmap: [], dwellTrend: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = params.toString()
    setLoading(true)
    Promise.all([
      apiFetch<Summary>(`/api/analytics/summary?${q}`),
      apiFetch<{ data: DailyEntry[] }>(`/api/analytics/daily?${q}`),
      apiFetch<{ data: HeatmapEntry[] }>(`/api/analytics/heatmap?${q}`),
      apiFetch<{ data: DwellEntry[] }>(`/api/analytics/dwell-trend?${q}`),
    ]).then(([summary, daily, heatmap, dwell]) => {
      setData({ summary, daily: daily.data, heatmap: heatmap.data, dwellTrend: dwell.data })
    }).catch(console.error).finally(() => setLoading(false))
  }, [params])

  return { ...data, loading }
}
