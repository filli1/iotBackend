import { useSessions } from '../hooks/useSessions'
import { SessionTable } from '../components/SessionTable'
import { SessionFilters } from '../components/SessionFilters'

export function HistoryPage() {
  const { result, loading, params, setFilter, setPage } = useSessions()

  const sortBy = params.get('sortBy') ?? 'startedAt'
  const sortDir = params.get('sortDir') ?? 'desc'

  const handleSort = (col: string) => {
    if (col === sortBy) {
      setFilter('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setFilter('sortBy', col)
      setFilter('sortDir', 'desc')
    }
  }

  const handleExport = () => {
    const p = new URLSearchParams(params)
    window.open(`/api/sessions/export.csv?${p.toString()}`, '_blank')
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">Session History</h1>
          <button onClick={handleExport} className="text-sm text-blue-400 hover:text-blue-300">
            Export CSV ↓
          </button>
        </div>

        <SessionFilters params={params} onFilter={setFilter} />

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : !result || result.data.length === 0 ? (
          <p className="text-gray-400">No sessions found.</p>
        ) : (
          <>
            <SessionTable sessions={result.data} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
            <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
              <button disabled={result.page <= 1} onClick={() => setPage(result.page - 1)} className="px-3 py-1 rounded bg-gray-700 disabled:opacity-40">← Prev</button>
              <span>Page {result.page} of {result.pageCount} ({result.total} sessions)</span>
              <button disabled={result.page >= result.pageCount} onClick={() => setPage(result.page + 1)} className="px-3 py-1 rounded bg-gray-700 disabled:opacity-40">Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
