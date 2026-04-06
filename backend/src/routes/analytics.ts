import { Type } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import { getSummary, getDailyStats, getHeatmap, getDwellTrend } from '../lib/analyticsQueries'

const AnalyticsQuery = Type.Object({
  unitId: Type.Optional(Type.String()),
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
})

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/analytics/summary', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return getSummary(req.query as Record<string, string>)
  })

  fastify.get('/api/analytics/daily', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getDailyStats(req.query as Record<string, string>) }
  })

  fastify.get('/api/analytics/heatmap', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getHeatmap(req.query as Record<string, string>) }
  })

  fastify.get('/api/analytics/dwell-trend', { schema: { querystring: AnalyticsQuery } }, async (req) => {
    return { data: await getDwellTrend(req.query as Record<string, string>) }
  })
}
