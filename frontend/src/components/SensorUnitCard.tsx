import { Link } from 'react-router-dom'
import { useWsStore } from '../lib/wsStore'
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

const DEFAULT_CONFIGS = Array.from({ length: 6 }, (_, i) => ({
  index: i + 1,
  label: ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide'][i],
  maxDist: 1000,
}))

type Props = {
  unitId: string
  unitName: string
  subscribed: boolean
  onSubscribeToggle: (unitId: string, subscribed: boolean) => void
}

export function SensorUnitCard({ unitId, unitName, subscribed, onSubscribeToggle }: Props) {
  const unit = useWsStore(s => s.units[unitId])

  const presenceState = unit?.presenceState ?? 'idle'
  const online = unit?.status === 'online'

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold">{unitName}</span>
          <span className="text-gray-400 text-xs ml-2">{unitId}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSubscribeToggle(unitId, subscribed)}
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

      <HealthWarningBar unitId={unitId} />

      <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${PRESENCE_COLOURS[presenceState]}`}>
        {PRESENCE_LABELS[presenceState]}
      </span>

      <TofGrid readings={unit?.tof ?? []} configs={DEFAULT_CONFIGS} />

      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <ImuBadge lastEvent={unit?.lastEvent?.event ?? null} />
        </div>
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
