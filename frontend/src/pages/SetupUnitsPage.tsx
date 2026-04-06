import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useUnits } from '../hooks/useUnits'
import { UnitRegistrationForm } from '../components/UnitRegistrationForm'
import { DeleteConfirmModal } from '../components/DeleteConfirmModal'

export function SetupUnitsPage() {
  const { units, loading, createUnit, deleteUnit } = useUnits()
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Registered Units</h1>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Product</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map(unit => (
                <tr key={unit.id} className="border-b border-gray-800">
                  <td className="py-3 pr-4 font-mono text-gray-300">{unit.id}</td>
                  <td className="py-3 pr-4">{unit.name}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex items-center gap-1 text-xs ${unit.online ? 'text-green-400' : 'text-gray-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${unit.online ? 'bg-green-400' : 'bg-gray-500'}`} />
                      {unit.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-300">{unit.productName}</td>
                  <td className="py-3 flex gap-3 justify-end">
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
              ))}
            </tbody>
          </table>
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
