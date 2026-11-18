/* eslint-disable */
// SW-131 spike: /mcp inside Apostrophe, SDK stateless JSON mode. Throwaway.
// Keeps the server up while the MCP Inspector CLI (installed in /tmp/insp) calls it.
const test = require('node:test');
const t = require('apostrophe/test-lib/util.js');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const z = require('zod');

let apos; const out = [];
const log = (k, v) => out.push(`${k}: ${v}`);

function buildServer(req) {
  const server = new McpServer({ name: 'apos-spike', version: '0.0.1' });
  server.registerTool('whoami', {
    description: 'Report what Apostrophe knows about this request',
    inputSchema: { text: z.string() }
  }, async ({ text }) => ({
    content: [ { type: 'text', text: JSON.stringify({
      echo: text, mode: req.mode, locale: req.locale, hasUser: !!req.user,
      sessionPresent: !!req.session, csrfExempt: !!req.csrfExempt, bodyParsed: typeof req.body
    }) } ]
  }));
  return server;
}

test.before(async () => {
  apos = await t.create({
    root: { filename: path.join(__dirname, '..', 'app.js'), require },
    modules: {
      'church-site': { options: { site: require('../sites/la-grange/config.js') } },
      'mcp-spike': {
        extend: '@apostrophecms/module',
        options: { csrfExceptions: [ '/mcp' ] },
        routes(self) {
          return {
            post: {
              '/mcp': [ async (req, res) => {
                const server = buildServer(req);
                const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
                res.on('close', () => { transport.close(); server.close(); });
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
              } ]
            },
            get: {
              '/mcp': [ (req, res) => res.status(405).json({ error: 'stateless: no GET stream' }) ]
            }
          };
        }
      }
    }
  });
});
test.after(async () => { console.log('\n=== RESULTS ===\n' + out.join('\n')); await t.destroy(apos); });

test('mcp', async () => {
  const base = apos.http.getBase();
  log('base', base);
  const insp = path.join('/tmp/insp/node_modules/.bin/mcp-inspector');
  const run = (...a) => new Promise(resolve => {
    const r = require('node:child_process').execFile(insp, [ '--cli', base + '/mcp', '--transport', 'http', ...a ], { encoding: 'utf8', timeout: 60000, cwd: '/tmp/insp', env: { ...process.env, NO_PROXY: '*', no_proxy: '*', HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' } }, (err, so, se) => resolve((so || '') + (se || '') + ' [exit ' + (err ? err.code : 0) + ']'));
  });
  log('inspector tools/list', (await run('--method', 'tools/list')).replace(/\s+/g, ' ').slice(0, 400));
  log('inspector tools/call', (await run('--method', 'tools/call', '--tool-name', 'whoami', '--tool-arg', 'text=hello')).replace(/\s+/g, ' ').slice(0, 500));
  // raw checks
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } };
  const hdr = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  let r = await fetch(base + '/mcp', { method: 'POST', headers: hdr, body: JSON.stringify(init) });
  log('raw initialize', r.status + ' ' + r.headers.get('content-type') + ' ' + (await r.text()).slice(0, 120));
  r = await fetch(base + '/mcp', { method: 'GET', headers: hdr });
  log('raw GET', r.status);
  // a request carrying a session cookie but no CSRF header
  const jar = await fetch(base + '/'); const cookie = (jar.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
  log('session cookie issued on /', cookie ? 'yes' : 'no');
  r = await fetch(base + '/mcp', { method: 'POST', headers: { ...hdr, cookie }, body: JSON.stringify(init) });
  log('POST /mcp with session cookie, no CSRF header', r.status);
  // big body
  r = await fetch(base + '/mcp', { method: 'POST', headers: hdr, body: JSON.stringify({ ...init, params: { ...init.params, pad: 'x'.repeat(2e6) } }) });
  log('2 MB body', r.status);
  // locale prefix
  r = await fetch(base + '/es/mcp', { method: 'POST', headers: hdr, body: JSON.stringify(init) });
  log('/es/mcp', r.status);
});
