import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const caseRoot = normalize(join(fileURLToPath(new URL(".", import.meta.url)), ".."));
const targetIndex = join(caseRoot, "generated-review-target", "index.html");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  const candidate = normalize(join(caseRoot, pathname.replace(/^\/+/, "")));
  const file = candidate.startsWith(caseRoot) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : targetIndex;
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
});
server.listen(4174, "127.0.0.1", () => console.log("vue-xs-admin review target http://127.0.0.1:4174"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exitCode = 0));
