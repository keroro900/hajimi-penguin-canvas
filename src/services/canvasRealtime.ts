import type { CanvasRealtimeOp } from '../utils/canvasRealtime';

type CanvasRealtimeHandler = (op: CanvasRealtimeOp) => void;

interface CanvasRealtimeClientOptions {
  canvasId: string;
  clientId: string;
  onOp: CanvasRealtimeHandler;
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error') => void;
}

function realtimeUrl(canvasId: string, clientId: string) {
  const origin = window.location.origin.replace(/^http/i, window.location.protocol === 'https:' ? 'wss' : 'ws');
  const params = new URLSearchParams({ canvasId, clientId });
  return `${origin}/api/canvas/realtime?${params.toString()}`;
}

export class CanvasRealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private closed = false;
  private readonly options: CanvasRealtimeClientOptions;

  constructor(options: CanvasRealtimeClientOptions) {
    this.options = options;
  }

  connect() {
    if (this.closed || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    this.options.onStatus?.('connecting');
    const socket = new WebSocket(realtimeUrl(this.options.canvasId, this.options.clientId));
    this.socket = socket;
    socket.onopen = () => this.options.onStatus?.('open');
    socket.onmessage = (event) => {
      let message: any = null;
      try {
        message = JSON.parse(String(event.data || '{}'));
      } catch {
        return;
      }
      if (message?.type === 'canvas:op' && message.op) {
        this.options.onOp(message.op);
      }
    };
    socket.onerror = () => this.options.onStatus?.('error');
    socket.onclose = () => {
      this.options.onStatus?.('closed');
      if (!this.closed) this.scheduleReconnect();
    };
  }

  sendOp(op: CanvasRealtimeOp) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(op));
    return true;
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.socket = null;
      this.connect();
    }, 1200);
  }
}
