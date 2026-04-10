import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { WebSocketServer, WebSocket } from 'ws'
import type { PluginOption } from 'vite'

function scannerRelayPlugin(): PluginOption {
  return {
    name: 'scanner-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const clients = new Set<WebSocket>();

      wss.on('connection', (ws) => {
        clients.add(ws);
        console.log(`[scanner-relay] Client connected (${clients.size} total)`);

        ws.on('message', (data) => {
          const msg = data.toString();
          console.log(`[scanner-relay] Received: ${msg}`);
          // Broadcast to all OTHER connected clients
          for (const client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(msg);
            }
          }
        });

        ws.on('close', () => {
          clients.delete(ws);
          console.log(`[scanner-relay] Client disconnected (${clients.size} total)`);
        });
      });

      // Must hook into upgrade BEFORE Vite's HMR WebSocket handler
      // Use the server's 'upgrade' event with our path check
      const httpServer = server.httpServer;
      if (httpServer) {
        // Store original listeners and prepend ours
        const originalListeners = httpServer.listeners('upgrade').slice();
        httpServer.removeAllListeners('upgrade');

        httpServer.on('upgrade', (req, socket, head) => {
          if (req.url === '/ws/scanner') {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit('connection', ws, req);
            });
          } else {
            // Pass to original handlers (Vite HMR)
            for (const listener of originalListeners) {
              (listener as Function).call(httpServer, req, socket, head);
            }
          }
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), scannerRelayPlugin()],
  server: {
    host: true,
  },
})
