import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import type { UnitRegistry } from '../lib/unitRegistry'
import type { SensorReading, HardwareEvent } from '../types/sensor'
import { isSensorReading } from '../types/sensor'
import type { HealthMonitor } from '../services/healthMonitor'

const SensorReadingSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  tof: Type.Array(Type.Object({
    id: Type.Number(),
    distance_mm: Type.Number(),
    status: Type.Union([Type.Literal('valid'), Type.Literal('out_of_range'), Type.Literal('error')]),
  }), { minItems: 1 }),
  imu: Type.Optional(Type.Object({
    vibration_intensity: Type.Optional(Type.Number({ minimum: 0 })),
  }, { additionalProperties: true })),
})

const HardwareEventSchema = Type.Object({
  unit_id: Type.String(),
  ts: Type.Number(),
  event: Type.Union([Type.Literal('imu_shock'), Type.Literal('imu_vibration')]),
  value: Type.Record(Type.String(), Type.Unknown()),
})

const PayloadSchema = Type.Union([SensorReadingSchema, HardwareEventSchema])

const PingSchema = Type.Object({
  unit_id: Type.String(),
})

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

  fastify.post(
    '/api/sensors/ping',
    { schema: { body: PingSchema } },
    async (request, reply) => {
      const { unit_id } = request.body as { unit_id: string }

      if (!opts.registry.isKnown(unit_id)) {
        return reply.status(404).send({ error: 'Unknown unit_id' })
      }

      opts.registry.markSeen(unit_id)
      return reply.status(204).send()
    }
  )
}
