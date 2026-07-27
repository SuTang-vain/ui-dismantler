import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '');
const generatedRoot = join(root, '');
const manualRoot = join(root, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

function safeCandidate(base, pathname) {
  const candidate = normalize(join(base, pathname === '/' ? 'index.html' : pathname));
  return candidate.startsWith(base) ? candidate : null;
}

createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const generated = safeCandidate(generatedRoot, pathname);
  const manual = safeCandidate(manualRoot, pathname);
  const file = generated && existsSync(generated) ? generated : manual && existsSync(manual) ? manual : join(generatedRoot, 'index.html');
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    const body = await readFile(join(generatedRoot, 'index.html'));
    res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
    res.end(body);
  }
}).listen(Number(process.env.PORT ?? 4197), '127.0.0.1', () => console.log(`auto-router YesPlayMusic shell: http://127.0.0.1:${process.env.PORT ?? 4197}`));
