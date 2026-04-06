import { Type, type Static } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { DetectionEngine } from '../services/detectionEngine'

const DEFAULT_TOF_LABELS = ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide']

const CreateUnitBody = Type.Object({
  id: Type.String({ minLength: 3, maxLength: 32 }),
  name: Type.String({ minLength: 1 }),
  location: Type.String({ minLength: 1 }),
  productName: Type.String({ minLength: 1 }),
  ipAddress: Type.String({ minLength: 1 }),
})

type PluginOptions = { registry: UnitRegistry; engine: DetectionEngine }

export const unitRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/units',
    { schema: { body: CreateUnitBody } },
    async (request, reply) => {
      const { id, name, location, productName, ipAddress } = request.body as Static<typeof CreateUnitBody>

      const existing = await prisma.sensorUnit.findUnique({ where: { id } })
      if (existing) return reply.status(409).send({ error: 'Unit ID already exists' })

      const unit = await prisma.sensorUnit.create({
        data: {
          id, name, location, productName, ipAddress,
          configuration: {
            create: {},
          },
          alertRule: {
            create: {},
          },
          tofSensors: {
            create: DEFAULT_TOF_LABELS.map((label, i) => ({
              index: i + 1,
              label,
              minDist: 50,
              maxDist: 1000,
            })),
          },
        },
      })

      opts.registry.register(unit.id)
      return reply.status(201).send(unit)
    }
  )

  fastify.get('/api/units', async () => {
    const units = await prisma.sensorUnit.findMany({ orderBy: { createdAt: 'asc' } })
    return {
      units: units.map(u => {
        const status = opts.registry.getStatus(u.id)
        return { ...u, online: status?.online ?? false, lastSeen: status?.lastSeen ?? null }
      }),
    }
  })

  fastify.delete('/api/units/:unitId', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    try {
      await prisma.sensorUnit.delete({ where: { id: unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return reply.status(404).send({ error: 'Unit not found' })
      }
      throw e
    }
    return reply.send({ ok: true })
  })

  fastify.get('/api/units/:unitId/config', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const [configuration, sensors, alertRule] = await Promise.all([
      prisma.unitConfiguration.findUnique({ where: { unitId } }),
      prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } }),
      prisma.alertRule.findUnique({ where: { unitId } }),
    ])
    if (!configuration) return reply.status(404).send({ error: 'Unit not found' })
    return { configuration, sensors, alertRule }
  })

  fastify.get('/api/units/:unitId/sensors', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const sensors = await prisma.tofSensor.findMany({ where: { unitId }, orderBy: { index: 'asc' } })
    if (!sensors.length) return reply.status(404).send({ error: 'Unit not found' })
    return { sensors }
  })

  const PatchConfigBody = Type.Object({
    configuration: Type.Optional(Type.Partial(Type.Object({
      minSensorAgreement: Type.Number({ minimum: 1, maximum: 6 }),
      departureTimeoutSeconds: Type.Number({ minimum: 1, maximum: 30 }),
      dwellMinSeconds: Type.Number({ minimum: 1, maximum: 30 }),
      pirEnabled: Type.Boolean(),
      pirCooldownSeconds: Type.Number({ minimum: 1, maximum: 60 }),
      imuPickupThresholdG: Type.Number({ minimum: 0.5, maximum: 5 }),
      imuExaminationEnabled: Type.Boolean(),
      imuDurationThresholdMs: Type.Number({ minimum: 100, maximum: 2000 }),
    }))),
    sensors: Type.Optional(Type.Array(Type.Object({
      index: Type.Number(),
      label: Type.Optional(Type.String()),
      minDist: Type.Optional(Type.Number({ minimum: 10, maximum: 500 })),
      maxDist: Type.Optional(Type.Number({ minimum: 100, maximum: 4000 })),
    }))),
    alertRule: Type.Optional(Type.Partial(Type.Object({
      dwellThresholdSeconds: Type.Number({ minimum: 1 }),
      requirePickup: Type.Boolean(),
      enabled: Type.Boolean(),
    }))),
  })

  fastify.patch(
    '/api/units/:unitId/config',
    { schema: { body: PatchConfigBody } },
    async (request, reply) => {
      const { unitId } = request.params as { unitId: string }
      const body = request.body as Static<typeof PatchConfigBody>

      await prisma.$transaction(async tx => {
        if (body.configuration) {
          await tx.unitConfiguration.update({ where: { unitId }, data: body.configuration })
        }
        if (body.sensors) {
          for (const s of body.sensors) {
            await tx.tofSensor.updateMany({
              where: { unitId, index: s.index },
              data: {
                ...(s.label !== undefined && { label: s.label }),
                ...(s.minDist !== undefined && { minDist: s.minDist }),
                ...(s.maxDist !== undefined && { maxDist: s.maxDist }),
              },
            })
          }
        }
        if (body.alertRule) {
          await tx.alertRule.update({ where: { unitId }, data: body.alertRule })
        }
      })

      // Apply to running engine immediately
      const [cfg, sensors] = await Promise.all([
        prisma.unitConfiguration.findUnique({ where: { unitId } }),
        prisma.tofSensor.findMany({ where: { unitId } }),
      ])
      if (cfg) opts.engine.updateConfig(unitId, cfg, sensors)

      return reply.send({ ok: true })
    }
  )
}
