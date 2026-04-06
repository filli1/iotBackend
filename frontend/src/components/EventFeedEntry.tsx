import type { EventFeedEntry } from '../lib/wsStore'

const EVENT_LABELS: Record<string, string> = {
  session_started: 'Person detected',
  session_ended: 'Session ended',
  product_picked_up: 'Product picked up',
  product_put_down: 'Product put down',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDwell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

type Props = { entry: EventFeedEntry }

export function EventFeedEntryRow({ entry }: Props) {
  const isEnded = entry.event === 'session_ended'
  return (
    <div className={`px-3 py-2 text-sm border-b border-gray-800 ${isEnded ? 'bg-gray-750' : ''}`}>
      <div className="text-gray-400 text-xs">{formatTime(entry.ts)}</div>
      <div className="text-gray-300 text-xs">{entry.unitId}</div>
      <div className="text-white font-medium">
        {EVENT_LABELS[entry.event] ?? entry.event}
        {isEnded && entry.dwellSeconds !== undefined && (
          <span className="text-gray-400 font-normal ml-2">
            ⏱ {formatDwell(entry.dwellSeconds)}
            {entry.productPickedUp !== undefined && (
              <span className="ml-2">📦 {entry.productPickedUp ? 'Yes' : 'No'}</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
