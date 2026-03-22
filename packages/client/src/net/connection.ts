import type { ClientMessage, ServerMessage } from '@heist/shared'
import { wsConnected } from '../state/client-state'

type MessageHandler = (msg: ServerMessage) => void

// import.meta.env.VITE_WS_URL is substituted by Vite at build time
// Falls back to same host (for local dev with a proxy) if not set
const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 500

export class Connection {
  private ws: WebSocket | null = null
  private handlers: Set<MessageHandler> = new Set()
  private retryCount = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false

  constructor(private url: string = WS_URL) {}

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.retryCount = 0
      wsConnected.value = true
    }

    this.ws.onmessage = (event: MessageEvent) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data as string) as ServerMessage
      } catch {
        console.error('[WS] Failed to parse message:', event.data)
        return
      }
      this.handlers.forEach(h => h(msg))
    }

    this.ws.onclose = (event: CloseEvent) => {
      console.log(`[WS] Disconnected (${event.code})`)
      wsConnected.value = false
      if (!this.intentionallyClosed) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (event: Event) => {
      console.error('[WS] Error:', event)
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      console.error('[WS] Max reconnect attempts reached.')
      return
    }

    const delay = BASE_BACKOFF_MS * Math.pow(2, this.retryCount)
    this.retryCount++
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${MAX_RETRIES})`)

    this.retryTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send — not connected')
      return
    }
    this.ws.send(JSON.stringify(msg))
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  disconnect(): void {
    this.intentionallyClosed = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton connection
export const connection = new Connection()
