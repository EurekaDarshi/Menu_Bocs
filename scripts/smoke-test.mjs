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
const awaKey = r.body.order.editKey;
r = await call("POST", "/orders", { nom: "diop ", prenom: "awa", structure: "masae", dishId: yassa });
assert.equal(r.status, 409, "même identité depuis un autre téléphone → refusé (homonyme possible)");
r = await call("POST", "/orders", { nom: "diop ", prenom: "awa", structure: "masae", dishId: yassa, editKey: awaKey });
assert.equal(r.status, 200, "même personne (clé) → mise à jour");
assert.equal(r.body.updated, true);
// Correction du nom via « Modifier mon choix » : l'ancienne inscription est remplacée
r = await call("POST", "/orders", { nom: "Sow", prenom: "Binta", structure: "BOCS", dishId: thieb });
const sow = r.body.order;
assert.ok(sow.editKey);
r = await call("POST", "/orders", { nom: "Sow", prenom: "Bineta", structure: "BOCS", dishId: yassa, replace: { id: sow.id, key: "mauvaise" } });
const bineta = r.body.order;
r = await call("POST", "/orders", { nom: "Sow", prenom: "Bineta", structure: "BOCS", dishId: yassa, editKey: bineta.editKey, replace: { id: sow.id, key: sow.editKey } });
token = (await call("POST", "/admin/login", { password: "secret-test" })).body.token;
r = await call("GET", "/admin/data");
assert.deepEqual(r.body.orders.filter((o) => o.nom === "SOW").map((o) => o.prenom), ["Bineta"], "ancienne inscription remplacée, clé vérifiée");
assert.ok(r.body.orders.every((o) => !("editKey" in o)), "clé jamais exposée à l'admin");
await call("DELETE", `/admin/orders/${bineta.id}`);
token = "";

r = await call("POST", "/orders", { nom: "Ndiaye", prenom: "Moussa", structure: "BOCS", dishId: mafe });
assert.equal(r.status, 409, "plat indisponible refusé");
// Homonymes : la fonction (facultative) distingue deux personnes
r = await call("POST", "/orders", { nom: "Diallo", prenom: "Mamadou", structure: "MASAE", dishId: thieb });
const d1 = r.body.order;
r = await call("POST", "/orders", { nom: "Diallo", prenom: "Mamadou", structure: "MASAE", fonction: "Chef de division", dishId: yassa });
assert.equal(r.status, 201, "homonyme avec fonction = nouvelle inscription");
assert.notEqual(r.body.order.id, d1.id);
assert.equal(r.body.order.fonction, "Chef de division");
token = (await call("POST", "/admin/login", { password: "secret-test" })).body.token;
await call("DELETE", `/admin/orders/${d1.id}`);
await call("DELETE", `/admin/orders/${r.body.order.id}`);
token = "";

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
r = await call("PUT", `/admin/dishes/${thieb}`, { name: "Thiéboudienne (riz au poisson)" });
r = await call("GET", "/admin/data");
assert.ok(r.body.orders.some((o) => o.dishName === "Thiéboudienne (riz au poisson)"), "plat renommé à jour dans la liste");
r = await call("DELETE", `/admin/dishes/${mafe}`);
assert.equal(r.body.dishes.length, 2);
r = await call("DELETE", "/admin/orders");
assert.equal(r.body.deleted, 2);

token = r.body.token = "eyJleHAiOjF9.faux";
r = await call("GET", "/admin/data");
assert.equal(r.status, 401, "jeton falsifié refusé");

// Limitation des tentatives de connexion
for (let i = 0; i < 8; i++) await call("POST", "/admin/login", { password: "faux" });
r = await call("POST", "/admin/login", { password: "secret-test" });
assert.equal(r.status, 429, "connexion bloquée après 8 échecs");

await fs.rm(process.env.LOCAL_DATA_DIR, { recursive: true });
console.log("✔ Tous les tests API passent");
