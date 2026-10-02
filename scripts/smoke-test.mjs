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

r = await call("POST", "/orders", { nom: "Diop", prenom: "Awa", structure: "MASAE", telephone: "77 123 45 67", dishId: thieb });
assert.equal(r.status, 201);
assert.equal(r.body.order.nom, "DIOP");
assert.equal(r.body.order.telephone, "77 123 45 67");
assert.match(r.body.order.receipt, /^BOCS-[A-F0-9]{8}$/);
const awa = r.body.order;

// Même numéro (écrit autrement) : le choix et les informations sont mis à jour
r = await call("POST", "/orders", { nom: "Diop", prenom: "Aïssatou", structure: "MASAE", telephone: "+221 771234567", dishId: yassa });
assert.equal(r.status, 200, "même numéro → mise à jour");
assert.equal(r.body.updated, true);
assert.equal(r.body.order.id, awa.id);
assert.equal(r.body.order.prenom, "Aïssatou");
r = await call("POST", "/orders", { nom: "Diop", prenom: "Aïssatou", structure: "MASAE", telephone: "00221 77 123 45 67", dishId: yassa });
assert.equal(r.body.order.id, awa.id, "format international reconnu");

// Homonyme avec un autre numéro : deux inscriptions distinctes
r = await call("POST", "/orders", { nom: "Diop", prenom: "Aïssatou", structure: "MASAE", telephone: "78 000 00 00", dishId: thieb });
assert.equal(r.status, 201, "homonyme = nouvelle inscription");
const homonyme = r.body.order;

// Numéro étranger accepté, numéro invalide ou absent refusé
r = await call("POST", "/orders", { nom: "Martin", prenom: "Paul", structure: "Partenaire", telephone: "+33 6 12 34 56 78", dishId: thieb });
assert.equal(r.status, 201);
assert.equal(r.body.order.telephone, "+33612345678");
const etranger = r.body.order;
r = await call("POST", "/orders", { nom: "Fall", prenom: "Ibou", structure: "BOCS", telephone: "123", dishId: thieb });
assert.equal(r.status, 400, "numéro invalide refusé");
r = await call("POST", "/orders", { nom: "Fall", prenom: "Ibou", structure: "BOCS", dishId: thieb });
assert.equal(r.status, 400, "numéro obligatoire");

r = await call("POST", "/orders", { nom: "Ndiaye", prenom: "Moussa", structure: "BOCS", telephone: "76 111 22 33", dishId: mafe });
assert.equal(r.status, 409, "plat indisponible refusé");
r = await call("POST", "/orders", { nom: "", prenom: "x", structure: "y", telephone: "76 111 22 33", dishId: thieb });
assert.equal(r.status, 400);
r = await call("POST", "/orders", { nom: "Ndiaye", prenom: "Moussa", structure: "BOCS", telephone: "76 111 22 33", dishId: thieb });
assert.equal(r.status, 201);

token = (await call("POST", "/admin/login", { password: "secret-test" })).body.token;
await call("DELETE", `/admin/orders/${homonyme.id}`);
await call("DELETE", `/admin/orders/${etranger.id}`);
token = "";

r = await call("POST", "/admin/login", { password: "secret-test" });
token = r.body.token;
r = await call("GET", "/admin/data");
assert.equal(r.body.orders.length, 2);
assert.equal(r.body.orders[0].dishName, "Yassa poulet");

r = await call("PUT", "/admin/settings", { open: false, location: "Salle de conférence" });
assert.equal(r.body.settings.open, false);
token = "";
r = await call("POST", "/orders", { nom: "Diop", prenom: "Awa", structure: "MASAE", telephone: "77 123 45 67", dishId: thieb });
assert.equal(r.status, 403, "choix clôturés : plus de modification possible");

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
