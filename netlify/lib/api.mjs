import crypto from "node:crypto";
import { db } from "./store.mjs";

const DEFAULT_SETTINGS = {
  organisation: "BOCS",
  organisationLong: "Bureau Opérationnel de Coordination et de Suivi",
  eventTitle: "Atelier — Module Ministériel",
  ministry: "Ministère de l'Agriculture, de la Souveraineté Alimentaire et de l'Élevage",
  ministryShort: "MASAE",
  eventDate: "",
  location: "",
  welcome:
    "Bienvenue au BOCS. Merci de renseigner vos informations et de choisir votre plat pour le déjeuner de l'atelier.",
  open: true,
};

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

// ---------- utilitaires ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const fail = (message, status = 400) => json({ error: message }, status);

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function clean(value, max = 120) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalise(value) {
  return clean(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ---------- données ----------
async function getSettings(store) {
  return { ...DEFAULT_SETTINGS, ...((await store.get("settings")) || {}) };
}
async function getDishes(store) {
  return (await store.get("dishes")) || [];
}
async function getOrders(store) {
  const keys = await store.list("orders/");
  const orders = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean);
  return orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- authentification admin ----------
function secret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "";
}

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function isAdmin(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [data, sig] = token.split(".");
  if (!data || !sig || !secret()) return false;
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

function passwordMatches(given) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(String(given ?? ""))), Buffer.from(sha(expected)));
}

// ---------- routes ----------
export async function handle(req) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const method = req.method.toUpperCase();
  const store = db();

  try {
    // ----- Public -----
    if (route === "/public" && method === "GET") {
      const [settings, dishes] = await Promise.all([getSettings(store), getDishes(store)]);
      return json({
        settings,
        dishes: dishes
          .filter((d) => d.available)
          .map(({ id, name, description }) => ({ id, name, description })),
      });
    }

    if (route === "/orders" && method === "POST") {
      const input = await body(req);
      const nom = clean(input.nom, 80);
      const prenom = clean(input.prenom, 80);
      const structure = clean(input.structure, 160);
      if (!nom || !prenom || !structure) return fail("Merci de renseigner votre nom, prénom et structure.");

      const [settings, dishes] = await Promise.all([getSettings(store), getDishes(store)]);
      if (!settings.open) return fail("Les inscriptions sont fermées pour cet atelier.", 403);
      const dish = dishes.find((d) => d.id === input.dishId && d.available);
      if (!dish) return fail("Ce plat n'est plus disponible. Merci d'en choisir un autre.", 409);

      // Une personne (nom + prénom + structure) = un choix : une nouvelle soumission met à jour l'ancienne.
      const id = sha(`${normalise(nom)}|${normalise(prenom)}|${normalise(structure)}`).slice(0, 24);
      const key = `orders/${id}`;
      const existing = await store.get(key);
      const now = new Date().toISOString();
      const order = {
        id,
        receipt: `${clean(settings.organisation, 12).toUpperCase() || "BOCS"}-${id.slice(0, 8).toUpperCase()}`,
        nom: nom.toUpperCase(),
        prenom,
        structure,
        dishId: dish.id,
        dishName: dish.name,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await store.set(key, order);
      return json({ order, updated: Boolean(existing), settings }, existing ? 200 : 201);
    }

    // ----- Admin -----
    if (route === "/admin/login" && method === "POST") {
      if (!process.env.ADMIN_PASSWORD)
        return fail("ADMIN_PASSWORD n'est pas configuré sur le serveur (variables d'environnement Netlify).", 500);
      const { password } = await body(req);
      if (!passwordMatches(password)) {
        await new Promise((r) => setTimeout(r, 600));
        return fail("Mot de passe incorrect.", 401);
      }
      return json({ token: signToken({ role: "admin", exp: Date.now() + TOKEN_TTL_MS }) });
    }

    if (route.startsWith("/admin/")) {
      if (!isAdmin(req)) return fail("Session expirée. Merci de vous reconnecter.", 401);

      if (route === "/admin/data" && method === "GET") {
        const [settings, dishes, orders] = await Promise.all([
          getSettings(store),
          getDishes(store),
          getOrders(store),
        ]);
        return json({ settings, dishes, orders });
      }

      if (route === "/admin/settings" && method === "PUT") {
        const input = await body(req);
        const current = await getSettings(store);
        const next = { ...current };
        for (const k of Object.keys(DEFAULT_SETTINGS)) {
          if (!(k in input)) continue;
          next[k] = k === "open" ? Boolean(input.open) : clean(input[k], k === "welcome" ? 600 : 200);
        }
        await store.set("settings", next);
        return json({ settings: next });
      }

      if (route === "/admin/dishes" && method === "POST") {
        const input = await body(req);
        const name = clean(input.name, 120);
        if (!name) return fail("Le nom du plat est obligatoire.");
        const dishes = await getDishes(store);
        const dish = {
          id: crypto.randomUUID().slice(0, 8),
          name,
          description: clean(input.description, 300),
          available: input.available !== false,
        };
        dishes.push(dish);
        await store.set("dishes", dishes);
        return json({ dish, dishes }, 201);
      }

      const dishMatch = route.match(/^\/admin\/dishes\/([\w-]+)$/);
      if (dishMatch && (method === "PUT" || method === "DELETE")) {
        const dishes = await getDishes(store);
        const index = dishes.findIndex((d) => d.id === dishMatch[1]);
        if (index === -1) return fail("Plat introuvable.", 404);
        if (method === "DELETE") {
          dishes.splice(index, 1);
        } else {
          const input = await body(req);
          const d = dishes[index];
          if ("name" in input) {
            const name = clean(input.name, 120);
            if (!name) return fail("Le nom du plat est obligatoire.");
            d.name = name;
          }
          if ("description" in input) d.description = clean(input.description, 300);
          if ("available" in input) d.available = Boolean(input.available);
        }
        await store.set("dishes", dishes);
        return json({ dishes });
      }

      if (route === "/admin/orders" && method === "DELETE") {
        const keys = await store.list("orders/");
        await Promise.all(keys.map((k) => store.del(k)));
        return json({ deleted: keys.length });
      }

      const orderMatch = route.match(/^\/admin\/orders\/([a-f0-9]+)$/);
      if (orderMatch && method === "DELETE") {
        await store.del(`orders/${orderMatch[1]}`);
        return json({ ok: true });
      }
    }

    return fail("Route inconnue.", 404);
  } catch (e) {
    console.error(e);
    return fail("Erreur serveur. Merci de réessayer.", 500);
  }
}
