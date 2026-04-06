import Fastify from 'fastify'
import cors from '@fastify/cors'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'
import { sensorRoutes } from './routes/sensors'
import { UnitRegistry } from './lib/unitRegistry'
import { DetectionEngine } from './services/detectionEngine'
import { prisma } from './lib/prisma'

const registry = new UnitRegistry()

const start = async () => {
  const units = await prisma.sensorUnit.findMany({
    include: { configuration: true, tofSensors: true },
  })

  // SessionManager callback will be added in CORE-02; use a placeholder for now
  const engine = new DetectionEngine(event => {
    console.log('detection event:', event)
  })

  for (const unit of units) {
    registry.register(unit.id)
    if (unit.configuration) {
      engine.addUnit(unit.id, unit.configuration, unit.tofSensors)
    }
  }

  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

  await fastify.register(cors, { origin: 'http://localhost:5174' })
  await fastify.register(healthRoutes)
  await fastify.register(sensorRoutes, {
    registry,
    onReading: (unitId, reading) => engine.process(unitId, reading),
    onEvent: (unitId, event) => engine.processEvent(unitId, event),
  })

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
