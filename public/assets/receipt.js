// Génère le reçu PDF d'un participant (jsPDF).
(function () {
  const GREEN = [10, 92, 59];
  const INK = [19, 32, 27];
  const MUTED = [93, 106, 100];

  // Les polices standard PDF ne connaissent pas certains signes typographiques.
  const t = (s) =>
    String(s == null ? "" : s)
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...");

  function formatDate(iso) {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  }

  window.downloadReceipt = function (order, settings) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 14;

    // Bandeau drapeau
    const third = W / 3;
    doc.setFillColor(0, 133, 63); doc.rect(0, 0, third, 2.5, "F");
    doc.setFillColor(253, 239, 66); doc.rect(third, 0, third, 2.5, "F");
    doc.setFillColor(227, 27, 35); doc.rect(third * 2, 0, third, 2.5, "F");

    // En-tête
    doc.setFillColor(...GREEN);
    doc.rect(M, 10, 16, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(t(settings.organisation || "BOCS"), M + 8, 19.3, { align: "center" });
    doc.setTextColor(...GREEN);
    doc.setFontSize(12);
    doc.text(t(settings.organisation || "BOCS"), M + 21, 15.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(t(settings.organisationLong), W - M * 2 - 21), M + 21, 20.5);
    doc.text(t(settings.eventTitle), M + 21, 25);
    doc.setDrawColor(220, 223, 220);
    doc.setLineWidth(0.3);
    doc.line(M, 32, W - M, 32);

    // Titre
    let y = 44;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Reçu de choix de menu", M, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`N° ${order.receipt}`, M, y);

    // Invité
    y += 9;
    doc.setFillColor(246, 247, 246);
    const ministryLines = doc.splitTextToSize(t(`${settings.ministry} (${settings.ministryShort})`), W - M * 2 - 10);
    const boxH = 10 + ministryLines.length * 4.4;
    doc.roundedRect(M, y, W - M * 2, boxH, 2.5, 2.5, "F");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("Ministère accueilli", M + 5, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(ministryLines, M + 5, y + 10.5);
    y += boxH + 8;

    // Détails
    const rows = [
      ["Nom", order.nom],
      ["Prénom", order.prenom],
      ["Structure", order.structure],
      ...(order.fonction ? [["Fonction", order.fonction]] : []),
      ["Enregistré le", formatDate(order.updatedAt || order.createdAt)],
    ];
    if (settings.eventDate) rows.push(["Date de l'atelier", settings.eventDate]);
    if (settings.location) rows.push(["Lieu", settings.location]);

    doc.setFontSize(10);
    for (const [label, value] of rows) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      doc.text(t(label), M, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      const lines = doc.splitTextToSize(t(value), W - M * 2 - 40);
      doc.text(lines, W - M, y, { align: "right" });
      y += 4.6 * lines.length + 2.4;
      doc.setDrawColor(230, 224, 208);
      doc.line(M, y - 3.4, W - M, y - 3.4);
      y += 2.2;
    }

    // Plat
    y += 3;
    doc.setDrawColor(...GREEN);
    doc.setLineWidth(0.6);
    doc.rect(M, y, W - M * 2, 24, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Plat choisi", W / 2, y + 7, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...GREEN);
    doc.text(doc.splitTextToSize(t(order.dishName), W - M * 2 - 10)[0], W / 2, y + 16.5, { align: "center" });

    // Pied
    doc.setDrawColor(220, 223, 220);
    doc.setLineWidth(0.3);
    doc.line(M, H - 20, W - M, H - 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Merci de présenter ce reçu lors du service du déjeuner.", W / 2, H - 14, { align: "center" });
    doc.text(t(`${settings.organisation} - ${settings.organisationLong}`), W / 2, H - 10, { align: "center" });

    doc.save(`recu-menu-${order.receipt}.pdf`);
  };
})();
