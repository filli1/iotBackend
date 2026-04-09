import type { Session } from '../hooks/useSessions'

function formatDwell(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

type Props = { sessions: Session[]; sortBy: string; sortDir: string; onSort: (col: string) => void }

export function SessionTable({ sessions, sortBy, sortDir, onSort }: Props) {
  const arrow = (col: string) => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-700">
          {[['unitName','Unit'],['startedAt','Started'],['dwellSeconds','Dwell'],['productInteracted','Interacted']].map(([col, label]) => (
            <th
              key={col}
              onClick={() => onSort(col)}
              className="pb-2 pr-4 cursor-pointer hover:text-white select-none"
            >
              {label}{arrow(col)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sessions.map(s => (
          <tr key={s.id} className="border-b border-gray-800">
            <td className="py-2 pr-4">{s.unitName}</td>
            <td className="py-2 pr-4 text-gray-300 tabular-nums">{new Date(s.startedAt).toLocaleString()}</td>
            <td className="py-2 pr-4 tabular-nums">{formatDwell(s.dwellSeconds)}</td>
            <td className={`py-2 ${s.productInteracted ? 'text-green-400' : 'text-gray-500'}`}>
              {s.productInteracted ? 'Yes' : 'No'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
