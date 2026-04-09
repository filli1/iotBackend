import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../lib/authStore'
import { apiFetch } from '../lib/api'

export function AccountMenu() {
  const { user, setAuth, clearAuth } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [editPhone, setEditPhone] = useState(false)
  const [phone, setPhone] = useState(user?.phoneNumber ?? '')
  const [saving, setSaving] = useState(false)

  const savePhone = async () => {
    setSaving(true)
    try {
      const updated = await apiFetch<{ id: string; email: string; phoneNumber: string | null }>('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ phoneNumber: phone || null }),
      })
      setAuth(useAuthStore.getState().token!, updated)
      setEditPhone(false)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-gray-300 hover:text-white px-3 py-1 rounded bg-gray-700 hover:bg-gray-600"
      >
        {user.email}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 p-4 space-y-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Account</p>
          <p className="text-sm text-white">{user.email}</p>

          {editPhone ? (
            <div className="space-y-2">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+45 12 34 56 78"
                className="w-full bg-gray-700 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <button onClick={savePhone} disabled={saving} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditPhone(false)} className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">SMS alerts</p>
                <p className="text-sm text-white">{user.phoneNumber ?? <span className="text-gray-500">No number set</span>}</p>
              </div>
              <button onClick={() => { setPhone(user.phoneNumber ?? ''); setEditPhone(true) }} className="text-xs text-blue-400 hover:text-blue-300">
                Edit
              </button>
            </div>
          )}

          <hr className="border-gray-700" />
          <Link
            to="/settings/users"
            onClick={() => setOpen(false)}
            className="block text-sm text-gray-300 hover:text-white"
          >
            Manage users
          </Link>
          <button
            onClick={() => { clearAuth(); setOpen(false) }}
            className="w-full text-left text-sm text-red-400 hover:text-red-300"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
