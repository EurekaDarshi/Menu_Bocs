// Serveur local : sert /public et route /api/* vers la même logique que la fonction Netlify.
// Usage : npm run dev  (mot de passe admin local par défaut : "admin")
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.LOCAL_DATA_DIR ??= path.join(root, ".data");
process.env.ADMIN_PASSWORD ??= "admin";
const { handle } = await import("../netlify/lib/api.mjs");

const CSP = (await fs.readFile(path.join(root, "netlify.toml"), "utf8")).match(/Content-Security-Policy = "([^"]+)"/)[1];
const PORT = Number(process.env.PORT) || 8888;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const response = await handle(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = path.join(root, "public", path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[path.extname(file)] || "application/octet-stream",
        // même politique de sécurité qu'en production (netlify.toml)
        "content-security-policy": CSP,
      });
      res.end(data);
    } catch {
      res.writeHead(404).end("Not found");
    }
  })
  .listen(PORT, () => console.log(`Menu BOCS → http://localhost:${PORT}  (admin : ${process.env.ADMIN_PASSWORD})`));
