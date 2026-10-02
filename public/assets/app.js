(function () {
  const $ = (id) => document.getElementById(id);
  const LAST_KEY = "menu-bocs:last-receipt";
  let settings = null;
  let dishes = [];
  let lastOrder = null;
  let editing = false; // vrai seulement après « Modifier mon choix »

  const storage = {
    get() {
      try { return JSON.parse(localStorage.getItem(LAST_KEY)); } catch { return null; }
    },
    set(v) {
      try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* stockage indisponible */ }
    },
  };

  function applySettings(s) {
    document.querySelectorAll("[data-s]").forEach((el) => {
      const v = s[el.dataset.s];
      if (v) el.textContent = v;
    });
    $("meta-date").hidden = !s.eventDate;
    $("meta-location").hidden = !s.location;
    document.title = `Menu — ${s.eventTitle} | ${s.organisation}`;
  }

  function show(id) {
    ["loading", "order-form", "success", "closed"].forEach((x) => ($(x).hidden = x !== id));
  }

  function showError(msg) {
    const el = $("form-error");
    el.textContent = msg;
    el.hidden = !msg;
    if (msg) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function fillDishes() {
    const select = $("dish");
    select.length = 1;
    for (const d of dishes) select.add(new Option(d.name, d.id));
    updatePreview();
  }

  function updatePreview() {
    const d = dishes.find((x) => x.id === $("dish").value);
    $("dish-preview").hidden = !(d && d.description);
    $("dish-desc").textContent = d ? d.description : "";
  }

  function showClosed(title, text) {
    $("closed-title").textContent = title;
    $("closed-text").textContent = text;
    const last = storage.get();
    $("closed-actions").hidden = !last;
    show("closed");
  }

  function showSuccess(order, updated) {
    lastOrder = order;
    $("success-title").textContent = `Merci ${order.prenom}, c'est noté.`;
    $("success-sub").textContent = updated ? "Votre choix a été mis à jour." : "Votre choix a bien été enregistré.";
    $("r-number").textContent = order.receipt;
    $("r-nom").textContent = order.nom;
    $("r-prenom").textContent = order.prenom;
    $("r-structure").textContent = order.structure;
    $("r-fonction").textContent = order.fonction || "";
    $("r-fonction").hidden = $("r-fonction-label").hidden = !order.fonction;
    $("r-dish").textContent = order.dishName;
    $("r-date").textContent = new Date(order.updatedAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
    show("success");
    document.querySelector(".order-card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function download(order) {
    if (!window.jspdf) {
      alert("Le module PDF est en cours de chargement, merci de réessayer dans un instant.");
      return;
    }
    window.downloadReceipt(order, settings);
  }

  async function load() {
    try {
      const res = await fetch("/api/public");
      if (!res.ok) throw new Error();
      const data = await res.json();
      settings = data.settings;
      dishes = data.dishes;
      applySettings(settings);
      if (!settings.open) {
        return showClosed("Inscriptions fermées", "Le choix des menus est clôturé. Merci de vous rapprocher de l'équipe d'organisation.");
      }
      if (!dishes.length) {
        return showClosed("Menu bientôt disponible", "Les plats n'ont pas encore été publiés. Merci de revenir dans quelques instants.");
      }
      fillDishes();
      show("order-form");
    } catch {
      showClosed("Connexion impossible", "Le service est momentanément indisponible. Merci de recharger la page.");
    }
  }

  $("dish").addEventListener("change", updatePreview);

  $("order-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const payload = {
      nom: $("nom").value.trim(),
      prenom: $("prenom").value.trim(),
      structure: $("structure").value.trim(),
      fonction: $("fonction").value.trim(),
      dishId: $("dish").value,
    };
    // Modification : on transmet l'inscription précédente pour qu'elle soit remplacée
    // si le nom, le prénom ou la structure ont été corrigés.
    // Clé de la dernière inscription faite sur ce téléphone : autorise sa mise à jour.
    const stored = storage.get();
    const own = lastOrder || (stored && stored.order);
    if (own && own.editKey) payload.editKey = own.editKey;
    if (editing && lastOrder && lastOrder.id && lastOrder.editKey) payload.replace = { id: lastOrder.id, key: lastOrder.editKey };
    if (!payload.nom || !payload.prenom || !payload.structure) return showError("Merci de renseigner votre nom, prénom et structure.");
    if (!payload.dishId) return showError("Merci de choisir un plat dans la liste.");

    const btn = $("submit-btn");
    btn.disabled = true;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Une erreur est survenue. Merci de réessayer.");
        if (res.status === 403 || data.code === "dish") load();
        return;
      }
      settings = data.settings || settings;
      editing = false;
      storage.set({ order: data.order, settings });
      showSuccess(data.order, data.updated);
    } catch {
      showError("Connexion impossible. Vérifiez votre réseau et réessayez.");
    } finally {
      btn.disabled = false;
    }
  });

  $("download-btn").addEventListener("click", () => lastOrder && download(lastOrder));
  $("closed-download").addEventListener("click", () => {
    const last = storage.get();
    if (last) {
      settings = { ...last.settings, ...(settings || {}) };
      download(last.order);
    }
  });
  $("new-btn").addEventListener("click", () => {
    editing = false;
    $("order-form").reset();
    updatePreview();
    show("order-form");
    document.querySelector(".order-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("again-btn").addEventListener("click", () => {
    editing = true;
    $("dish").value = lastOrder ? lastOrder.dishId : "";
    updatePreview();
    show("order-form");
    document.querySelector(".order-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("year").textContent = new Date().getFullYear();
  load();
})();
