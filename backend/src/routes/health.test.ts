import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './health'

describe('GET /health', () => {
  it('returns 200 with status ok and an ISO timestamp', async () => {
    const fastify = Fastify().withTypeProvider<TypeBoxTypeProvider>()
    await fastify.register(healthRoutes)

    const response = await fastify.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body) as { status: string; timestamp: string }
    expect(body.status).toBe('ok')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
