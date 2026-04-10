export type TofReading = {
  id: number
  distance_mm: number
  status: 'valid' | 'out_of_range' | 'error'
}

export type ImuReading = {
  vibration_intensity?: number
  [key: string]: unknown
}

export type SensorReading = {
  unit_id: string
  ts: number
  tof: TofReading[]
  imu?: ImuReading
}

export type HardwareEventType = 'imu_shock' | 'imu_vibration'

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
  | { type: 'product_interacted'; unitId: string; ts: Date }
