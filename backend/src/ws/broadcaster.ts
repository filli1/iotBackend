import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'

export type WsMessage = Record<string, unknown>

export class WsBroadcaster {
  private fastify: FastifyInstance

  constructor(fastify: FastifyInstance) {
    this.fastify = fastify
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message)
    for (const client of this.fastify.websocketServer.clients) {
      if (client.readyState === 1) {
        client.send(data)
      }
    }
  }
}

export async function registerWs(fastify: FastifyInstance): Promise<WsBroadcaster> {
  await fastify.register(websocket, {
    options: {
      clientTracking: true,
      perMessageDeflate: false,
    },
  })

  // Ping all connected clients every 30s to keep connections alive
  const pingInterval = setInterval(() => {
    for (const client of fastify.websocketServer.clients) {
      if (client.readyState === 1) {
        client.ping()
      }
    }
  }, 30_000)

  fastify.addHook('onClose', () => {
    clearInterval(pingInterval)
  })

  fastify.get('/ws', { websocket: true }, () => {
    // clients are tracked automatically by @fastify/websocket
  })

  return new WsBroadcaster(fastify)
}
