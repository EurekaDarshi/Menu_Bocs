// Test rapide de l'API avec un stockage temporaire.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.LOCAL_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "menu-bocs-"));
process.env.ADMIN_PASSWORD = "secret-test";
const { handle } = await import("../netlify/lib/api.mjs");

let token = "";
async function call(method, route, data) {
  const res = await handle(
    new Request(`http://x/api${route}`, {
      method,
      headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) },
      body: data ? JSON.stringify(data) : undefined,
    })
  );
  return { status: res.status, body: await res.json() };
}

let r = await call("POST", "/admin/login", { password: "faux" });
assert.equal(r.status, 401);
r = await call("GET", "/admin/data");
assert.equal(r.status, 401);

r = await call("POST", "/admin/login", { password: "secret-test" });
assert.equal(r.status, 200);
token = r.body.token;

r = await call("POST", "/admin/dishes", { name: "Thiéboudienne", description: "Riz au poisson" });
const thieb = r.body.dish.id;
r = await call("POST", "/admin/dishes", { name: "Yassa poulet" });
const yassa = r.body.dish.id;
r = await call("POST", "/admin/dishes", { name: "Mafé", available: false });
const mafe = r.body.dish.id;

token = "";
r = await call("GET", "/public");
assert.deepEqual(r.body.dishes.map((d) => d.name), ["Thiéboudienne", "Yassa poulet"]);

r = await call("POST", "/orders", { nom: "Diop", prenom: "Awa", structure: "MASAE", dishId: thieb });
assert.equal(r.status, 201);
assert.equal(r.body.order.nom, "DIOP");
assert.match(r.body.order.receipt, /^BOCS-[A-F0-9]{8}$/);
r = await call("POST", "/orders", { nom: "diop ", prenom: "awa", structure: "masae", dishId: yassa });
assert.equal(r.status, 200, "même personne → mise à jour");
assert.equal(r.body.updated, true);
r = await call("POST", "/orders", { nom: "Ndiaye", prenom: "Moussa", structure: "BOCS", dishId: mafe });
assert.equal(r.status, 409, "plat indisponible refusé");
r = await call("POST", "/orders", { nom: "", prenom: "x", structure: "y", dishId: thieb });
assert.equal(r.status, 400);
r = await call("POST", "/orders", { nom: "Ndiaye", prenom: "Moussa", structure: "BOCS", dishId: thieb });
assert.equal(r.status, 201);

r = await call("POST", "/admin/login", { password: "secret-test" });
token = r.body.token;
r = await call("GET", "/admin/data");
assert.equal(r.body.orders.length, 2);
assert.equal(r.body.orders[0].dishName, "Yassa poulet");

r = await call("PUT", "/admin/settings", { open: false, location: "Salle de conférence" });
assert.equal(r.body.settings.open, false);
token = "";
r = await call("POST", "/orders", { nom: "Fall", prenom: "Ibou", structure: "BOCS", dishId: thieb });
assert.equal(r.status, 403, "inscriptions fermées");

r = await call("POST", "/admin/login", { password: "secret-test" });
token = r.body.token;
r = await call("PUT", `/admin/dishes/${mafe}`, { available: true, name: "Mafé bœuf" });
assert.equal(r.body.dishes.find((d) => d.id === mafe).name, "Mafé bœuf");
r = await call("DELETE", `/admin/dishes/${mafe}`);
assert.equal(r.body.dishes.length, 2);
r = await call("DELETE", "/admin/orders");
assert.equal(r.body.deleted, 2);

token = r.body.token = "eyJleHAiOjF9.faux";
r = await call("GET", "/admin/data");
assert.equal(r.status, 401, "jeton falsifié refusé");

await fs.rm(process.env.LOCAL_DATA_DIR, { recursive: true });
console.log("✔ Tous les tests API passent");
