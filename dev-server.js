// Tiny local server that mimics Vercel: static files + /api/shelf + the /bookshelf rewrites.
// `npm run dev` → http://localhost:3000/bookshelf
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import shelf from './api/shelf.js';

const root = new URL('.', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/shelf') return shelf(req, res);
  const file = pathname === '/' || pathname.startsWith('/bookshelf') ? '/index.html' : pathname;
  try {
    const body = await readFile(join(root, file));
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(process.env.PORT || 3000, () => console.log(`http://localhost:${process.env.PORT || 3000}/bookshelf`));
