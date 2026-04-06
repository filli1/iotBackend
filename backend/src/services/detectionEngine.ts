import type { SensorReading, HardwareEvent, DetectionEvent } from '../types/sensor'

type TofConfig = { index: number; minDist: number; maxDist: number }

type UnitConfig = {
  minSensorAgreement: number
  dwellMinSeconds: number
  departureTimeoutSeconds: number
  imuPickupThresholdG: number
  imuExaminationEnabled: boolean
  imuDurationThresholdMs: number
  pirEnabled: boolean
  pirCooldownSeconds: number
}

type SessionState = 'idle' | 'pending' | 'active' | 'departing'

type UnitState = {
  config: UnitConfig
  tofConfig: TofConfig[]
  state: SessionState
  sessionStartedAt: Date | null
  dwellTimer: ReturnType<typeof setTimeout> | null
  departureTimer: ReturnType<typeof setTimeout> | null
}

type EventHandler = (event: DetectionEvent) => void

export class DetectionEngine {
  private units = new Map<string, UnitState>()
  private onEvent: EventHandler

  constructor(onEvent: EventHandler) {
    this.onEvent = onEvent
  }

  addUnit(unitId: string, config: UnitConfig, tofConfig: TofConfig[]): void {
    this.units.set(unitId, {
      config,
      tofConfig,
      state: 'idle',
      sessionStartedAt: null,
      dwellTimer: null,
      departureTimer: null,
    })
  }

  updateConfig(unitId: string, config: UnitConfig, tofConfig: TofConfig[]): void {
    const unit = this.units.get(unitId)
    if (unit) {
      unit.config = config
      unit.tofConfig = tofConfig
    }
  }

  process(unitId: string, reading: SensorReading): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    const activeSensors = reading.tof.filter(t => {
      const cfg = unit.tofConfig.find(c => c.index === t.id)
      if (!cfg) return false
      return t.status === 'valid' && t.distance_mm >= cfg.minDist && t.distance_mm <= cfg.maxDist
    }).length

    const detected = activeSensors >= unit.config.minSensorAgreement

    if (unit.state === 'idle' && detected) {
      unit.state = 'pending'
      unit.dwellTimer = setTimeout(() => {
        unit.state = 'active'
        unit.sessionStartedAt = new Date()
        this.onEvent({ type: 'session_started', unitId, ts: new Date() })
      }, unit.config.dwellMinSeconds * 1000)
    } else if (unit.state === 'pending' && !detected) {
      clearTimeout(unit.dwellTimer!)
      unit.dwellTimer = null
      unit.state = 'idle'
    } else if (unit.state === 'active' && !detected) {
      unit.state = 'departing'
      unit.departureTimer = setTimeout(() => {
        const dwellSeconds = unit.sessionStartedAt
          ? Math.round((Date.now() - unit.sessionStartedAt.getTime()) / 1000)
          : 0
        unit.state = 'idle'
        unit.sessionStartedAt = null
        this.onEvent({ type: 'session_ended', unitId, ts: new Date(), dwellSeconds })
      }, unit.config.departureTimeoutSeconds * 1000)
    } else if (unit.state === 'departing' && detected) {
      clearTimeout(unit.departureTimer!)
      unit.departureTimer = null
      unit.state = 'active'
    }
  }

  processEvent(unitId: string, event: HardwareEvent): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    if (event.event === 'imu_pickup' && unit.state === 'active') {
      this.onEvent({ type: 'product_picked_up', unitId, ts: new Date() })
    }
  }

  destroy(): void {
    for (const unit of this.units.values()) {
      if (unit.dwellTimer) clearTimeout(unit.dwellTimer)
      if (unit.departureTimer) clearTimeout(unit.departureTimer)
    }
    this.units.clear()
  }
}
