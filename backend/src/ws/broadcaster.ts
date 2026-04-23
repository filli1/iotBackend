import type { FastifyInstance } from 'fastify'
import websocket from '@fastify/websocket'

export type WsMessage = Record<string, unknown>
export type OnConnectHandler = (send: (message: WsMessage) => void) => void

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

export async function registerWs(
  fastify: FastifyInstance,
  onConnect?: OnConnectHandler
): Promise<WsBroadcaster> {
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

  fastify.get('/ws', { websocket: true }, (connection) => {
    if (onConnect) {
      const socket = (connection as { socket?: { readyState: number; send: (data: string) => void } }).socket
        ?? (connection as unknown as { readyState: number; send: (data: string) => void })
      onConnect((message) => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify(message))
        }
      })
    }
  })

  return new WsBroadcaster(fastify)
}
