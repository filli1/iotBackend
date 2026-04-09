import { useState } from 'react'
import type { Unit } from '../hooks/useUnits'

type FormData = Omit<Unit, 'name' | 'online' | 'lastSeen' | 'createdAt'>

type Props = {
  onSubmit: (data: FormData) => Promise<void>
  onCancel: () => void
}

export function UnitRegistrationForm({ onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FormData>({ id: '', location: '', productName: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {(
        [
          { field: 'id', label: 'Unit ID', placeholder: 'unit-01' },
          { field: 'location', label: 'Location', placeholder: 'Aisle 3, shelf 2' },
          { field: 'productName', label: 'Product', placeholder: 'Widget X' },
        ] as { field: keyof FormData; label: string; placeholder: string }[]
      ).map(({ field, label, placeholder }) => (
        <div key={field}>
          <label className="block text-sm text-gray-300 mb-1">{label}</label>
          <input
            required
            value={form[field]}
            onChange={set(field)}
            placeholder={placeholder}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Register Unit'}
        </button>
      </div>
    </form>
  )
}
