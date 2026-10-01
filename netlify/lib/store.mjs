// Stockage clé/valeur JSON.
// En production : Netlify Blobs (aucune base de données externe à gérer).
// En local (npm run dev) : fichiers JSON dans le dossier LOCAL_DATA_DIR.
import fs from "node:fs/promises";
import path from "node:path";
import { getStore } from "@netlify/blobs";

function netlifyStore() {
  const s = getStore({ name: "menu-bocs", consistency: "strong" });
  return {
    get: (key) => s.get(key, { type: "json" }),
    set: (key, value) => s.setJSON(key, value),
    del: (key) => s.delete(key),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
  };
}

function fileStore(dir) {
  const file = (key) => path.join(dir, encodeURIComponent(key) + ".json");
  return {
    async get(key) {
      try {
        return JSON.parse(await fs.readFile(file(key), "utf8"));
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(value, null, 2));
    },
    async del(key) {
      await fs.rm(file(key), { force: true });
    },
    async list(prefix) {
      let names = [];
      try {
        names = await fs.readdir(dir);
      } catch {
        return [];
      }
      return names
        .filter((n) => n.endsWith(".json"))
        .map((n) => decodeURIComponent(n.slice(0, -5)))
        .filter((k) => k.startsWith(prefix));
    },
  };
}

export function db() {
  return process.env.LOCAL_DATA_DIR ? fileStore(process.env.LOCAL_DATA_DIR) : netlifyStore();
}
