import { describe, it, expect, afterEach } from 'vitest'
import { prisma } from './prisma'

describe('prisma client', () => {
  afterEach(async () => {
    await prisma.sensorUnit.deleteMany({ where: { id: 'test-unit' } })
  })

  it('can create and read a SensorUnit', async () => {
    const unit = await prisma.sensorUnit.create({
      data: {
        id: 'test-unit',
        name: 'Test',
        location: 'Lab',
        productName: 'Widget',
        ipAddress: '192.168.1.1',
      },
    })

    expect(unit.id).toBe('test-unit')
    expect(unit.name).toBe('Test')

    const found = await prisma.sensorUnit.findUnique({ where: { id: 'test-unit' } })
    expect(found).not.toBeNull()
  })

  it('cascades delete to related TofSensor rows', async () => {
    await prisma.sensorUnit.create({
      data: {
        id: 'test-unit',
        name: 'Test',
        location: 'Lab',
        productName: 'Widget',
        ipAddress: '192.168.1.1',
        tofSensors: {
          create: { index: 1, label: 'left', minDist: 50, maxDist: 1000 },
        },
      },
    })

    await prisma.sensorUnit.delete({ where: { id: 'test-unit' } })

    const sensors = await prisma.tofSensor.findMany({ where: { unitId: 'test-unit' } })
    expect(sensors).toHaveLength(0)
  })
})
