const BASE = ''

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const stored = localStorage.getItem('auth')
  const token = stored ? (JSON.parse(stored) as { token: string }).token : null

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  })

  if (res.status === 401) {
    localStorage.removeItem('auth')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
