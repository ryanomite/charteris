import 'express-async-errors';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config';
import { tokenAuth, errorHandler } from './middleware';
import { initDb } from './db';
import { setupWebSocket } from './ws';
import { createMcpServer } from './mcp';
import sectionRoutes from './routes/sections';
import listRoutes from './routes/lists';
import taskRoutes from './routes/tasks';
import cardRoutes from './routes/cards';
import labelRoutes from './routes/labels';
import adminRoutes from './routes/admin';
import dashboardRoutes from './routes/dashboard';
import importRoutes from './routes/import';
import publicRoutes from './routes/public';
import settingsRoutes from './routes/settings';

const app = express();
const server = createServer(app);

// Global middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check (no auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Swagger docs (no auth)
const swaggerPath = path.join(__dirname, '..', 'openapi.yaml');
if (fs.existsSync(swaggerPath)) {
  const swaggerDoc = YAML.load(swaggerPath);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));
}

// Token auth for all /api/v1/* routes
app.use('/api/v1', tokenAuth);

// API routes
app.use('/api/v1/sections', sectionRoutes);
app.use('/api/v1/lists', listRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/cards', cardRoutes);
app.use('/api/v1/labels', labelRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/import', importRoutes);
app.use('/api/v1/public', publicRoutes);

// MCP server — Streamable HTTP transport at /mcp (token-protected)
const mcpSessions = new Map<string, { server: ReturnType<typeof createMcpServer>; transport: StreamableHTTPServerTransport }>();

app.post('/mcp', tokenAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && mcpSessions.has(sessionId)) {
    const session = mcpSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res, req.body);
  } else {
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) mcpSessions.delete(transport.sessionId);
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
    if (transport.sessionId) {
      mcpSessions.set(transport.sessionId, { server: mcpServer, transport });
    }
  }
});

app.get('/mcp', tokenAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const session = sessionId ? mcpSessions.get(sessionId) : undefined;
  if (!session) { res.status(400).json({ error: 'No active MCP session' }); return; }
  await session.transport.handleRequest(req, res);
});

app.delete('/mcp', tokenAuth, async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const session = sessionId ? mcpSessions.get(sessionId) : undefined;
  if (!session) { res.status(400).json({ error: 'No active MCP session' }); return; }
  await session.transport.handleRequest(req, res);
  mcpSessions.delete(sessionId);
});

// Error handler (must be before static serving)
app.use(errorHandler);

// Static file serving — serve the built Vue app
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  // Read index.html once and inject runtime config (API token)
  const indexPath = path.join(publicDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf-8');
  const runtimeScript = `<script>window.__CHARTERIS__={token:${JSON.stringify(config.apiToken)}}</script>`;
  const injectedHtml = indexHtml.replace('</head>', `${runtimeScript}\n</head>`);

  app.use(express.static(publicDir, { index: false }));

  // SPA fallback — any unmatched GET returns index.html with injected config
  // No-store prevents the browser caching the HTML and skipping token injection on soft refresh
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(injectedHtml);
  });
}

// Initialize DB and start
initDb();
console.log('SQLite database initialized');

setupWebSocket(server);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`charteris listening on port ${config.port}`);
  console.log(`API:       http://0.0.0.0:${config.port}/api/v1`);
  console.log(`WebSocket: ws://0.0.0.0:${config.port}`);
  if (fs.existsSync(publicDir)) {
    console.log(`UI:        http://0.0.0.0:${config.port}/`);
  } else {
    console.log(`UI:        not found (build with: npm run build:ui)`);
  }
});
