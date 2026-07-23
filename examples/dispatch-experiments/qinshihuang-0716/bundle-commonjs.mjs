import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve, posix } from "node:path";

const root = resolve(new URL(".", import.meta.url).pathname);
const build = join(root, ".build-cjs");
const output = join(root, "lib/src/qinshihuang.js");

async function collect(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collect(absolute));
    else if (entry.name.endsWith(".js")) result.push(absolute);
  }
  return result;
}

const files = await collect(build);
const modules = [];
for (const file of files) {
  const id = relative(build, file).split("\\").join("/");
  const source = await readFile(file, "utf8");
  modules.push(`${JSON.stringify(id)}: function(module, exports, require) {\n${source}\n}`);
}

const bundle = `(function(global){\n"use strict";\nconst modules = {\n${modules.join(",\n")}\n};\nconst cache = Object.create(null);\nfunction normalize(from, request) {\n  if (!request.startsWith(".")) return request;\n  const base = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "";\n  const parts = (base + request).split("/");\n  const stack = [];\n  for (const part of parts) { if (!part || part === ".") continue; if (part === "..") stack.pop(); else stack.push(part); }\n  let id = stack.join("/");\n  if (!id.endsWith(".js")) id += ".js";\n  return id;\n}\nfunction load(id) {\n  if (cache[id]) return cache[id].exports;\n  const factory = modules[id];\n  if (!factory) throw new Error("Unknown bundled module: " + id);\n  const module = { exports: {} };\n  cache[id] = module;\n  factory(module, module.exports, function(request){ return load(normalize(id, request)); });\n  return module.exports;\n}\nconst entry = load("index.js");\nglobal.QinShihuangDispatch = { mount: entry.mount, create: entry.create };\n})(window);\n`;
await writeFile(output, bundle, "utf8");
