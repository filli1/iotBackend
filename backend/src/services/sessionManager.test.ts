vi.mock('./twilioNotifier', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(undefined),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionManager } from './sessionManager'
import type { WsBroadcaster } from '../ws/broadcaster'
import { sendWhatsApp } from './twilioNotifier'

const mockPrisma = {
  presenceSession: {
    create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    update: vi.fn().mockResolvedValue({}),
  },
  sessionEvent: {
    create: vi.fn().mockResolvedValue({}),
  },
  alertRule: {
    findUnique: vi.fn().mockResolvedValue({
      enabled: true,
      dwellThresholdSeconds: 30,
      requireInteraction: false,
    }),
  },
  sensorUnit: {
    findUnique: vi.fn().mockResolvedValue({ name: 'Stand A' }),
  },
  unitSubscription: {
    findMany: vi.fn().mockResolvedValue([]),
  },
}

const mockBroadcaster = { broadcast: vi.fn() } as unknown as WsBroadcaster

describe('SessionManager', () => {
  let manager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new SessionManager(mockPrisma as any, mockBroadcaster)
  })

  it('creates a PresenceSession on session_started', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    expect(mockPrisma.presenceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitId: 'unit-01', status: 'active' }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_started' })
    )
  })

  it('closes the session on session_ended', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed', dwellSeconds: 45 }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'session_ended', dwellSeconds: 45 })
    )
  })

  it('sets productInteracted on product_interacted event', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'product_interacted', unitId: 'unit-01', ts: new Date() })
    expect(mockPrisma.presenceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productInteracted: true }) })
    )
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session_event', event: 'product_interacted' })
    )
  })

  it('broadcasts alert_fired when dwell threshold is met on session_ended', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'alert_fired', unitId: 'unit-01' })
    )
  })

  it('does NOT fire alert when dwell is below threshold', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 10 })
    const alertCalls = (mockBroadcaster.broadcast as ReturnType<typeof vi.fn>).mock.calls
      .filter(([msg]) => msg.type === 'alert_fired')
    expect(alertCalls).toHaveLength(0)
  })

  it('sends WhatsApp to subscribed users when alert fires', async () => {
    mockPrisma.unitSubscription.findMany.mockResolvedValueOnce([
      { user: { phoneNumber: '+4553575520' } },
    ])
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    await new Promise(r => setTimeout(r, 10))
    expect(sendWhatsApp).toHaveBeenCalledWith('+4553575520', expect.stringContaining('Stand A'))
  })

  it('does NOT call sendWhatsApp when there are no subscribers', async () => {
    await manager.handleDetectionEvent({ type: 'session_started', unitId: 'unit-01', ts: new Date() })
    await manager.handleDetectionEvent({ type: 'session_ended', unitId: 'unit-01', ts: new Date(), dwellSeconds: 45 })
    await new Promise(r => setTimeout(r, 10))
    expect(sendWhatsApp).not.toHaveBeenCalled()
  })
})
