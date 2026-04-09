import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DetectionEngine } from './detectionEngine'
import type { DetectionEvent } from '../types/sensor'

const defaultConfig = {
  minSensorAgreement: 2,
  dwellMinSeconds: 3,
  departureTimeoutSeconds: 5,
  imuPickupThresholdG: 1.5,
  imuExaminationEnabled: true,
  imuDurationThresholdMs: 500,
}

const makeTof = (activeCount: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    distance_mm: i < activeCount ? 500 : 4000,
    status: (i < activeCount ? 'valid' : 'out_of_range') as 'valid' | 'out_of_range' | 'error',
  }))

const makeReading = (unitId: string, activeCount: number) => ({
  unit_id: unitId,
  ts: Date.now(),
  tof: makeTof(activeCount),
  imu: {
    accel: { x: 0.02, y: 0.98, z: 0.01 },
    gyro: { x: 0, y: 0, z: 0 },
    mag: { x: 0, y: 0, z: 0 },
  },
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
      { index: 4, maxDist: 1000, minDist: 50 },
      { index: 5, maxDist: 1000, minDist: 50 },
      { index: 6, maxDist: 1000, minDist: 50 },
    ])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits session_started after dwell threshold is met', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    expect(events).toHaveLength(0) // pending, not started yet

    vi.advanceTimersByTime(3_000)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session_started')
  })

  it('does NOT emit session_started if person leaves before dwell threshold', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(1_000)
    engine.process('unit-01', makeReading('unit-01', 0)) // person leaves
    vi.advanceTimersByTime(5_000)
    expect(events).toHaveLength(0)
  })

  it('emits session_ended with dwellSeconds after departure timeout', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    vi.advanceTimersByTime(10_000) // person present for 10s
    engine.process('unit-01', makeReading('unit-01', 0)) // person leaves
    vi.advanceTimersByTime(5_000) // departure timeout

    const ended = events.find(e => e.type === 'session_ended')
    expect(ended).toBeDefined()
    if (ended?.type === 'session_ended') {
      expect(ended.dwellSeconds).toBeGreaterThanOrEqual(13)
    }
  })

  it('cancels departure and keeps session active if person returns', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    engine.process('unit-01', makeReading('unit-01', 0)) // starts departure timer
    vi.advanceTimersByTime(2_000) // not yet timed out
    engine.process('unit-01', makeReading('unit-01', 3)) // person returns
    vi.advanceTimersByTime(10_000) // wait well past departure timeout

    expect(events.some(e => e.type === 'session_ended')).toBe(false)
  })

  it('emits product_picked_up when imu_pickup event arrives during active session', () => {
    engine.process('unit-01', makeReading('unit-01', 3))
    vi.advanceTimersByTime(3_000) // session_started

    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_pickup',
      value: { magnitude: 2.1 },
    })

    expect(events.some(e => e.type === 'product_picked_up')).toBe(true)
  })

  it('does NOT emit product_picked_up when session is not active', () => {
    engine.processEvent('unit-01', {
      unit_id: 'unit-01',
      ts: Date.now(),
      event: 'imu_pickup',
      value: {},
    })
    expect(events.some(e => e.type === 'product_picked_up')).toBe(false)
  })

  it('ignores readings below minSensorAgreement', () => {
    engine.process('unit-01', makeReading('unit-01', 1)) // only 1 sensor, threshold is 2
    vi.advanceTimersByTime(10_000)
    expect(events).toHaveLength(0)
  })
})
