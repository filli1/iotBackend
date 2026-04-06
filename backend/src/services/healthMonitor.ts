import type { SensorReading } from '../types/sensor'
import type { WsBroadcaster } from '../ws/broadcaster'

const STUCK_WINDOW = 10
const STUCK_TOLERANCE_MM = 5

type SensorBuffer = { values: number[]; stuckAlerted: boolean }
type UnitHealth = { sensors: Map<number, SensorBuffer> }

export class HealthMonitor {
  private units = new Map<string, UnitHealth>()
  private broadcaster: WsBroadcaster

  constructor(broadcaster: WsBroadcaster) {
    this.broadcaster = broadcaster
  }

  addUnit(unitId: string): void {
    this.units.set(unitId, { sensors: new Map() })
  }

  process(unitId: string, reading: SensorReading): void {
    const unit = this.units.get(unitId)
    if (!unit) return

    for (const tof of reading.tof) {
      if (!unit.sensors.has(tof.id)) {
        unit.sensors.set(tof.id, { values: [], stuckAlerted: false })
      }
      const buf = unit.sensors.get(tof.id)!

      if (tof.status !== 'valid') {
        if (buf.stuckAlerted) {
          buf.stuckAlerted = false
          this.broadcaster.broadcast({ type: 'health_alert_cleared', unitId, condition: 'stuck_sensor', sensorIndex: tof.id, ts: new Date().toISOString() })
        }
        buf.values = []
        continue
      }

      buf.values.push(tof.distance_mm)
      if (buf.values.length > STUCK_WINDOW) buf.values.shift()

      if (buf.values.length === STUCK_WINDOW) {
        const min = Math.min(...buf.values)
        const max = Math.max(...buf.values)
        const isStuck = (max - min) <= STUCK_TOLERANCE_MM

        if (isStuck && !buf.stuckAlerted) {
          buf.stuckAlerted = true
          this.broadcaster.broadcast({
            type: 'health_alert',
            unitId,
            condition: 'stuck_sensor',
            sensorIndex: tof.id,
            message: `Sensor ${tof.id} may be stuck at ~${tof.distance_mm}mm`,
            ts: new Date().toISOString(),
          })
        } else if (!isStuck && buf.stuckAlerted) {
          buf.stuckAlerted = false
          this.broadcaster.broadcast({
            type: 'health_alert_cleared',
            unitId,
            condition: 'stuck_sensor',
            sensorIndex: tof.id,
            ts: new Date().toISOString(),
          })
        }
      }
    }
  }
}
