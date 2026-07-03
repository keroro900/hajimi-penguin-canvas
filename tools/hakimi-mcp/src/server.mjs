#!/usr/bin/env node
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HAKIMI_MCP_TOOLS, registerHakimiTools } from './tools.mjs';

const STATUS_HOST = process.env.HAKIMI_MCP_STATUS_HOST || '127.0.0.1';
const STATUS_PORT = Number.parseInt(process.env.HAKIMI_MCP_STATUS_PORT || '18767', 10) || 18767;

export function createHakimiMcpServer() {
  const server = new McpServer({
    name: 'hakimi-mcp',
    version: '0.1.0',
  });
  registerHakimiTools(server);
  return server;
}

export function startHakimiStatusServer(options = {}) {
  const host = options.host || STATUS_HOST;
  const port = Number(options.port || STATUS_PORT);
  const statusServer = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/status') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      ok: true,
      service: 'hakimi-mcp',
      toolCount: HAKIMI_MCP_TOOLS.length,
      time: new Date().toISOString(),
    }));
  });
  statusServer.on('error', (error) => {
    console.error(`Hakimi MCP status server unavailable: ${error?.message || error}`);
  });
  statusServer.listen(port, host, () => {
    console.error(`Hakimi MCP status: http://${host}:${port}/status`);
  });
  return statusServer;
}

export async function main() {
  startHakimiStatusServer();
  const server = createHakimiMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Hakimi MCP running on stdio with ${HAKIMI_MCP_TOOLS.length} tools`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.mjs')) {
  main().catch((error) => {
    console.error('Fatal Hakimi MCP error:', error);
    process.exit(1);
  });
}
