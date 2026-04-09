import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/authStore'

const BASE = 'http://localhost:7000'

type AuthUser = { id: string; email: string; phoneNumber: string | null }

async function authFetch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data as { token: string; user: AuthUser }
}

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`${BASE}/api/auth/setup-status`)
      .then(r => r.json())
      .then((d: { needsSetup: boolean }) => setNeedsSetup(d.needsSetup))
      .catch(() => setNeedsSetup(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const path = needsSetup ? '/api/auth/register' : '/api/auth/login'
      const body = needsSetup ? { email, password, phoneNumber: phone || undefined } : { email, password }
      const { token, user } = await authFetch(path, body)
      setAuth(token, user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (needsSetup === null) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Store Attention</h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          {needsSetup ? 'Create your admin account to get started' : 'Sign in to your account'}
        </p>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-900/30 rounded px-3 py-2">{error}</p>}

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={needsSetup ? 'At least 8 characters' : ''}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {needsSetup && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Phone number <span className="text-gray-500">(optional — for SMS alerts)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+45 12 34 56 78"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium disabled:opacity-50 mt-2"
          >
            {loading ? '…' : needsSetup ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
