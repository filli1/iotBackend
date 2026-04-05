import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { healthRoutes } from './routes/health'

const start = async () => {
  const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()
  await fastify.register(healthRoutes)
  await fastify.listen({ port: 7000, host: '0.0.0.0' })
}

start().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
