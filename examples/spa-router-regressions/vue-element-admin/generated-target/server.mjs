import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(new URL('./public/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const candidate = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  const file = candidate.startsWith(root) ? candidate : join(root, 'index.html');
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); }
  catch { const body = await readFile(join(root, 'index.html')); res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' }); res.end(body); }
}).listen(Number(process.env.PORT ?? 9528), '127.0.0.1', () => console.log(`generated Vue Element Admin target: http://127.0.0.1:${process.env.PORT ?? 9528}`));
