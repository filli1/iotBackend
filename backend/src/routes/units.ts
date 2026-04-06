import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'
import type { UnitRegistry } from '../lib/unitRegistry'

const DEFAULT_TOF_LABELS = ['left-wide', 'left', 'center-left', 'center-right', 'right', 'right-wide']

const CreateUnitBody = Type.Object({
  id: Type.String({ minLength: 3, maxLength: 32 }),
  name: Type.String({ minLength: 1 }),
  location: Type.String({ minLength: 1 }),
  productName: Type.String({ minLength: 1 }),
  ipAddress: Type.String({ minLength: 1 }),
})

type PluginOptions = { registry: UnitRegistry }

export const unitRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/units',
    { schema: { body: CreateUnitBody } },
    async (request, reply) => {
      const { id, name, location, productName, ipAddress } = request.body as {
        id: string
        name: string
        location: string
        productName: string
        ipAddress: string
      }

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
      units: units.map(u => ({
        ...u,
        online: opts.registry.getStatus(u.id)?.online ?? false,
        lastSeen: opts.registry.getStatus(u.id)?.lastSeen ?? null,
      })),
    }
  })

  fastify.delete('/api/units/:unitId', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    await prisma.sensorUnit.delete({ where: { id: unitId } })
    return reply.send({ ok: true })
  })
}
