import type { PrismaClient } from '@prisma/client'
import type { WsBroadcaster } from '../ws/broadcaster'
import type { DetectionEvent } from '../types/sensor'
import { sendSms } from './twilioNotifier'

type ActiveSession = {
  sessionId: string
  unitId: string
  startedAt: Date
  productInteracted: boolean
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
      case 'product_interacted':
        await this.onProductInteracted(event.unitId, event.ts)
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
      productInteracted: false,
      alertFired: false,
      dwellCheckTimer: setInterval(() => {}, 0), // placeholder, replaced immediately below
    }

    this.activeSessions.set(unitId, activeSession)
    clearInterval(activeSession.dwellCheckTimer) // clear placeholder

    activeSession.dwellCheckTimer = setInterval(async () => {
      const active = this.activeSessions.get(unitId)
      if (!active || active.alertFired) return
      const dwellSeconds = Math.round((Date.now() - active.startedAt.getTime()) / 1000)
      await this.checkAlertRule(unitId, active, dwellSeconds)
    }, 5_000)

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
      productInteracted: active.productInteracted,
      ts: ts.toISOString(),
    })

    await this.checkAlertRule(unitId, active, dwellSeconds)

    this.activeSessions.delete(unitId)
  }

  private async onProductInteracted(unitId: string, ts: Date): Promise<void> {
    const active = this.activeSessions.get(unitId)
    if (!active) return

    active.productInteracted = true

    await this.prisma.presenceSession.update({
      where: { id: active.sessionId },
      data: { productInteracted: true },
    })

    await this.prisma.sessionEvent.create({
      data: { sessionId: active.sessionId, type: 'product_interacted', ts },
    })

    this.broadcaster.broadcast({
      type: 'session_event',
      event: 'product_interacted',
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
    const interactionMet = !rule.requireInteraction || session.productInteracted

    if (dwellMet && interactionMet) {
      session.alertFired = true
      const reason = rule.requireInteraction && session.productInteracted
        ? 'dwell_and_interaction'
        : session.productInteracted
          ? 'dwell_with_interaction'
          : 'dwell_threshold'

      this.broadcaster.broadcast({
        type: 'alert_fired',
        unitId,
        sessionId: session.sessionId,
        reason,
        ts: new Date().toISOString(),
      })

      const [unit, subscriptions] = await Promise.all([
        this.prisma.sensorUnit.findUnique({ where: { id: unitId } }),
        this.prisma.unitSubscription.findMany({
          where: { unitId },
          include: { user: { select: { phoneNumber: true } } },
        }),
      ])

      console.log(`[Alert SMS] unitId=${unitId}, unit found: ${!!unit}, subscriptions: ${subscriptions.length}`)

      const phones = subscriptions
        .map(s => s.user.phoneNumber)
        .filter((p): p is string => p !== null)

      console.log(`[Alert SMS] phone numbers with values: ${phones.length}`, phones)

      if (unit && phones.length > 0) {
        const body = `Alert: Customer at ${unit.name} — ${dwellSeconds}s dwell${session.productInteracted ? ', product interacted with' : ''}`
        phones.forEach(phone => {
          console.log(`[Alert SMS] Sending to ${phone}: ${body}`)
          sendSms(phone, body)
            .then(() => console.log(`[Alert SMS] Sent successfully to ${phone}`))
            .catch(err => {
              console.error(`[Alert SMS] FAILED to ${phone}:`, err)
            })
        })
      } else {
        console.log(`[Alert SMS] Skipped — unit: ${!!unit}, phones: ${phones.length}`)
      }
    }
  }
}
