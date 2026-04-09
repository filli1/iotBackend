import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../lib/authStore'

type User = { id: string; email: string; phoneNumber: string | null; createdAt: string }

export function UsersPage() {
  const currentUser = useAuthStore(s => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ users: User[] }>('/api/users')
      setUsers(data.users)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, password, phoneNumber: phone || undefined }),
      })
      setEmail(''); setPassword(''); setPhone('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId: string) => {
    await apiFetch(`/api/users/${userId}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Users</h1>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            + Add User
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-gray-800 rounded-lg p-6 mb-6 space-y-4">
            <h2 className="text-lg font-semibold">New User</h2>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Password</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Phone number <span className="text-gray-500">(optional)</span>
              </label>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+45 12 34 56 78"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setError(null) }} className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-50">
                {saving ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">Email</th>
                <th className="pb-2 pr-4">Phone</th>
                <th className="pb-2 pr-4">Created</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-800">
                  <td className="py-3 pr-4">
                    {u.email}
                    {u.id === currentUser?.id && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{u.phoneNumber ?? '—'}</td>
                  <td className="py-3 pr-4 text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 text-right">
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
