import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { unitRoutes } from './routes/units'
import { sessionRoutes } from './routes/sessions'
import { analyticsRoutes } from './routes/analytics'
import { authRoutes } from './routes/auth'
import { subscriptionRoutes } from './routes/subscriptions'
import { UnitRegistry } from './lib/unitRegistry'
import { DetectionEngine } from './services/detectionEngine'
import { SessionManager } from './services/sessionManager'
import { registerWs } from './ws/broadcaster'
import { HealthMonitor } from './services/healthMonitor'
import { prisma } from './lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'

// Routes that don't require a JWT
const PUBLIC_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/register',
  'GET /api/auth/setup-status',
  'POST /api/sensors/data',  // protected by API key instead
  'GET /ws',                 // WebSocket — browsers can't send auth headers on upgrade
])

const registry = new UnitRegistry()

const start = async () => {
  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })
  await fastify.register(jwt, { secret: JWT_SECRET })

  // Protect all routes except public ones
  fastify.addHook('onRequest', async (request, reply) => {
    const key = `${request.method} ${request.routeOptions?.url ?? request.url}`
    if (PUBLIC_ROUTES.has(key)) return
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  await fastify.register(authRoutes)

  const broadcaster = await registerWs(fastify)
  const healthMonitor = new HealthMonitor(broadcaster)

  const sessionManager = new SessionManager(prisma, broadcaster)
  const engine = new DetectionEngine(event => {
    sessionManager.handleDetectionEvent(event).catch(err => {
      fastify.log.error(err, 'session manager error')
    })
  })

  const units = await prisma.sensorUnit.findMany({
    include: { configuration: true, tofSensors: true },
  })

  for (const unit of units) {
    registry.register(unit.id)
    healthMonitor.addUnit(unit.id)
    if (unit.configuration) {
      engine.addUnit(unit.id, unit.configuration, unit.tofSensors)
    }
  }

  registry.onOffline(unitId => {
    broadcaster.broadcast({ type: 'unit_status', unitId, status: 'offline', lastSeen: new Date().toISOString() })
  })

  await fastify.register(sessionRoutes)
  await fastify.register(analyticsRoutes)
  await fastify.register(unitRoutes, { registry, engine })
  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    healthMonitor,
    onReading: (unitId, reading) => {
      broadcaster.broadcast({
        type: 'sensor_reading',
        unitId,
        ts: new Date().toISOString(),
        tof: reading.tof,
        imu: reading.imu,
      })
      engine.process(unitId, reading)
    },
    onEvent: (unitId, event) => engine.processEvent(unitId, event),
  })

  await fastify.register(subscriptionRoutes)

  fastify.addHook('onClose', async () => {
    engine.destroy()
    registry.stop()
  })

  await fastify.listen({ port: 7000, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
