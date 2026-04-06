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

export type EventFeedEntry = {
  id: string
  unitId: string
  event: string
  ts: string
  dwellSeconds?: number
  productPickedUp?: boolean
}

export type ActiveAlert = {
  id: string
  unitId: string
  reason: string
  ts: string
  snoozedUntil?: number
}

export type HealthWarning = { condition: string; sensorIndex?: number; message: string; ts: string }

export type WsStore = {
  connected: boolean
  units: Record<string, UnitLiveState>
  activeAlerts: ActiveAlert[]
  eventFeed: EventFeedEntry[]
  healthWarnings: Record<string, HealthWarning[]>
  setConnected: (v: boolean) => void
  handleMessage: (msg: Record<string, unknown>) => void
  dismissAlert: (sessionId: string) => void
  snoozeAlert: (sessionId: string, ms: number) => void
  dismissHealthWarning: (unitId: string, condition: string, sensorIndex?: number) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connected: false,
  units: {},
  activeAlerts: [],
  eventFeed: [],
  healthWarnings: {},

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
      const entry: EventFeedEntry = {
        id: `${msg.sessionId as string}-${msg.event as string}-${msg.ts as string}`,
        unitId,
        event: msg.event as string,
        ts: msg.ts as string,
        dwellSeconds: msg.dwellSeconds as number | undefined,
        productPickedUp: msg.productPickedUp as boolean | undefined,
      }
      set(state => ({
        units: {
          ...state.units,
          [unitId]: {
            ...state.units[unitId],
            unitId,
            lastEvent: { event: msg.event as string, ts: msg.ts as string },
          },
        },
        eventFeed: [entry, ...state.eventFeed].slice(0, 200),
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
    } else if (type === 'health_alert') {
      const warning: HealthWarning = {
        condition: msg.condition as string,
        sensorIndex: msg.sensorIndex as number | undefined,
        message: msg.message as string,
        ts: msg.ts as string,
      }
      set(state => ({
        healthWarnings: {
          ...state.healthWarnings,
          [unitId]: [
            ...(state.healthWarnings[unitId] ?? []).filter(
              w => !(w.condition === warning.condition && w.sensorIndex === warning.sensorIndex)
            ),
            warning,
          ],
        },
      }))
    } else if (type === 'health_alert_cleared') {
      const condition = msg.condition as string
      const sensorIndex = msg.sensorIndex as number | undefined
      set(state => ({
        healthWarnings: {
          ...state.healthWarnings,
          [unitId]: (state.healthWarnings[unitId] ?? []).filter(
            w => !(w.condition === condition && w.sensorIndex === sensorIndex)
          ),
        },
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

  dismissHealthWarning: (unitId, condition, sensorIndex) =>
    set(state => ({
      healthWarnings: {
        ...state.healthWarnings,
        [unitId]: (state.healthWarnings[unitId] ?? []).filter(
          w => !(w.condition === condition && w.sensorIndex === sensorIndex)
        ),
      },
    })),
}))
