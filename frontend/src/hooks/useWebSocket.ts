import { useEffect, useRef } from 'react'
import { useWsStore } from '../lib/wsStore'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export function useWebSocket() {
  const { setConnected, handleMessage } = useWsStore()
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelay = useRef(1000)

  useEffect(() => {
    let pingTimer: ReturnType<typeof setInterval> | null = null

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        retryDelay.current = 1000
        // Send a lightweight ping every 25s to keep the connection alive
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25_000)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as Record<string, unknown>
          if (msg.type === 'pong') return
          handleMessage(msg)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (pingTimer) clearInterval(pingTimer)
        pingTimer = null
        retryRef.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
          connect()
        }, retryDelay.current)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      if (pingTimer) clearInterval(pingTimer)
      if (retryRef.current) clearTimeout(retryRef.current)
      const ws = wsRef.current
      if (ws) {
        ws.onclose = null
        ws.onerror = null
        ws.close()
      }
    }
  }, [setConnected, handleMessage])
}
