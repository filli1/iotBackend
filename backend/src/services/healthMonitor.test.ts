import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealthMonitor } from './healthMonitor'
import type { WsBroadcaster } from '../ws/broadcaster'

const mockBroadcaster = { broadcast: vi.fn() } as unknown as WsBroadcaster

const makeReading = (sensorValues: { id: number; mm: number; status?: string }[]) => ({
  unit_id: 'unit-01',
  ts: Date.now(),
  tof: sensorValues.map(s => ({ id: s.id, distance_mm: s.mm, status: (s.status ?? 'valid') as 'valid' | 'out_of_range' | 'error' })),
  imu: { vibration_intensity: 0.02 },
})

describe('HealthMonitor', () => {
  let monitor: HealthMonitor

  beforeEach(() => {
    vi.clearAllMocks()
    monitor = new HealthMonitor(mockBroadcaster)
    monitor.addUnit('unit-01')
  })

  it('does not alert for varied readings', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 800 + i * 10 }]))
    }
    expect(mockBroadcaster.broadcast).not.toHaveBeenCalled()
  })

  it('broadcasts health_alert when sensor is stuck for 10 readings', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 823 }]))
    }
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'health_alert', condition: 'stuck_sensor', sensorIndex: 1 })
    )
  })

  it('broadcasts health_alert_cleared when stuck sensor starts varying', () => {
    for (let i = 0; i < 10; i++) {
      monitor.process('unit-01', makeReading([{ id: 1, mm: 823 }]))
    }
    vi.clearAllMocks()
    monitor.process('unit-01', makeReading([{ id: 1, mm: 400 }]))
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'health_alert_cleared', condition: 'stuck_sensor', sensorIndex: 1 })
    )
  })
})
