type Props = {
  unitName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({ unitName, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-white mb-2">Delete unit?</h2>
        <p className="text-gray-300 mb-6">
          This will permanently delete <strong>{unitName}</strong> and all its session history.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-500">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
