// Pairs VIM export rows with FatturaPA documents, the way the desktop tool does before any accounting work.

export const normalizeDocumentNumber = (value) => String(value ?? "").trim().replace(/\s+/g, " ");

export function matchKey(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/(?<![A-Z])(FATTURA|FATT|DOC|NC)(?![A-Z])/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+(?=.)/, "");
}

/**
 * @param vimRows rows of the VIM export
 * @param invoices parsed XML invoices
 * @param sapCodeOf (vat) => SAP supplier code from the registry, or null
 * @param manualLinks explicit choices, or snapshots preserving an existing match classification
 */
export function matchDocuments(vimRows, invoices, sapCodeOf, manualLinks = {}) {
  const used = new Set();
  const documents = vimRows.map((row) => {
    if (Object.hasOwn(manualLinks, row.id)) {
      const link = manualLinks[row.id];
      const xmlId = link && typeof link === "object" ? link.xmlId : link;
      if (xmlId && !invoices.some((invoice) => invoice.id === xmlId)) throw new Error("Fattura XML non presente nel progetto.");
      if (xmlId && used.has(xmlId)) throw new Error("Una fattura XML non può essere collegata a più righe VIM.");
      if (xmlId) used.add(xmlId);
      const match = xmlId ? link && typeof link === "object" ? link.match : "manual" : "none";
      if (!["manual", "exact", "normalized", "none"].includes(match)) throw new Error("Tipo di abbinamento non valido.");
      return { id: row.id, vimId: row.id, xmlId: xmlId ?? null, match };
    }
    return { id: row.id, vimId: row.id, xmlId: null, match: "none", pending: true };
  });

  for (const doc of documents.filter((item) => item.pending)) {
    delete doc.pending;
    const row = vimRows.find((item) => item.id === doc.vimId);
    const key = matchKey(row.reference);
    const candidates = invoices.filter((invoice) => !used.has(invoice.id) && matchKey(invoice.number) === key);
    if (!candidates.length) continue;
    const sameSupplier = candidates.filter((invoice) => sapCodeOf(invoice.supplierVat) === row.vendor);
    const eligible = sameSupplier.length ? sameSupplier : candidates.filter((invoice) => !sapCodeOf(invoice.supplierVat));
    const best = eligible.length === 1 ? eligible[0] : null;
    if (!best) continue;
    used.add(best.id);
    doc.xmlId = best.id;
    doc.match = normalizeDocumentNumber(best.number) === normalizeDocumentNumber(row.reference) ? "exact" : "normalized";
  }

  for (const invoice of invoices) {
    if (!used.has(invoice.id)) documents.push({ id: invoice.id, vimId: null, xmlId: invoice.id, match: "none" });
  }
  return documents;
}

export function associationWarnings(vim, invoice, suppliers) {
  const warnings = [];
  if (matchKey(vim.reference) !== matchKey(invoice.number)) warnings.push("Riferimento VIM e numero fattura diversi.");
  const sapCode = suppliers[invoice.supplierVat]?.sapCode;
  if (!sapCode) warnings.push("Codice SAP del fornitore XML non disponibile in anagrafica.");
  else if (sapCode !== vim.vendor) warnings.push("Fornitore VIM diverso dal codice SAP associato alla partita IVA XML.");
  if (Math.abs(Math.abs(vim.amount) - Math.abs(invoice.declaredTotal)) > 0.010001) warnings.push("Importo VIM e totale XML diversi.");
  if (vim.documentDate && vim.documentDate !== invoice.date) warnings.push("Data documento VIM e XML diverse.");
  return warnings;
}

export function changeAssociation({ documents, reviews, vimId, xmlId }) {
  const target = documents.find((doc) => doc.vimId === vimId);
  if (!target) throw new Error("Riga VIM non presente nel progetto.");
  if (["processed", "discarded"].includes(target.status)) throw new Error("Riapri la lavorazione prima di modificare il collegamento.");
  if (xmlId === target.xmlId) return null;
  const invoiceDoc = xmlId ? documents.find((doc) => doc.xmlId === xmlId) : null;
  if (xmlId && !invoiceDoc) throw new Error("Fattura XML non presente nel progetto.");
  if (invoiceDoc?.vimId) throw new Error("La fattura è già collegata: scollegala dalla riga VIM attuale.");
  if (invoiceDoc && ["processed", "discarded"].includes(invoiceDoc.status)) throw new Error("Riapri la fattura prima di collegarla.");
  // Preserve every other association, including explicit non-associations, when a document becomes free.
  const manualLinks = Object.fromEntries(documents.filter((doc) => doc.vimId)
    .map((doc) => [doc.vimId, doc.xmlId ? { xmlId: doc.xmlId, match: doc.match } : null]));
  manualLinks[vimId] = xmlId;
  const nextReviews = { ...reviews };
  for (const id of [vimId, target.xmlId, xmlId].filter(Boolean)) delete nextReviews[id];
  return { manualLinks, reviews: nextReviews };
}
