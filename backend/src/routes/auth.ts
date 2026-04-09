import { Type, type Static } from '@fastify/type-provider-typebox'
import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

const RegisterBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  phoneNumber: Type.Optional(Type.String()),
})

const LoginBody = Type.Object({
  email: Type.String(),
  password: Type.String(),
})

const PatchMeBody = Type.Object({
  phoneNumber: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  password: Type.Optional(Type.String({ minLength: 8 })),
})

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register — only works if no users exist yet (first-run setup)
  fastify.post(
    '/api/auth/register',
    { schema: { body: RegisterBody } },
    async (request, reply) => {
      const { email, password, phoneNumber } = request.body as Static<typeof RegisterBody>

      const count = await prisma.user.count()
      if (count > 0) {
        return reply.status(403).send({ error: 'Registration is closed' })
      }

      const passwordHash = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { email, passwordHash, phoneNumber },
      })

      const token = fastify.jwt.sign({ sub: user.id, email: user.email })
      return reply.status(201).send({ token, user: { id: user.id, email: user.email, phoneNumber: user.phoneNumber } })
    }
  )

  // Login
  fastify.post(
    '/api/auth/login',
    { schema: { body: LoginBody } },
    async (request, reply) => {
      const { email, password } = request.body as Static<typeof LoginBody>

      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return reply.status(401).send({ error: 'Invalid credentials' })

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return reply.status(401).send({ error: 'Invalid credentials' })

      const token = fastify.jwt.sign({ sub: user.id, email: user.email })
      return reply.send({ token, user: { id: user.id, email: user.email, phoneNumber: user.phoneNumber } })
    }
  )

  // Get current user
  fastify.get('/api/auth/me', async (request, reply) => {
    await request.jwtVerify()
    const payload = request.user as { sub: string }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    return { id: user.id, email: user.email, phoneNumber: user.phoneNumber }
  })

  // Update phone number or password
  fastify.patch(
    '/api/auth/me',
    { schema: { body: PatchMeBody } },
    async (request, reply) => {
      await request.jwtVerify()
      const payload = request.user as { sub: string }
      const { phoneNumber, password } = request.body as Static<typeof PatchMeBody>

      const data: Record<string, unknown> = {}
      if (phoneNumber !== undefined) data.phoneNumber = phoneNumber
      if (password) data.passwordHash = await bcrypt.hash(password, 12)

      const user = await prisma.user.update({ where: { id: payload.sub }, data })
      return { id: user.id, email: user.email, phoneNumber: user.phoneNumber }
    }
  )

  // Check if any users exist (used by frontend to show register vs login)
  fastify.get('/api/auth/setup-status', async () => {
    const count = await prisma.user.count()
    return { needsSetup: count === 0 }
  })

  // List all users
  fastify.get('/api/users', async () => {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, phoneNumber: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    return { users }
  })

  const CreateUserBody = Type.Object({
    email: Type.String({ format: 'email' }),
    password: Type.String({ minLength: 8 }),
    phoneNumber: Type.Optional(Type.String()),
  })

  // Create a user (admin action — requires existing JWT)
  fastify.post(
    '/api/users',
    { schema: { body: CreateUserBody } },
    async (request, reply) => {
      const { email, password, phoneNumber } = request.body as Static<typeof CreateUserBody>
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) return reply.status(409).send({ error: 'Email already in use' })
      const passwordHash = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { email, passwordHash, phoneNumber },
        select: { id: true, email: true, phoneNumber: true, createdAt: true },
      })
      return reply.status(201).send(user)
    }
  )

  // Delete a user
  fastify.delete('/api/users/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string }
    const payload = request.user as { sub: string }
    if (userId === payload.sub) return reply.status(400).send({ error: 'Cannot delete your own account' })
    try {
      await prisma.user.delete({ where: { id: userId } })
    } catch {
      return reply.status(404).send({ error: 'User not found' })
    }
    return { ok: true }
  })
}
