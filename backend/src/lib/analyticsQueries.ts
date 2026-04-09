import { prisma } from './prisma'

type WhereParams = { unitId?: string; from?: string; to?: string }

function dateCondition(alias: string, p: WhereParams): string {
  const parts: string[] = [`${alias}.status = 'completed'`]
  if (p.unitId) parts.push(`${alias}."unitId" = '${p.unitId.replace(/'/g, "''")}'`)
  if (p.from) parts.push(`${alias}."startedAt" >= '${p.from}'`)
  if (p.to) parts.push(`${alias}."startedAt" < '${p.to}'`)
  return parts.join(' AND ')
}

export async function getSummary(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{
    totalSessions: bigint
    avgDwellSeconds: number | null
    interactionCount: bigint
    avgDwellWithInteraction: number | null
  }[]>(`
    SELECT
      COUNT(*) as "totalSessions",
      AVG("dwellSeconds") as "avgDwellSeconds",
      SUM(CASE WHEN "productInteracted" = 1 THEN 1 ELSE 0 END) as "interactionCount",
      AVG(CASE WHEN "productInteracted" = 1 THEN "dwellSeconds" END) as "avgDwellWithInteraction"
    FROM "PresenceSession" s
    WHERE ${where}
  `)
  const r = rows[0]
  const total = Number(r.totalSessions)
  return {
    totalSessions: total,
    avgDwellSeconds: r.avgDwellSeconds ? Math.round(r.avgDwellSeconds) : 0,
    interactionRate: total > 0 ? Number(r.interactionCount) / total : 0,
    avgDwellWithInteraction: r.avgDwellWithInteraction ? Math.round(r.avgDwellWithInteraction) : 0,
  }
}

export async function getDailyStats(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; sessions: bigint; interactions: bigint }[]>(`
    SELECT
      date("startedAt") as date,
      COUNT(*) as sessions,
      SUM(CASE WHEN "productInteracted" = 1 THEN 1 ELSE 0 END) as interactions
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, sessions: Number(r.sessions), interactions: Number(r.interactions) }))
}

export async function getHeatmap(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ dow: string; hour: string; sessions: bigint }[]>(`
    SELECT
      strftime('%w', "startedAt") as dow,
      strftime('%H', "startedAt") as hour,
      COUNT(*) as sessions
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY dow, hour
  `)
  return rows.map(r => ({ dayOfWeek: Number(r.dow), hour: Number(r.hour), sessions: Number(r.sessions) }))
}

export async function getDwellTrend(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; avgDwell: number }[]>(`
    SELECT
      date("startedAt") as date,
      AVG("dwellSeconds") as "avgDwell"
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, avgDwellSeconds: Math.round(r.avgDwell) }))
}
