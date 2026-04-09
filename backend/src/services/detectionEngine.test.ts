import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DetectionEngine } from './detectionEngine'
import type { DetectionEvent } from '../types/sensor'

const defaultConfig = {
  minSensorAgreement: 2,
  dwellMinSeconds: 3,
  departureTimeoutSeconds: 5,
  imuVibrationThreshold: 0.08,
  imuEnabled: true,
  imuDurationThresholdMs: 150,
}

const makeTof = (activeCount: number) =>
  Array.from({ length: activeCount }, (_, i) => ({
    id: i + 1,
    distance_mm: 500,
    status: 'valid' as const,
  }))

const makeReading = (unitId: string, activeCount: number) => ({
  unit_id: unitId,
  ts: Date.now(),
  tof: makeTof(activeCount),
  imu: { vibration_intensity: 0.01 },
})

describe('DetectionEngine', () => {
  let events: DetectionEvent[]
  let engine: DetectionEngine

  beforeEach(() => {
    vi.useFakeTimers()
    events = []
    engine = new DetectionEngine(e => events.push(e))
    engine.addUnit('unit-01', defaultConfig, [
      { index: 1, maxDist: 1000, minDist: 50 },
      { index: 2, maxDist: 1000, minDist: 50 },
      { index: 3, maxDist: 1000, minDist: 50 },
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits session_started after dwell threshold is met', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    expect(events).toHaveLength(0)

    vi.advanceTimersByTime(3_000)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_started')
  })

  it('does NOT emit session_started if person leaves before dwell threshold', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(1_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(0)
  })

  it('emits session_ended with dwellSeconds after departure timeout', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)
    vi.advanceTimersByTime(10_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(5_000)

    const ended = events.find(e => e.type === 'session_ended')
    expect(ended).toBeDefined()
    if (ended?.type === 'session_ended') {
      expect(ended.dwellSeconds).toBeGreaterThanOrEqual(13)
    }
  })

  it('cancels departure and keeps session active if person returns', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)
    engine.process('unit-01', makeReading('unit-01', 0))
    vi.advanceTimersByTime(2_000)
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(10_000)
    expect(events.some(e => e.type === 'session_ended')).toBe(false)
  })

  it('emits product_interacted when imu_vibration fires during active session', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })

    expect(events.some(e => e.type === 'product_interacted')).toBe(true)
  })

  it('does NOT emit product_interacted when session is not active', () => {
    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })
    expect(events.some(e => e.type === 'product_interacted')).toBe(false)
  })

  it('does NOT emit product_interacted when imuEnabled is false', () => {
    engine.updateConfig('unit-01', { ...defaultConfig, imuEnabled: false }, [
      { index: 1, maxDist: 1000, minDist: 50 },
    ])
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000)

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_vibration',
      value: { intensity: 0.42 },
    })
    expect(events.some(e => e.type === 'product_interacted')).toBe(false)
  })

  it('ignores readings below minSensorAgreement', () => {
    engine.process('unit-01', makeReading('unit-01', 1))
    vi.advanceTimersByTime(10_000)
    expect(events).toHaveLength(0)
  })
})
