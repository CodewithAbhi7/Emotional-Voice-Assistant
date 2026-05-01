import type { ServerMessage } from '../store/types'
import { WS_URL } from './constants'

type QueueItem =
  | { kind: 'json'; payload: string }
  | { kind: 'binary'; payload: ArrayBuffer }

type MessageListener = (message: ServerMessage | { type: string }) => void
type StatusListener = (connected: boolean) => void

class EVAWebSocketClient {
  private socket: WebSocket | null = null
  private reconnectTimer: number | null = null
  private readonly messageListeners = new Set<MessageListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private readonly queue: QueueItem[] = []

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    this.socket = new WebSocket(WS_URL)

    this.socket.onopen = () => {
      this.notifyStatus(true)
      this.flushQueue()
    }

    this.socket.onclose = () => {
      this.notifyStatus(false)
      this.socket = null
      this.reconnectTimer = window.setTimeout(() => this.connect(), 3000)
    }

    this.socket.onerror = () => {
      this.notifyStatus(false)
    }

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.messageListeners.forEach((listener) => listener(message))
      } catch (error) {
        console.error('Failed to parse WebSocket message', error)
      }
    }
  }

  sendJson(payload: object) {
    const serialized = JSON.stringify(payload)
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(serialized)
      return
    }
    this.queue.push({ kind: 'json', payload: serialized })
  }

  sendBinary(payload: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload)
      return
    }
    this.queue.push({ kind: 'binary', payload })
  }

  subscribe(listener: MessageListener) {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  subscribeStatus(listener: StatusListener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private flushQueue() {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return
    }
    while (this.queue.length > 0) {
      const next = this.queue.shift()!
      if (next.kind === 'json') {
        this.socket.send(next.payload)
      } else {
        this.socket.send(next.payload)
      }
    }
  }

  private notifyStatus(connected: boolean) {
    this.statusListeners.forEach((listener) => listener(connected))
  }
}

export const websocketClient = new EVAWebSocketClient()
