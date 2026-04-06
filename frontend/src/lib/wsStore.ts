import { create } from 'zustand'

export type TofReading = { id: number; distance_mm: number; status: 'valid' | 'out_of_range' | 'error' }
export type PirState = { triggered: boolean; last_trigger_ms: number }
export type ImuState = { accel: { x: number; y: number; z: number }; gyro: { x: number; y: number; z: number }; mag: { x: number; y: number; z: number } }

export type PresenceState = 'idle' | 'pending' | 'active' | 'departing'

export type UnitLiveState = {
  unitId: string
  status: 'online' | 'offline'
  lastSeen: string | null
  presenceState: PresenceState
  tof: TofReading[]
  pir: PirState | null
  imu: ImuState | null
  lastEvent: { event: string; ts: string } | null
}

export type ActiveAlert = {
  id: string
  unitId: string
  reason: string
  ts: string
  snoozedUntil?: number
}

export type WsStore = {
  connected: boolean
  units: Record<string, UnitLiveState>
  activeAlerts: ActiveAlert[]
  setConnected: (v: boolean) => void
  handleMessage: (msg: Record<string, unknown>) => void
  dismissAlert: (sessionId: string) => void
  snoozeAlert: (sessionId: string, ms: number) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  units: {},
  activeAlerts: [],

  setConnected: (connected) => set({ connected }),

  handleMessage: (msg) => {
    const type = msg.type as string
    const unitId = msg.unitId as string

    if (type === 'sensor_reading') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            status: 'online',
            lastSeen: msg.ts as string,
            presenceState: (msg.presenceState as PresenceState) ?? state.units[unitId]?.presenceState ?? 'idle',
            tof: msg.tof as TofReading[],
            pir: msg.pir as PirState,
            imu: msg.imu as ImuState,
            lastEvent: state.units[unitId]?.lastEvent ?? null,
          },
        },
      }))
    } else if (type === 'session_event') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            lastEvent: { event: msg.event as string, ts: msg.ts as string },
          },
        },
      }))
    } else if (type === 'unit_status') {
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            status: msg.status as 'online' | 'offline',
            lastSeen: msg.lastSeen as string,
          },
        },
      }))
    } else if (type === 'alert_fired') {
      set(state => ({
        activeAlerts: [
          ...state.activeAlerts,
          { id: msg.sessionId as string, unitId, reason: msg.reason as string, ts: msg.ts as string },
        ],
      }))
    }
  },

  dismissAlert: (sessionId) =>
    set(state => ({ activeAlerts: state.activeAlerts.filter(a => a.id !== sessionId) })),

  snoozeAlert: (sessionId, ms) =>
    set(state => ({
      activeAlerts: state.activeAlerts.map(a =>
        a.id === sessionId ? { ...a, snoozedUntil: Date.now() + ms } : a
      ),
    })),
}))
