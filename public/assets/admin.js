(function () {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "menu-bocs:admin-token";
  const SETTING_FIELDS = ["eventTitle", "eventDate", "ministry", "ministryShort", "location", "organisation", "organisationLong", "welcome"];
  let state = { settings: {}, dishes: [], orders: [] };
  let editingId = null;

  // ---------- utilitaires ----------
  const token = {
    get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ } },
    clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
  };

  let toastTimer;
  function toast(msg, isError) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.toggle("error", Boolean(isError));
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      ...options,
      headers: { "content-type": "application/json", authorization: `Bearer ${token.get() || ""}` },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/admin/login") {
      logout();
      throw new Error(data.error || "Session expirée.");
    }
    if (!res.ok) throw new Error(data.error || "Erreur inattendue.");
    return data;
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null) node.append(c);
    return node;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

  function dishCounts() {
    const counts = new Map();
    for (const d of state.dishes) counts.set(d.id, { name: d.name, available: d.available, count: 0 });
    for (const o of state.orders) {
      if (!counts.has(o.dishId)) counts.set(o.dishId, { name: `${o.dishName} (retiré)`, available: false, count: 0 });
      counts.get(o.dishId).count++;
    }
    return [...counts.entries()].map(([id, v]) => ({ id, ...v }));
  }

  // ---------- vues ----------
  function showLogin() {
    $("login-view").hidden = false;
    $("dash-view").hidden = true;
    $("logout-btn").hidden = true;
    $("password").focus();
  }

  function showDash() {
    $("login-view").hidden = true;
    $("dash-view").hidden = false;
    $("logout-btn").hidden = false;
  }

  function logout() {
    token.clear();
    showLogin();
  }

  function render() {
    const { settings, dishes, orders } = state;
    $("h-event").textContent = settings.eventTitle;
    $("h-ministry").textContent = `Tableau de bord ${settings.ministryShort}`;
    $("c-dishes").textContent = dishes.length;
    $("c-orders").textContent = orders.length;
    $("s-total").textContent = orders.length;
    $("s-dishes").textContent = dishes.filter((d) => d.available).length;
    $("s-open").textContent = settings.open ? "Ouvert" : "Fermé";
    $("s-open").style.color = settings.open ? "var(--green)" : "var(--danger)";
    $("toggle-open").textContent = settings.open ? "Fermer les choix" : "Ouvrir les choix";
    $("toggle-open").className = `btn btn-sm ${settings.open ? "btn-danger" : "btn-primary"}`;
    renderBars();
    renderDishes();
    renderFilter();
    renderOrders();
    renderSettings();
  }

  function renderBars() {
    const rows = dishCounts().filter((r) => r.available || r.count);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const box = $("bars");
    box.replaceChildren();
    if (!rows.length) {
      box.append(el("p", { class: "empty" }, "Aucun plat pour le moment. Ajoutez-en dans l'onglet « Plats »."));
      return;
    }
    for (const r of rows.sort((a, b) => b.count - a.count)) {
      const fill = el("div", { class: "bar-fill" });
      fill.style.width = `${(r.count / max) * 100}%`;
      box.append(
        el("div", { class: "bar-row" },
          el("div", { class: "bar-name", title: r.name }, r.name, r.available ? null : el("small", {}, " · indisponible")),
          el("div", { class: "bar-track" }, fill),
          el("div", { class: "bar-val" }, String(r.count))
        )
      );
    }
  }

  function renderDishes() {
    const list = $("dish-list");
    list.replaceChildren();
    if (!state.dishes.length) {
      list.append(el("p", { class: "empty" }, "Aucun plat. Utilisez le formulaire ci-dessus pour en ajouter."));
      return;
    }
    const counts = Object.fromEntries(dishCounts().map((r) => [r.id, r.count]));
    for (const d of state.dishes) {
      const toggle = el("input", { type: "checkbox", checked: d.available, onchange: (e) => updateDish(d.id, { available: e.target.checked }) });
      list.append(
        el("div", { class: `dish-item${d.available ? "" : " off"}` },
          el("div", { class: "dish-info" }, el("b", {}, d.name), d.description ? el("span", {}, d.description) : null),
          el("span", { class: `pill${d.available ? "" : " off"}` }, `${counts[d.id] || 0} choix`),
          el("div", { class: "dish-actions" },
            el("label", { class: "switch", title: "Disponible" }, toggle, el("span", { class: "track" })),
            el("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => startEdit(d) }, "Modifier"),
            el("button", { class: "btn btn-danger btn-sm", type: "button", onclick: () => deleteDish(d) }, "Supprimer")
          )
        )
      );
    }
  }

  function renderFilter() {
    const select = $("filter-dish");
    const current = select.value;
    select.length = 1;
    for (const r of dishCounts()) select.add(new Option(`${r.name} (${r.count})`, r.id));
    select.value = [...select.options].some((o) => o.value === current) ? current : "";
  }

  function renderOrders() {
    const q = $("search").value.trim().toLowerCase();
    const dishId = $("filter-dish").value;
    const body = $("orders-body");
    body.replaceChildren();
    const rows = state.orders.filter(
      (o) =>
        (!dishId || o.dishId === dishId) &&
        (!q || `${o.nom} ${o.prenom} ${o.structure} ${o.receipt}`.toLowerCase().includes(q))
    );
    if (!rows.length) {
      body.append(el("tr", {}, el("td", { colspan: 7, class: "empty" }, state.orders.length ? "Aucun résultat." : "Aucune inscription pour le moment.")));
      return;
    }
    rows.forEach((o, i) => {
      const del = el("button", { class: "icon-btn", type: "button", title: "Supprimer", onclick: () => deleteOrder(o) });
      del.innerHTML = TRASH;
      body.append(
        el("tr", {},
          el("td", { class: "mono", "data-label": "N°" }, String(i + 1)),
          el("td", { class: "cell-name" }, el("b", {}, `${o.nom} ${o.prenom}`)),
          el("td", { class: "wrap-cell", "data-label": "Structure" }, o.structure),
          el("td", { class: "cell-dish", "data-label": "Plat" }, o.dishName),
          el("td", { class: "mono", "data-label": "Date" }, fmtDate(o.updatedAt)),
          el("td", { class: "mono", "data-label": "Reçu" }, o.receipt),
          el("td", { class: "cell-del" }, del)
        )
      );
    });
  }

  function renderSettings() {
    for (const k of SETTING_FIELDS) {
      const input = $(`st-${k}`);
      if (document.activeElement !== input) input.value = state.settings[k] || "";
    }
    $("st-open").checked = Boolean(state.settings.open);
  }

  // ---------- actions ----------
  async function refresh() {
    try {
      state = await api("/admin/data");
      showDash();
      render();
    } catch (e) {
      if (token.get()) toast(e.message, true);
      if ($("dash-view").hidden) showLogin();
    }
  }

  async function updateDish(id, patch) {
    try {
      const { dishes } = await api(`/admin/dishes/${id}`, { method: "PUT", body: patch });
      state.dishes = dishes;
      render();
      toast("Plat mis à jour");
    } catch (e) {
      toast(e.message, true);
      render();
    }
  }

  async function deleteDish(d) {
    if (!confirm(`Supprimer le plat « ${d.name} » ?\nLes inscriptions existantes sont conservées.`)) return;
    try {
      const { dishes } = await api(`/admin/dishes/${d.id}`, { method: "DELETE" });
      state.dishes = dishes;
      if (editingId === d.id) resetDishForm();
      render();
      toast("Plat supprimé");
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteOrder(o) {
    if (!confirm(`Supprimer l'inscription de ${o.prenom} ${o.nom} ?`)) return;
    try {
      await api(`/admin/orders/${o.id}`, { method: "DELETE" });
      state.orders = state.orders.filter((x) => x.id !== o.id);
      render();
      toast("Inscription supprimée");
    } catch (e) {
      toast(e.message, true);
    }
  }

  function startEdit(d) {
    editingId = d.id;
    $("d-name").value = d.name;
    $("d-desc").value = d.description || "";
    $("d-available").checked = d.available;
    $("dish-form-title").textContent = "Modifier le plat";
    $("dish-submit").textContent = "Enregistrer";
    $("dish-cancel").hidden = false;
    $("d-name").focus();
    $("dish-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetDishForm() {
    editingId = null;
    $("dish-form").reset();
    $("d-available").checked = true;
    $("dish-form-title").textContent = "Ajouter un plat";
    $("dish-submit").textContent = "Ajouter le plat";
    $("dish-cancel").hidden = true;
  }

  // ---------- exports ----------
  function exportRows() {
    const s = state.settings;
    const counts = dishCounts().filter((r) => r.count || r.available);
    const people = [...state.orders].sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr", { sensitivity: "base" })
    );
    const rows = [
      [`${s.organisation} - ${s.eventTitle}`],
      [`Ministère accueilli : ${s.ministry} (${s.ministryShort})`],
    ];
    if (s.eventDate) rows.push([`Date : ${s.eventDate}`]);
    if (s.location) rows.push([`Lieu : ${s.location}`]);
    rows.push([`Fichier généré le ${new Date().toLocaleString("fr-FR")}`], []);
    rows.push(["RÉCAPITULATIF PAR PLAT"], ["Plat", "Nombre"]);
    for (const r of counts) rows.push([r.name, r.count]);
    rows.push(["TOTAL", state.orders.length], []);
    const listStart = rows.length;
    rows.push(["LISTE DES PARTICIPANTS"], ["N°", "Nom", "Prénom", "Structure", "Plat choisi", "Date d'inscription", "N° de reçu"]);
    people.forEach((o, i) => rows.push([i + 1, o.nom, o.prenom, o.structure, o.dishName, fmtDate(o.updatedAt), o.receipt]));
    return { rows, listStart };
  }

  function fileName(ext) {
    const s = state.settings;
    const slug = `${s.organisation}-${s.ministryShort}-menus`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-");
    return `${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  function exportXlsx() {
    if (!window.XLSX) return toast("Module Excel en cours de chargement, réessayez.", true);
    const { rows, listStart } = exportRows();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 40 }, { wch: 28 }, { wch: 18 }, { wch: 16 }];
    ws["!merges"] = rows
      .map((r, i) => (r.length === 1 ? { s: { r: i, c: 0 }, e: { r: i, c: 6 } } : null))
      .filter(Boolean);
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: listStart + 1, c: 0 }, e: { r: rows.length - 1, c: 6 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Menus");
    XLSX.writeFile(wb, fileName("xlsx"));
  }

  function exportPdf() {
    if (!window.jspdf) return toast("Module PDF en cours de chargement, réessayez.", true);
    const s = state.settings;
    const t = (v) => String(v ?? "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-");
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 14;
    let y = M;

    // En-tête
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(10, 92, 59);
    doc.text(t(`${s.organisation} - ${s.organisationLong}`), M, y + 4);
    doc.setFontSize(12).setTextColor(0);
    doc.text(t(s.eventTitle), M, y + 11);
    doc.setFont("helvetica", "normal").setFontSize(10);
    const info = [`Ministère accueilli : ${s.ministry} (${s.ministryShort})`];
    if (s.eventDate) info.push(`Date : ${s.eventDate}`);
    if (s.location) info.push(`Lieu : ${s.location}`);
    info.push(`Liste éditée le ${new Date().toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}`);
    y += 17;
    for (const line of info) {
      const lines = doc.splitTextToSize(t(line), W - 2 * M);
      doc.text(lines, M, y);
      y += lines.length * 5;
    }
    y += 3;

    // Tableau générique avec retour à la ligne et saut de page
    function table(title, columns, rows, opts = {}) {
      const total = columns.reduce((n, c) => n + c.w, 0);
      const widths = columns.map((c) => (c.w / total) * (W - 2 * M));
      const pad = 2;
      const lineH = 4.6;
      const drawHeader = () => {
        doc.setFillColor(237, 244, 240).setDrawColor(160).setLineWidth(0.2);
        doc.rect(M, y, W - 2 * M, 8, "FD");
        doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(0);
        let x = M;
        columns.forEach((c, i) => {
          doc.text(t(c.label), c.align === "right" ? x + widths[i] - pad : x + pad, y + 5.4, { align: c.align || "left" });
          x += widths[i];
        });
        y += 8;
      };
      if (y + 24 > H - M) { doc.addPage(); y = M; }
      doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(10, 92, 59);
      doc.text(t(title), M, y + 4);
      y += 8;
      drawHeader();
      rows.forEach((row, r) => {
        doc.setFont("helvetica", opts.boldLast && r === rows.length - 1 ? "bold" : "normal").setFontSize(9.5).setTextColor(0);
        const cells = row.map((v, i) => doc.splitTextToSize(t(v), widths[i] - 2 * pad));
        const h = Math.max(...cells.map((c) => c.length)) * lineH + 3;
        if (y + h > H - M - 6) { doc.addPage(); y = M; drawHeader(); doc.setFont("helvetica", "normal").setFontSize(9.5); }
        let x = M;
        cells.forEach((lines, i) => {
          doc.setDrawColor(160).rect(x, y, widths[i], h);
          const c = columns[i];
          doc.text(lines, c.align === "right" ? x + widths[i] - pad : x + pad, y + 5, { align: c.align || "left" });
          x += widths[i];
        });
        y += h;
      });
      y += 8;
    }

    const counts = dishCounts().filter((r) => r.count || r.available);
    table(
      "Récapitulatif par plat",
      [{ label: "Plat", w: 80 }, { label: "Nombre", w: 20, align: "right" }],
      [...counts.map((r) => [r.name, String(r.count)]), ["TOTAL", String(state.orders.length)]],
      { boldLast: true }
    );

    const people = [...state.orders].sort((a, b) =>
      `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr", { sensitivity: "base" })
    );
    table(
      `Liste des participants (${people.length})`,
      [
        { label: "N°", w: 7 },
        { label: "Nom", w: 20 },
        { label: "Prénom", w: 20 },
        { label: "Structure", w: 34 },
        { label: "Plat", w: 26 },
        { label: "Émargement", w: 18 },
      ],
      people.map((o, i) => [String(i + 1), o.nom, o.prenom, o.structure, o.dishName, ""])
    );

    // Numéros de page
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(110);
      doc.text(`Page ${i} / ${pages}`, W - M, H - 7, { align: "right" });
    }
    doc.save(fileName("pdf"));
  }

  // ---------- événements ----------
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn");
    const err = $("login-error");
    err.hidden = true;
    btn.disabled = true;
    try {
      const { token: t } = await api("/admin/login", { method: "POST", body: { password: $("password").value } });
      token.set(t);
      $("password").value = "";
      await refresh();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("logout-btn").addEventListener("click", logout);

  document.querySelectorAll(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab.dataset.tab));
      if (tab.dataset.tab !== "settings") refresh();
    })
  );

  $("dish-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { name: $("d-name").value.trim(), description: $("d-desc").value.trim(), available: $("d-available").checked };
    if (!payload.name) return toast("Le nom du plat est obligatoire.", true);
    try {
      const data = editingId
        ? await api(`/admin/dishes/${editingId}`, { method: "PUT", body: payload })
        : await api("/admin/dishes", { method: "POST", body: payload });
      state.dishes = data.dishes;
      toast(editingId ? "Plat modifié" : "Plat ajouté");
      resetDishForm();
      render();
    } catch (ex) {
      toast(ex.message, true);
    }
  });
  $("dish-cancel").addEventListener("click", resetDishForm);

  $("search").addEventListener("input", renderOrders);
  $("filter-dish").addEventListener("change", renderOrders);

  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { open: $("st-open").checked };
    for (const k of SETTING_FIELDS) payload[k] = $(`st-${k}`).value.trim();
    try {
      const { settings } = await api("/admin/settings", { method: "PUT", body: payload });
      state.settings = settings;
      render();
      toast("Paramètres enregistrés");
    } catch (ex) {
      toast(ex.message, true);
    }
  });

  $("reset-orders").addEventListener("click", async () => {
    const n = state.orders.length;
    if (!n) return toast("Aucune inscription à effacer.");
    const answer = prompt(`Cette action supprime définitivement ${n} inscription(s).\nTapez EFFACER pour confirmer.`);
    if (answer !== "EFFACER") return;
    try {
      await api("/admin/orders", { method: "DELETE" });
      await refresh();
      toast("Toutes les inscriptions ont été effacées");
    } catch (ex) {
      toast(ex.message, true);
    }
  });

  $("toggle-open").addEventListener("click", async () => {
    const open = !state.settings.open;
    if (!open && !confirm("Fermer le choix des menus ? Les visiteurs ne pourront plus faire ni modifier de choix.")) return;
    try {
      const { settings } = await api("/admin/settings", { method: "PUT", body: { open } });
      state.settings = settings;
      render();
      toast(open ? "Le choix des menus est ouvert" : "Le choix des menus est fermé");
    } catch (ex) {
      toast(ex.message, true);
    }
  });

  $("export-xlsx").addEventListener("click", exportXlsx);
  $("export-pdf").addEventListener("click", exportPdf);

  if (token.get()) refresh();
  else showLogin();
})();
