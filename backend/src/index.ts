import Fastify from 'fastify'
import cors from '@fastify/cors'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { UnitRegistry } from './lib/unitRegistry'
import { prisma } from './lib/prisma'

const registry = new UnitRegistry()

const start = async () => {
  // Load all registered units into the registry on startup
  const units = await prisma.sensorUnit.findMany({ select: { id: true } })
  for (const unit of units) {
    registry.register(unit.id)
  }

  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })
  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    onReading: (unitId, reading) => {
      // DetectionEngine will be wired here in CORE-01
      fastify.log.info({ unitId }, 'sensor reading received')
    },
    onEvent: (unitId, event) => {
      // DetectionEngine will be wired here in CORE-01
      fastify.log.info({ unitId, event: event.event }, 'hardware event received')
    },
  })

  await fastify.listen({ port: 7000, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
