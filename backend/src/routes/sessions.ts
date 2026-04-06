import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../lib/prisma'
import type { Prisma } from '@prisma/client'

const QuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  sortBy: Type.Optional(Type.String({ default: 'startedAt' })),
  sortDir: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')], { default: 'desc' })),
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productPickedUp: Type.Optional(Type.Boolean()),
})

const ExportQuerySchema = Type.Object({
  unitId: Type.Optional(Type.String()),
  dateFrom: Type.Optional(Type.String()),
  dateTo: Type.Optional(Type.String()),
  minDwellSeconds: Type.Optional(Type.Integer({ minimum: 0 })),
  productPickedUp: Type.Optional(Type.Boolean()),
})

export function buildWhere(q: Record<string, unknown>): Prisma.PresenceSessionWhereInput {
  const where: Prisma.PresenceSessionWhereInput = { status: 'completed' }
  if (q.unitId) where.unitId = q.unitId as string
  if (q.dateFrom || q.dateTo) {
    where.startedAt = {}
    if (q.dateFrom) where.startedAt.gte = new Date(q.dateFrom as string)
    if (q.dateTo) where.startedAt.lt = new Date(q.dateTo as string)
  }
  if (q.minDwellSeconds !== undefined) where.dwellSeconds = { gte: q.minDwellSeconds as number }
  if (q.productPickedUp !== undefined) where.productPickedUp = q.productPickedUp as boolean
  return where
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/sessions/export.csv',
    { schema: { querystring: ExportQuerySchema } },
    async (request, reply) => {
      const q = request.query as Record<string, unknown>
      const where = buildWhere(q)

      const rows = await prisma.presenceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        include: { unit: { select: { name: true } } },
      })

      const header = 'id,unitId,unitName,startedAt,endedAt,dwellSeconds,productPickedUp'
      const body = rows
        .map(r =>
          [
            `"${r.id}"`,
            `"${r.unitId}"`,
            `"${r.unit.name}"`,
            `"${r.startedAt.toISOString()}"`,
            `"${r.endedAt?.toISOString() ?? ''}"`,
            r.dwellSeconds,
            r.productPickedUp,
          ].join(',')
        )
        .join('\n')

      const date = new Date().toISOString().slice(0, 10)

      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="sessions-${date}.csv"`)
        .send(rows.length > 0 ? `${header}\n${body}` : header)
    }
  )

  fastify.get(
    '/api/sessions',
    { schema: { querystring: QuerySchema } },
    async (request) => {
      const q = request.query as Record<string, unknown>
      const page = (q.page as number) ?? 1
      const pageSize = (q.pageSize as number) ?? 25
      const sortBy = (q.sortBy as string) ?? 'startedAt'
      const sortDir = (q.sortDir as 'asc' | 'desc') ?? 'desc'
      const where = buildWhere(q)

      const [total, rows] = await Promise.all([
        prisma.presenceSession.count({ where }),
        prisma.presenceSession.findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { unit: { select: { name: true } } },
        }),
      ])

      return {
        data: rows.map(r => ({
          id: r.id,
          unitId: r.unitId,
          unitName: r.unit.name,
          startedAt: r.startedAt.toISOString(),
          endedAt: r.endedAt?.toISOString() ?? null,
          dwellSeconds: r.dwellSeconds,
          productPickedUp: r.productPickedUp,
          status: r.status,
        })),
        total,
        page,
        pageSize,
        pageCount: Math.ceil(total / pageSize),
      }
    }
  )
}
