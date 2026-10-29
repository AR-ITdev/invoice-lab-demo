import { matchDocuments } from "./matching.js";
import { buildPreview, TRACE_COLUMNS } from "./proposal.js";
import { compactDate, dateText, decimalText } from "./format.js";

export const batchIdFor = (isoDate, sequence = 1) => `${compactDate(isoDate)}_FP${String(sequence).padStart(3, "0")}`;

export function updateSupplier(state, documents, vat, patch) {
  if (!state.suppliers[vat]) throw new Error("Fornitore non presente in anagrafica.");
  const supplier = { ...state.suppliers[vat], ...patch };
  if (Object.entries(patch).every(([key, value]) => state.suppliers[vat][key] === value)) return state;
  const affected = new Set(documents.filter((doc) => doc.invoice?.supplierVat === vat).map((doc) => doc.id));
  // An editable SAP code must not silently break or move an existing association.
  const manualLinks = {
    ...state.manualLinks,
    ...Object.fromEntries(documents.filter((doc) => doc.vimId && doc.xmlId)
      .map((doc) => [doc.vimId, { xmlId: doc.xmlId, match: doc.match }])),
  };
  return {
    ...state,
    suppliers: { ...state.suppliers, [vat]: supplier },
    manualLinks,
    reviews: Object.fromEntries(Object.entries(state.reviews).map(([id, review]) => [
      id, affected.has(id) ? { ...review, status: review.status === "processed" ? null : review.status, warningsAcknowledged: false } : review,
    ])),
  };
}

export function buildProject({ vimRows, invoices, suppliers, manualLinks = {}, reviews = {}, batchDate, rules }) {
  const batchId = batchIdFor(batchDate);
  const sapCodeOf = (vat) => suppliers[vat]?.sapCode ?? null;
  let processed = 0;
  const documents = matchDocuments(vimRows, invoices, sapCodeOf, manualLinks).map((doc) => {
    const vim = vimRows.find((row) => row.id === doc.vimId) ?? null;
    const invoice = invoices.find((item) => item.id === doc.xmlId) ?? null;
    const supplier = invoice ? suppliers[invoice.supplierVat] : null;
    const review = reviews[doc.id] ?? {};
    const status = review.status === "processed" || review.status === "discarded" ? review.status : !invoice ? "missing" : !vim ? "orphan" : "review";
    const docSeq = processed + 1;
    if (status === "processed") processed += 1;
    const preview = invoice ? buildPreview({ invoice, vim, supplier, review, batchId, docSeq, rules }) : null;
    if (preview && !vim) {
      preview.issues.unshift({ code: "missing-vim", severity: "error", location: "supplier", message: "La fattura XML non è presente nell'export VIM.", suggestion: "Abbina una riga VIM dalla pagina VIM prima di generare il tracciato." });
    }
    return { ...doc, vim, invoice, supplier, review, status, preview, docSeq };
  });
  return { batchId, documents };
}

const csvCell = (value) => (/[;"\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));
const csv = (rows) => rows.map((row) => row.map(csvCell).join(";")).join("\r\n");

export function traceCsv(project) {
  const header = TRACE_COLUMNS.map((item) => item.label);
  const processed = project.documents.filter((doc) => doc.status === "processed");
  const blocked = processed.find((doc) => !doc.preview || doc.preview.issues.some((issue) => issue.severity === "error"
    || (issue.severity === "warning" && !doc.review.warningsAcknowledged)));
  if (blocked) throw new Error(`Documento ${blocked.invoice?.number ?? blocked.id} non esportabile: riaprire la proposta e risolvere i controlli in sospeso.`);
  const rows = processed.flatMap((doc) => doc.preview.rows.map((row) => row.values));
  return csv([header, ...rows]);
}

export function vimCsv(project) {
  const header = ["Riferimento", "Fornitore", "Data documento", "Data ricezione SDI", "Importo", "Esito", "Lotto"];
  const outcome = { processed: "ELABORATO", discarded: "SCARTATO", missing: "NON TROVATO", review: "DA VERIFICARE" };
  const rows = project.documents.filter((doc) => doc.vim).map((doc) => [
    doc.vim.reference, doc.vim.vendor, dateText(doc.vim.documentDate), dateText(doc.vim.sdiDate), decimalText(doc.vim.amount),
    outcome[doc.status], doc.status === "processed" ? project.batchId : "",
  ]);
  return csv([header, ...rows]);
}
