import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'

export type Session = {
  id: string; unitId: string; unitName: string; startedAt: string
  endedAt: string | null; dwellSeconds: number; productInteracted: boolean
}

type SessionsResponse = {
  data: Session[]; total: number; page: number; pageSize: number; pageCount: number
}

export function useSessions() {
  const [params, setParams] = useSearchParams()
  const [result, setResult] = useState<SessionsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch<SessionsResponse>(`/api/sessions?${params.toString()}`)
      setResult(res)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { fetch() }, [fetch])

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    next.set('page', '1')
    setParams(next)
  }

  const setPage = (page: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(page))
    setParams(next)
  }

  return { result, loading, params, setFilter, setPage }
}
