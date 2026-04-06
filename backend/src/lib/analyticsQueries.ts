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
    pickupCount: bigint
    avgDwellWithPickup: number | null
  }[]>(`
    SELECT
      COUNT(*) as "totalSessions",
      AVG("dwellSeconds") as "avgDwellSeconds",
      SUM(CASE WHEN "productPickedUp" = 1 THEN 1 ELSE 0 END) as "pickupCount",
      AVG(CASE WHEN "productPickedUp" = 1 THEN "dwellSeconds" END) as "avgDwellWithPickup"
    FROM "PresenceSession" s
    WHERE ${where}
  `)
  const r = rows[0]
  const total = Number(r.totalSessions)
  return {
    totalSessions: total,
    avgDwellSeconds: r.avgDwellSeconds ? Math.round(r.avgDwellSeconds) : 0,
    pickupRate: total > 0 ? Number(r.pickupCount) / total : 0,
    avgDwellWithPickup: r.avgDwellWithPickup ? Math.round(r.avgDwellWithPickup) : 0,
  }
}

export async function getDailyStats(p: WhereParams) {
  const where = dateCondition('s', p)
  const rows = await prisma.$queryRawUnsafe<{ date: string; sessions: bigint; pickups: bigint }[]>(`
    SELECT
      date("startedAt") as date,
      COUNT(*) as sessions,
      SUM(CASE WHEN "productPickedUp" = 1 THEN 1 ELSE 0 END) as pickups
    FROM "PresenceSession" s
    WHERE ${where}
    GROUP BY date("startedAt")
    ORDER BY date("startedAt") ASC
  `)
  return rows.map(r => ({ date: r.date, sessions: Number(r.sessions), pickups: Number(r.pickups) }))
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
