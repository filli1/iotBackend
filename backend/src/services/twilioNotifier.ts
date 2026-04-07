import twilio from 'twilio'

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const client = twilio(accountSid, authToken)
  await client.messages.create({
    from: fromNumber,
    to: `whatsapp:${to}`,
    body,
  })
}
