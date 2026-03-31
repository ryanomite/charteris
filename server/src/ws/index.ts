import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';
import { config } from '../config';

export type WSEventType =
  | 'task:created' | 'task:updated' | 'task:deleted'
  | 'card:created' | 'card:updated' | 'card:deleted' | 'card:moved' | 'card:reordered'
  | 'list:created' | 'list:updated' | 'list:deleted' | 'list:reordered'
  | 'label:created' | 'label:updated' | 'label:deleted';

let wss: WebSocketServer;

export function setupWebSocket(server: HTTPServer): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (config.apiToken && (!token || token !== config.apiToken)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log(`WebSocket client connected (total: ${wss.clients.size})`);

    ws.on('close', () => {
      console.log(`WebSocket client disconnected (total: ${wss.clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

export function broadcast(event: WSEventType, data: unknown): void {
  if (!wss) return;

  const message = JSON.stringify({ event, data });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}
