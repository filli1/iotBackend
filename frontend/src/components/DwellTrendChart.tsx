import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type DwellEntry = { date: string; avgDwellSeconds: number }
type Props = { data: DwellEntry[] }

export function DwellTrendChart({ data }: Props) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Average Dwell Time Trend</h2>
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} unit="s" />
            <Tooltip
              contentStyle={{ background: '#1f2937', border: 'none', color: '#fff' }}
              formatter={(v: number) => [`${v}s`, 'Avg Dwell']}
            />
            <Line type="monotone" dataKey="avgDwellSeconds" stroke="#f59e0b" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
