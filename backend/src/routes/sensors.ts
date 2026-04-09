import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { SensorReading, HardwareEvent } from '../types/sensor'
import { isSensorReading } from '../types/sensor'
import type { HealthMonitor } from '../services/healthMonitor'
import { prisma } from '../lib/prisma'

const ImuVector = Type.Object({ x: Type.Number(), y: Type.Number(), z: Type.Number() })

const SensorReadingSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  tof: Type.Array(Type.Object({
    id: Type.Number(),
    distance_mm: Type.Number(),
    status: Type.Union([Type.Literal('valid'), Type.Literal('out_of_range'), Type.Literal('error')]),
  })),
  imu: Type.Object({ accel: ImuVector, gyro: ImuVector, mag: ImuVector }),
})

const HardwareEventSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  event: Type.Union([
    Type.Literal('imu_shock'),
    Type.Literal('imu_pickup'),
    Type.Literal('imu_rotation'),
  ]),
  value: Type.Record(Type.String(), Type.Unknown()),
})

const PayloadSchema = Type.Union([SensorReadingSchema, HardwareEventSchema])

type PluginOptions = {
  registry: UnitRegistry
  onReading: (unitId: string, reading: SensorReading) => void
  onEvent: (unitId: string, event: HardwareEvent) => void
  healthMonitor: HealthMonitor
}

export const sensorRoutes: FastifyPluginAsync<PluginOptions> = async (fastify, opts) => {
  fastify.post(
    '/api/sensors/data',
    { schema: { body: PayloadSchema } },
    async (request, reply) => {
      const payload = request.body as SensorReading | HardwareEvent

      if (!opts.registry.isKnown(payload.unit_id)) {
        return reply.status(404).send({ error: 'Unknown unit_id' })
      }

      const apiKey = request.headers['x-api-key']
      const unit = await prisma.sensorUnit.findUnique({
        where: { id: payload.unit_id },
        select: { apiKey: true },
      })
      if (!unit || unit.apiKey !== apiKey) {
        return reply.status(401).send({ error: 'Invalid API key' })
      }

      opts.registry.markSeen(payload.unit_id)

      if (isSensorReading(payload)) {
        opts.onReading(payload.unit_id, payload)
        opts.healthMonitor.process(payload.unit_id, payload)
      } else {
        opts.onEvent(payload.unit_id, payload)
      }

      return { ok: true }
    }
  )
}
