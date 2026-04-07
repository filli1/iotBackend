import { Prisma } from '@prisma/client'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  // List all subscribers for a unit (admin view)
  fastify.get('/api/units/:unitId/subscriptions', async (request) => {
    const { unitId } = request.params as { unitId: string }
    const subscriptions = await prisma.unitSubscription.findMany({
      where: { unitId },
      include: { user: { select: { id: true, email: true, phoneNumber: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return {
      subscribers: subscriptions.map(s => ({
        userId: s.userId,
        email: s.user.email,
        phoneNumber: s.user.phoneNumber,
        createdAt: s.createdAt,
      })),
    }
  })

  // Subscribe current user to a unit
  fastify.post('/api/units/:unitId/subscriptions', async (request, reply) => {
    const { unitId } = request.params as { unitId: string }
    const { sub } = request.user as { sub: string }
    try {
      await prisma.unitSubscription.create({ data: { userId: sub, unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return reply.status(409).send({ error: 'Already subscribed' })
      }
      throw e
    }
    return reply.status(201).send({ ok: true })
  })

  // Unsubscribe current user from a unit
  fastify.delete('/api/units/:unitId/subscriptions', async (request) => {
    const { unitId } = request.params as { unitId: string }
    const { sub } = request.user as { sub: string }
    await prisma.unitSubscription.deleteMany({ where: { userId: sub, unitId } })
    return { ok: true }
  })

  // Get all unit IDs the current user is subscribed to
  fastify.get('/api/me/subscriptions', async (request) => {
    const { sub } = request.user as { sub: string }
    const subs = await prisma.unitSubscription.findMany({
      where: { userId: sub },
      select: { unitId: true },
    })
    return { unitIds: subs.map(s => s.unitId) }
  })

  // Admin: subscribe a specific user to a unit
  fastify.post('/api/units/:unitId/subscriptions/:userId', async (request, reply) => {
    const { unitId, userId } = request.params as { unitId: string; userId: string }
    try {
      await prisma.unitSubscription.create({ data: { userId, unitId } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return reply.status(409).send({ error: 'Already subscribed' })
      }
      throw e
    }
    return reply.status(201).send({ ok: true })
  })

  // Admin: remove a specific user's subscription
  fastify.delete('/api/units/:unitId/subscriptions/:userId', async (request) => {
    const { unitId, userId } = request.params as { unitId: string; userId: string }
    await prisma.unitSubscription.deleteMany({ where: { userId, unitId } })
    return { ok: true }
  })
}
