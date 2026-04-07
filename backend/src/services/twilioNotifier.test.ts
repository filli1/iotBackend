import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM123' })

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

import { sendWhatsApp } from './twilioNotifier'

describe('sendWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'AC123'
    process.env.TWILIO_AUTH_TOKEN = 'token123'
    process.env.TWILIO_FROM_NUMBER = 'whatsapp:+14155238886'
  })

  afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_FROM_NUMBER
  })

  it('calls twilio messages.create with correct parameters', async () => {
    await sendWhatsApp('+4553575520', 'Test message')
    expect(mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+4553575520',
      body: 'Test message',
    })
  })

  it('throws if TWILIO_ACCOUNT_SID is missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })

  it('throws if TWILIO_AUTH_TOKEN is missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })

  it('throws if TWILIO_FROM_NUMBER is missing', async () => {
    delete process.env.TWILIO_FROM_NUMBER
    await expect(sendWhatsApp('+4553575520', 'Test')).rejects.toThrow(
      'Twilio credentials not configured'
    )
  })
})
