import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWsStore } from '../lib/wsStore'
import { useUnitDayStats } from '../hooks/useUnitDayStats'
import { TofGrid } from './TofGrid'
import { ImuBadge } from './ImuBadge'
import { HealthWarningBar } from './HealthWarningBar'

const PRESENCE_LABELS: Record<string, string> = {
  idle: 'Idle', pending: 'Detecting…', active: 'Person Present', departing: 'Leaving…',
}
const PRESENCE_COLOURS: Record<string, string> = {
  idle: 'bg-gray-700 text-gray-400', pending: 'bg-yellow-600 text-white',
  active: 'bg-green-600 text-white', departing: 'bg-orange-500 text-white',
}

type TofSensorConfig = { index: number; label: string; maxDist: number }

type Props = {
  unitId: string
  unitName: string
  tofSensors: TofSensorConfig[]
  subscribed: boolean
  onSubscribeToggle: (unitId: string, subscribed: boolean) => void
}

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

export function SensorUnitCard({ unitId, unitName, tofSensors, subscribed, onSubscribeToggle }: Props) {
  const unit = useWsStore(s => s.units[unitId])
  const { stats, loading: statsLoading } = useUnitDayStats(unitId)
  const [showOptInHint, setShowOptInHint] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)

  const handleBellClick = () => {
    if (!subscribed) {
      setShowOptInHint(true)
      setTimeout(() => setShowOptInHint(false), 8000)
    }
    onSubscribeToggle(unitId, subscribed)
  }

  const presenceState = unit?.presenceState ?? 'idle'
  const online = unit?.status === 'online'

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold">{unitName}</span>
          <span className="text-gray-400 text-xs ml-2">{unitId}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBellClick}
            title={subscribed ? 'Unsubscribe from alerts' : 'Subscribe to alerts'}
            className="text-lg leading-none"
          >
            {subscribed ? '🔔' : '🔕'}
          </button>
          <span className={`flex items-center gap-1 text-xs ${online ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-500'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {showOptInHint && (
        <div className="bg-yellow-900/40 border border-yellow-700/60 rounded p-2 text-xs text-yellow-200">
          SMS alerts are sent to the phone number on your account when this unit's alert rule fires.
        </div>
      )}

      <HealthWarningBar unitId={unitId} />

      {/* Presence state + status row */}
      <div className="flex items-center gap-2">
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLOURS[presenceState]}`}>
          {PRESENCE_LABELS[presenceState]}
        </span>
      </div>

      {/* Business metrics */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {statsLoading ? '…' : stats?.totalSessions ?? 0}
          </div>
          <div className="text-xs text-gray-400 mt-1">Visitors today</div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {statsLoading ? '…' : stats ? formatDwell(stats.avgDwellSeconds) : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Avg. dwell</div>
        </div>
        <div className="bg-gray-900 rounded p-3 text-center">
          <div className="text-2xl font-bold text-white">
            {statsLoading ? '…' : stats ? `${Math.round(stats.interactionRate * 100)}%` : '—'}
          </div>
          <div className="text-xs text-gray-400 mt-1">Interaction rate</div>
        </div>
      </div>

      {/* Technical details toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowTechnical(v => !v)}
          className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
        >
          <span className={`transition-transform ${showTechnical ? 'rotate-90' : ''}`}>▸</span>
          Technical details
        </button>
        {showTechnical && (
          <div className="mt-2 space-y-2">
            <TofGrid readings={unit?.tof ?? []} configs={tofSensors} />
            <ImuBadge lastEvent={unit?.lastEvent?.event ?? null} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end">
        <Link
          to={`/setup/units/${unitId}/configure`}
          className="text-blue-400 hover:text-blue-300 text-xs"
        >
          Configure ▸
        </Link>
      </div>
    </div>
  )
}
