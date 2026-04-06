type HeatmapEntry = { dayOfWeek: number; hour: number; sessions: number }
type Props = { data: HeatmapEntry[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function HeatmapGrid({ data }: Props) {
  const maxSessions = Math.max(1, ...data.map(d => d.sessions))

  const lookup = new Map<string, number>()
  for (const entry of data) {
    lookup.set(`${entry.dayOfWeek}-${entry.hour}`, entry.sessions)
  }

  function intensity(count: number): string {
    const ratio = count / maxSessions
    if (ratio === 0) return 'bg-gray-700'
    if (ratio < 0.25) return 'bg-blue-900'
    if (ratio < 0.5) return 'bg-blue-700'
    if (ratio < 0.75) return 'bg-blue-500'
    return 'bg-blue-300'
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Activity Heatmap (Hour of Day)</h2>
      {data.length === 0 ? (
        <p className="text-gray-500 text-sm">No data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex gap-1">
            <div className="flex flex-col gap-1 mr-1">
              <div className="w-8 h-5" />
              {DAYS.map(d => (
                <div key={d} className="w-8 h-5 flex items-center justify-end pr-1">
                  <span className="text-gray-400 text-xs">{d}</span>
                </div>
              ))}
            </div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex flex-col gap-1">
                <div className="w-5 h-5 flex items-center justify-center">
                  <span className="text-gray-500 text-xs">{h}</span>
                </div>
                {DAYS.map((_, dow) => {
                  const count = lookup.get(`${dow}-${h}`) ?? 0
                  return (
                    <div
                      key={dow}
                      title={`${DAYS[dow]} ${h}:00 — ${count} sessions`}
                      className={`w-5 h-5 rounded-sm ${intensity(count)}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
