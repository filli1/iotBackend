import { useAnalytics } from '../hooks/useAnalytics'
import { SummaryCards } from '../components/SummaryCards'
import { DailyBarChart } from '../components/DailyBarChart'
import { HeatmapGrid } from '../components/HeatmapGrid'
import { DwellTrendChart } from '../components/DwellTrendChart'

export function AnalyticsPage() {
  const { summary, daily, heatmap, dwellTrend, loading } = useAnalytics()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>

        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : (
          <>
            {summary && <SummaryCards summary={summary} />}
            <DailyBarChart data={daily} />
            <DwellTrendChart data={dwellTrend} />
            <HeatmapGrid data={heatmap} />
          </>
        )}
      </div>
    </div>
  )
}
