# DASH-03: Event Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scrollable real-time event log panel on the dashboard showing timestamped session events as they arrive over WebSocket.

**Architecture:** The Zustand store gains an `eventFeed` slice (max 200 entries, newest first). `EventFeed` and `EventFeedEntry` components render the list in the right panel of the dashboard. A "New events ↓" badge appears when the user has scrolled up and new events arrive.

**Tech Stack:** React, Zustand, Tailwind, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/wsStore.ts` | Modify | Add `eventFeed` slice |
| `frontend/src/components/EventFeedEntry.tsx` | Create | Single event row |
| `frontend/src/components/EventFeed.tsx` | Create | Scrollable container with new-events badge |
| `frontend/src/pages/DashboardPage.tsx` | Modify | Add EventFeed panel alongside unit cards |

---

## Task 1: Extend Zustand Store

- [ ] **Step 1: Add `eventFeed` slice to `frontend/src/lib/wsStore.ts`**

Add this type before `WsStore`:

```typescript
export type EventFeedEntry = {
  id: string
  unitId: string
  event: string
  ts: string
  dwellSeconds?: number
  productPickedUp?: boolean
}
```

Add to `WsStore` type:
```typescript
eventFeed: EventFeedEntry[]
```

Add to the `create` call (in the initial state object):
```typescript
eventFeed: [],
```

Inside `handleMessage`, after the existing `session_event` block, replace it with:

```typescript
} else if (type === 'session_event') {
  const entry: EventFeedEntry = {
    id: `${msg.sessionId as string}-${msg.event as string}-${msg.ts as string}`,
    unitId,
    event: msg.event as string,
    ts: msg.ts as string,
    dwellSeconds: msg.dwellSeconds as number | undefined,
    productPickedUp: msg.productPickedUp as boolean | undefined,
  }
  set(state => ({
    units: {
      ...state.units,
      [unitId]: {
        ...state.units[unitId],
        unitId,
        lastEvent: { event: msg.event as string, ts: msg.ts as string },
      },
    },
    eventFeed: [entry, ...state.eventFeed].slice(0, 200),
  }))
}
```

---

## Task 2: EventFeedEntry Component

- [ ] **Step 1: Create `frontend/src/components/EventFeedEntry.tsx`**

```tsx
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
```

---

## Task 3: EventFeed Component

- [ ] **Step 1: Create `frontend/src/components/EventFeed.tsx`**

```tsx
import { useRef, useEffect, useState } from 'react'
import { useWsStore } from '../lib/wsStore'
import { EventFeedEntryRow } from './EventFeedEntry'

export function EventFeed() {
  const feed = useWsStore(s => s.eventFeed)
  const containerRef = useRef<HTMLDivElement>(null)
  const [atTop, setAtTop] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const prevLengthRef = useRef(0)

  // Detect scroll position
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    setAtTop(el.scrollTop <= 10)
    if (el.scrollTop <= 10) setNewCount(0)
  }

  // Track new events while user is scrolled down
  useEffect(() => {
    if (feed.length > prevLengthRef.current) {
      if (!atTop) {
        setNewCount(c => c + (feed.length - prevLengthRef.current))
      }
    }
    prevLengthRef.current = feed.length
  }, [feed.length, atTop])

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    setNewCount(0)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden relative">
      <div className="px-3 py-2 border-b border-gray-700 text-sm font-semibold text-gray-300">
        Live Events
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {feed.length === 0 ? (
          <p className="text-gray-500 text-xs p-3">No events yet.</p>
        ) : (
          feed.map(entry => <EventFeedEntryRow key={entry.id} entry={entry} />)
        )}
      </div>

      {newCount > 0 && (
        <button
          onClick={scrollToTop}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full shadow"
        >
          {newCount} new event{newCount > 1 ? 's' : ''} ↑
        </button>
      )}
    </div>
  )
}
```

---

## Task 4: Add Feed to Dashboard

- [ ] **Step 1: Update `frontend/src/pages/DashboardPage.tsx`**

Import and add `EventFeed` panel:

```tsx
import { EventFeed } from '../components/EventFeed'
```

Replace the return JSX with a two-column layout:

```tsx
return (
  <div className="min-h-screen bg-gray-950 text-white">
    <ConnectionBanner />
    <div className="p-6 h-screen flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Live Dashboard</h1>
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {registeredUnits.length === 0 ? (
            <p className="text-gray-400">No units registered. <a href="/setup/units" className="text-blue-400 hover:underline">Register one →</a></p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {registeredUnits.map(u => (
                <SensorUnitCard key={u.id} unitId={u.id} unitName={u.name} />
              ))}
            </div>
          )}
        </div>
        <div className="w-72 flex-shrink-0">
          <EventFeed />
        </div>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck -w frontend
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/
git commit -m "feat: add live event feed panel to dashboard"
```
