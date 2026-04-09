type Props = {
  params: URLSearchParams
  onFilter: (key: string, value: string | null) => void
}

export function SessionFilters({ params, onFilter }: Props) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <input
        type="date"
        value={params.get('dateFrom') ?? ''}
        onChange={e => onFilter('dateFrom', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="From"
      />
      <input
        type="date"
        value={params.get('dateTo') ?? ''}
        onChange={e => onFilter('dateTo', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
        placeholder="To"
      />
      <input
        type="number"
        min={0}
        value={params.get('minDwellSeconds') ?? ''}
        onChange={e => onFilter('minDwellSeconds', e.target.value || null)}
        placeholder="Min dwell (s)"
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm w-32"
      />
      <select
        value={params.get('productInteracted') ?? ''}
        onChange={e => onFilter('productInteracted', e.target.value || null)}
        className="bg-gray-700 text-white rounded px-2 py-1 text-sm"
      >
        <option value="">Interacted: All</option>
        <option value="true">Interacted: Yes</option>
        <option value="false">Interacted: No</option>
      </select>
    </div>
  )
}
