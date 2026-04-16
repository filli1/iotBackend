import twilio from 'twilio'

export async function sendSms(to: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const apiKeySid = process.env.TWILIO_API_KEY_SID
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
  const fromNumber = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !fromNumber) {
    throw new Error('Twilio credentials not configured')
  }

  let client: ReturnType<typeof twilio>
  if (authToken) {
    client = twilio(accountSid, authToken)
  } else if (apiKeySid && apiKeySecret) {
    client = twilio(apiKeySid, apiKeySecret, { accountSid })
  } else {
    throw new Error('Twilio credentials not configured')
  }

  await client.messages.create({
    from: fromNumber,
    to,
    body,
  })
}
