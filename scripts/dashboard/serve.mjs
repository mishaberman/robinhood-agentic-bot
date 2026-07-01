import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const docsDir = join(root, "docs");
const port = Number(process.env.DASHBOARD_PORT || process.argv[2] || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".jsonl": "application/jsonl; charset=utf-8",
  ".svg": "image/svg+xml"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const relative = clean === "/" ? "/index.html" : clean;
  return join(docsDir, relative);
}

async function resolveFile(urlPath) {
  let path = safePath(urlPath);
  const info = await stat(path).catch(() => null);
  if (info?.isDirectory()) {
    path = join(path, "index.html");
  }
  return path;
}

const server = createServer(async (request, response) => {
  try {
    const path = await resolveFile(request.url || "/");
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Dashboard: http://localhost:${port}`);
});
