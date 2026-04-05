type UnitStatus = {
  lastSeen: Date
  online: boolean
}

type OfflineCallback = (unitId: string) => void

export class UnitRegistry {
  private units = new Map<string, UnitStatus>()
  private offlineCallbacks: OfflineCallback[] = []
  private timer: ReturnType<typeof setInterval>

  constructor(checkIntervalMs = 30_000, offlineAfterMs = 60_000) {
    this.timer = setInterval(() => {
      const now = Date.now()
      for (const [unitId, status] of this.units) {
        if (status.online && now - status.lastSeen.getTime() >= offlineAfterMs) {
          status.online = false
          this.offlineCallbacks.forEach(cb => cb(unitId))
        }
      }
    }, checkIntervalMs)
  }

  register(unitId: string): void {
    if (!this.units.has(unitId)) {
      this.units.set(unitId, { lastSeen: new Date(0), online: false })
    }
  }

  markSeen(unitId: string): void {
    const status = this.units.get(unitId)
    if (status) {
      status.lastSeen = new Date()
      status.online = true
    }
  }

  isKnown(unitId: string): boolean {
    return this.units.has(unitId)
  }

  getStatus(unitId: string): UnitStatus | null {
    return this.units.get(unitId) ?? null
  }

  onOffline(cb: OfflineCallback): void {
    this.offlineCallbacks.push(cb)
  }

  stop(): void {
    clearInterval(this.timer)
  }
}
