import { describe, it, expect, afterEach } from 'vitest'
import Fastify from 'fastify'
import cors from '@fastify/cors'

describe('CORS origin from environment', () => {
  const originalEnv = process.env.CORS_ORIGIN

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ORIGIN
    } else {
      process.env.CORS_ORIGIN = originalEnv
    }
  })

  it('uses CORS_ORIGIN env var when set', async () => {
    process.env.CORS_ORIGIN = 'http://1.2.3.4'

    const fastify = Fastify()
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
    })
    fastify.get('/test', async () => ({ ok: true }))

    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/test',
      headers: {
        Origin: 'http://1.2.3.4',
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://1.2.3.4')
  })

  it('falls back to localhost:5174 when CORS_ORIGIN is not set', async () => {
    delete process.env.CORS_ORIGIN

    const fastify = Fastify()
    await fastify.register(cors, {
      origin: process.env.CORS_ORIGIN ?? 'http://localhost:5174',
    })
    fastify.get('/test', async () => ({ ok: true }))

    const res = await fastify.inject({
      method: 'OPTIONS',
      url: '/test',
      headers: {
        Origin: 'http://localhost:5174',
        'Access-Control-Request-Method': 'GET',
      },
    })

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174')
  })
})
