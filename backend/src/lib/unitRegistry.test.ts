import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { UnitRegistry } from './unitRegistry'

describe('UnitRegistry', () => {
  let registry: UnitRegistry

  beforeEach(() => {
    vi.useFakeTimers()
    registry = new UnitRegistry()
  })

  afterEach(() => {
    registry.stop()
    vi.useRealTimers()
  })

  it('registers a unit as known', () => {
    registry.register('unit-01')
    expect(registry.isKnown('unit-01')).toBe(true)
  })

  it('marks a unit online when seen', () => {
    registry.register('unit-01')
    registry.markSeen('unit-01')
    expect(registry.getStatus('unit-01')?.online).toBe(true)
  })

  it('marks a unit offline after 60 seconds without a reading', () => {
    const offlineCb = vi.fn()
    registry.onOffline(offlineCb)
    registry.register('unit-01')
    registry.markSeen('unit-01')

    vi.advanceTimersByTime(61_000)

    expect(registry.getStatus('unit-01')?.online).toBe(false)
    expect(offlineCb).toHaveBeenCalledWith('unit-01')
  })

  it('returns null for unknown unit', () => {
    expect(registry.getStatus('unknown')).toBeNull()
    expect(registry.isKnown('unknown')).toBe(false)
  })
})
