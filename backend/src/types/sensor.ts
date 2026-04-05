export type TofReading = {
  id: number
  distance_mm: number
  status: 'valid' | 'out_of_range' | 'error'
}

export type PirState = {
  triggered: boolean
  last_trigger_ms: number
}

export type ImuVector = { x: number; y: number; z: number }

export type ImuState = {
  accel: ImuVector
  gyro: ImuVector
  mag: ImuVector
}

export type SensorReading = {
  unit_id: string
  ts: number
  tof: TofReading[]
  pir: PirState
  imu: ImuState
}

export type HardwareEventType = 'pir_trigger' | 'imu_shock' | 'imu_pickup' | 'imu_rotation'

export type HardwareEvent = {
  unit_id: string
  ts: number
  event: HardwareEventType
  value: Record<string, unknown>
}

export type SensorPayload = SensorReading | HardwareEvent

export function isSensorReading(p: SensorPayload): p is SensorReading {
  return 'tof' in p
}

export type DetectionEvent =
  | { type: 'session_started'; unitId: string; ts: Date }
  | { type: 'session_ended'; unitId: string; ts: Date; dwellSeconds: number }
  | { type: 'product_picked_up'; unitId: string; ts: Date }
  | { type: 'product_put_down'; unitId: string; ts: Date }
