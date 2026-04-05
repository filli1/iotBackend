import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'

const HealthResponse = Type.Object({
  status: Type.Literal('ok'),
  timestamp: Type.String(),
})

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    { schema: { response: { 200: HealthResponse } } },
    async () => ({ status: 'ok' as const, timestamp: new Date().toISOString() })
  )
}
