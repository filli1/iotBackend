import { useRef, useEffect, useState } from 'react'
import { useWsStore } from '../lib/wsStore'
import { EventFeedEntryRow } from './EventFeedEntry'

export function EventFeed() {
  const feed = useWsStore(s => s.eventFeed)
  const containerRef = useRef<HTMLDivElement>(null)
  const [atTop, setAtTop] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const prevLengthRef = useRef(0)

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    setAtTop(el.scrollTop <= 10)
    if (el.scrollTop <= 10) setNewCount(0)
  }

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
