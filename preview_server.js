const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const grokService = require('./jarvis-agent/grok_service.js');
const axios = require('./jarvis-agent/node_modules/axios');

const PORT = process.env.PORT || 5173;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  let reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let reqPath = decodeURI(reqUrl.pathname);

  // ─── API ENDPOINTS FOR WEB BROWSER MODE ───────────────────────
  if (reqPath.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (reqPath === '/api/sysinfo') {
      const cpus = os.cpus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        uptime: os.uptime(),
        cpuModel: cpus[0]?.model || 'Host Processor',
        cpuCount: cpus.length,
        userInfo: os.userInfo()?.username || 'Operator',
        homeDir: os.homedir(),
        networkInterfaces: os.networkInterfaces(),
      }));
      return;
    }

    if (reqPath === '/api/grok/config') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(grokService.getConfig()));
        return;
      }
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(grokService.saveConfig(parsed)));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (reqPath === '/api/grok/test') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const testRes = await grokService.testKey(parsed.apiKey, parsed.model);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(testRes));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (reqPath === '/api/grok/chat') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const chatRes = await grokService.chat(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(chatRes));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (reqPath === '/api/fetch') {
      const targetUrl = reqUrl.searchParams.get('url');
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing url param' }));
        return;
      }
      try {
        const fetchRes = await axios.get(targetUrl, {
          headers: { 'User-Agent': 'JenniferAssistant/1.0 (Windows NT 10.0; Win64; x64)' },
          timeout: 10000,
          validateStatus: () => true,
        });
        res.writeHead(fetchRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: fetchRes.status, data: fetchRes.data }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 500, error: err.message }));
      }
      return;
    }
  }

  // ─── STATIC FILE SERVING ──────────────────────────────────────
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(ROOT, reqPath);

  // Security check to prevent directory traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // If path is a directory, look for index.html inside
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Preview Server] Running at http://localhost:${PORT}/`);
  console.log(`[Preview Server] Portfolio: http://localhost:${PORT}/index.html`);
  console.log(`[Preview Server] Jarvis HUD: http://localhost:${PORT}/jarvis-agent/renderer/index.html`);
});
