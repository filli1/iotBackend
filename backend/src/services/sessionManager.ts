import type { PrismaClient } from '@prisma/client'
import type { WsBroadcaster } from '../ws/broadcaster'
import type { DetectionEvent } from '../types/sensor'
import { sendWhatsApp } from './twilioNotifier'

type ActiveSession = {
  sessionId: string
  unitId: string
  startedAt: Date
  productPickedUp: boolean
  alertFired: boolean
  dwellCheckTimer: ReturnType<typeof setInterval>
}

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>()
  private prisma: PrismaClient
  private broadcaster: WsBroadcaster

  constructor(prisma: PrismaClient, broadcaster: WsBroadcaster) {
    this.prisma = prisma
    this.broadcaster = broadcaster
  }

  async handleDetectionEvent(event: DetectionEvent): Promise<void> {
    switch (event.type) {
      case 'session_started':
        await this.onSessionStarted(event.unitId, event.ts)
        break
      case 'session_ended':
        await this.onSessionEnded(event.unitId, event.ts, event.dwellSeconds)
        break
      case 'product_picked_up':
        await this.onProductPickedUp(event.unitId, event.ts)
        break
      case 'product_put_down':
        await this.onProductPutDown(event.unitId, event.ts)
        break
    }
  }

  private async onSessionStarted(unitId: string, ts: Date): Promise<void> {
    const session = await this.prisma.presenceSession.create({
      data: { unitId, startedAt: ts, status: 'active' },
    })

    const activeSession: ActiveSession = {
      sessionId: session.id,
      unitId,
      startedAt: ts,
      productPickedUp: false,
      alertFired: false,
      dwellCheckTimer: setInterval(async () => {
        const active = this.activeSessions.get(unitId)
        if (!active || active.alertFired) return
        const dwellSeconds = Math.round((Date.now() - active.startedAt.getTime()) / 1000)
        await this.checkAlertRule(unitId, active, dwellSeconds)
      }, 5_000),
    }

    this.activeSessions.set(unitId, activeSession)

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'session_started',
      unitId,
      sessionId: session.id,
      ts: ts.toISOString(),
    })
  }

  private async onSessionEnded(unitId: string, ts: Date, dwellSeconds: number): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    clearInterval(active.dwellCheckTimer)

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { endedAt: ts, dwellSeconds, status: 'completed' },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'session_ended',
      unitId,
      sessionId: active.sessionId,
      dwellSeconds,
      productPickedUp: active.productPickedUp,
      ts: ts.toISOString(),
    })

    await this.checkAlertRule(unitId, active, dwellSeconds)

    this.activeSessions.delete(unitId)
  }

  private async onProductPickedUp(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    active.productPickedUp = true

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { productPickedUp: true },
    })

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_picked_up', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_picked_up',
      unitId,
      sessionId: active.sessionId,
      ts: ts.toISOString(),
    })
  }

  private async onProductPutDown(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_put_down', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_put_down',
      unitId,
      sessionId: active.sessionId,
      ts: ts.toISOString(),
    })
  }

  private async checkAlertRule(unitId: string, session: ActiveSession, dwellSeconds: number): Promise<void> {
    if (session.alertFired) return

    const rule = await this.prisma.alertRule.findUnique({ where: { unitId } })
    if (!rule || !rule.enabled) return

    const dwellMet = dwellSeconds >= rule.dwellThresholdSeconds
    const pickupMet = !rule.requirePickup || session.productPickedUp

    if (dwellMet && pickupMet) {
      session.alertFired = true
      const reason = rule.requirePickup && session.productPickedUp
        ? 'dwell_and_pickup'
        : session.productPickedUp
          ? 'pickup'
          : 'dwell_threshold'

      this.broadcaster.broadcast({
        type: 'alert_fired',
        unitId,
        sessionId: session.sessionId,
        reason,
        ts: new Date().toISOString(),
      })

      // Fire-and-forget WhatsApp notifications
      const [unit, subscriptions] = await Promise.all([
        this.prisma.sensorUnit.findUnique({ where: { id: unitId } }),
        this.prisma.unitSubscription.findMany({
          where: { unitId },
          include: { user: { select: { phoneNumber: true } } },
        }),
      ])

      const phones = subscriptions
        .map((s: { user: { phoneNumber: string | null } }) => s.user.phoneNumber)
        .filter((p: string | null): p is string => p !== null)

      if (unit && phones.length > 0) {
        const body = `Alert: Customer at ${unit.name} — ${dwellSeconds}s dwell${session.productPickedUp ? ', product picked up' : ''}`
        Promise.all(phones.map((phone: string) => sendWhatsApp(phone, body))).catch(err => {
          console.error('WhatsApp notification failed:', err)
        })
      }
    }
  }
}
