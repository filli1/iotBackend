import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUnits } from '../hooks/useUnits'
import type { Unit } from '../hooks/useUnits'
import { UnitRegistrationForm } from '../components/UnitRegistrationForm'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'

type EditDraft = Pick<Unit, 'location' | 'productName'>

export function SetupUnitsPage() {
  const { units, loading, createUnit, updateUnit, deleteUnit } = useUnits()
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const startEdit = (unit: Unit) => {
    setEditingId(unit.id)
    setDraft({ location: unit.location, productName: unit.productName })
  }

  const cancelEdit = () => { setEditingId(null); setDraft(null) }

  const saveEdit = async () => {
    if (!editingId || !draft) return
    setSaving(true)
    try {
      await updateUnit(editingId, draft)
      setEditingId(null)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof EditDraft, placeholder: string) => (
    <input
      value={draft?.[key] ?? ''}
      onChange={e => setDraft(d => d ? { ...d, [key]: e.target.value } : d)}
      placeholder={placeholder}
      className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-full"
    />
  )

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl sm:text-2xl font-bold">Registered Units</h1>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
          >
            + Add Unit
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Register New Unit</h2>
            <UnitRegistrationForm
              onSubmit={async data => { await createUnit(data); setShowForm(false) }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : units.length === 0 ? (
          <p className="text-gray-400">No units registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Location</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map(unit => (
                <Fragment key={unit.id}>
                  <tr className="border-b border-gray-800">
                    <td className="py-3 pr-4 font-mono text-gray-300">{unit.id}</td>
                    <td className="py-3 pr-4">{unit.productName}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex items-center gap-1 text-xs ${unit.online ? 'text-green-400' : 'text-gray-500'}`}>
                        <span className={`w-2 h-2 rounded-full ${unit.online ? 'bg-green-400' : 'bg-gray-500'}`} />
                        {unit.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">{unit.location}</td>
                    <td className="py-3 flex gap-3 justify-end">
                      <button
                        onClick={() => editingId === unit.id ? cancelEdit() : startEdit(unit)}
                        className="text-yellow-400 hover:text-yellow-300 text-xs"
                      >
                        {editingId === unit.id ? 'Cancel' : 'Edit'}
                      </button>
                      <Link to={`/setup/units/${unit.id}/configure`} className="text-blue-400 hover:text-blue-300 text-xs">
                        Configure ▸
                      </Link>
                      <button
                        onClick={() => setDeleting({ id: unit.id, name: unit.name })}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {editingId === unit.id && draft && (
                    <tr key={`${unit.id}-edit`} className="bg-gray-800 border-b border-gray-700">
                      <td />
                      <td colSpan={4} className="py-3 pr-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-gray-400 text-xs block mb-1">Product</label>
                            {field('productName', 'Product')}
                          </div>
                          <div>
                            <label className="text-gray-400 text-xs block mb-1">Location</label>
                            {field('location', 'Location')}
                          </div>
                        </div>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="mt-3 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-sm disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {deleting && (
        <DeleteConfirmModal
          unitName={deleting.name}
          onConfirm={async () => { await deleteUnit(deleting.id); setDeleting(null) }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
