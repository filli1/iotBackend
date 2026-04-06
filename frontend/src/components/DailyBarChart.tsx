import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type DailyEntry = { date: string; sessions: number; pickups: number }
type Props = { data: DailyEntry[] }

export function DailyBarChart({ data }: Props) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Daily Sessions &amp; Pickups</h2>
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1f2937', border: 'none', color: '#fff' }} />
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            <Bar dataKey="sessions" fill="#3b82f6" name="Sessions" />
            <Bar dataKey="pickups" fill="#10b981" name="Pickups" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
