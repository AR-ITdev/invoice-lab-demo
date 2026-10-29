import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIERS, VIM_ROWS, XML_INVOICES } from "../src/data/demoData.js";
import { columnLetter } from "../src/lib/format.js";
import { matchDocuments, matchKey, normalizeDocumentNumber } from "../src/lib/matching.js";
import { buildProject, traceCsv, vimCsv } from "../src/lib/project.js";
import { COL, TRACE_COLUMNS, invoiceLines, proposeVatCode } from "../src/lib/proposal.js";
import { fatturaPaXml } from "../src/lib/xml.js";

const project = (overrides = {}) => buildProject({ vimRows: VIM_ROWS, invoices: XML_INVOICES, suppliers: structuredClone(SUPPLIERS), batchDate: "2026-10-31", ...overrides });
const doc = (p, id) => p.documents.find((item) => item.id === id);
const value = (row, label) => row.values[TRACE_COLUMNS.find((column) => column.label === label).index - 1];
const codes = (d) => d.preview.issues.map((issue) => issue.code);

test("match keys ignore spaces, symbols, prefixes and leading zeros", () => {
  assert.equal(matchKey("NC 7"), "7");
  assert.equal(matchKey("0305"), "305");
  assert.equal(matchKey("PF-0912"), matchKey("PF 0912"));
  assert.equal(normalizeDocumentNumber("  VS81      41 "), "VS81 41");
});

test("VIM rows are paired with XML, flagging normalized matches and missing XML", () => {
  const docs = matchDocuments(VIM_ROWS, XML_INVOICES, (vat) => SUPPLIERS[vat].sapCode);
  assert.equal(docs.length, 10);
  assert.equal(docs.find((item) => item.vimId === "vim-04").match, "normalized");
  assert.equal(docs.find((item) => item.vimId === "vim-01").match, "exact");
  assert.equal(docs.find((item) => item.vimId === "vim-08").xmlId, null);
  const manual = matchDocuments(VIM_ROWS, XML_INVOICES, () => null, { "vim-01": null });
  assert.equal(manual.find((item) => item.vimId === "vim-01").xmlId, null);
  assert.ok(manual.some((item) => item.xmlId === "xml-01" && item.vimId === null), "unlinked XML becomes an orphan");
});

test("VAT mapping follows rate and nature, not the expense category", () => {
  const lines = (items) => invoiceLines({ lines: items });
  assert.equal(proposeVatCode(lines([{ description: "Servizio", quantity: 1, unitPrice: 10, vatRate: 0, nature: "N4" }])), "E4");
  assert.equal(proposeVatCode(lines([{ description: "Servizio", quantity: 1, unitPrice: 10, vatRate: 0, nature: "N3.1" }])), "I1");
  assert.equal(proposeVatCode(lines([{ description: "Servizio", quantity: 1, unitPrice: 10, vatRate: 0 }])), "");
  assert.equal(proposeVatCode(lines([{ description: "Servizio", quantity: 1, unitPrice: 10, vatRate: 10 }])), "A1");
  assert.equal(proposeVatCode(lines([{ description: "Servizio", quantity: 1, unitPrice: 10, vatRate: 22 }])), "A2");
  assert.equal(proposeVatCode(lines([{ description: "Commissione", quantity: 1, unitPrice: 10, vatRate: 22 }])), "A2");
});

test("an ordinary invoice produces balanced KR rows with keys 31/40", () => {
  const d = doc(project(), "vim-01");
  assert.equal(d.preview.balance, 0);
  assert.deepEqual(d.preview.rows.map((row) => row.values[COL.key - 1]), ["31", "40"]);
  assert.equal(value(d.preview.rows[0], "Tipo documento SAP"), "KR");
  assert.equal(value(d.preview.rows[0], "ID lotto"), "20261031_FP001");
  assert.equal(d.preview.rows[0].values.length, TRACE_COLUMNS.length);
  assert.equal(TRACE_COLUMNS.length, 50);
  assert.equal(TRACE_COLUMNS.filter((column) => column.mode === "Vuoto").length, 16);
  assert.equal(value(d.preview.rows[0], "Codice IVA"), "", "tax code only on G/L lines");
  assert.equal(value(d.preview.rows[1], "Codice IVA"), "A2");
  assert.equal(d.preview.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("document text (column AA) collapses internal spaces of the XML number", () => {
  const d = doc(project(), "vim-02");
  assert.equal(TRACE_COLUMNS[COL.text - 1].letter, "AA");
  assert.equal(value(d.preview.rows[0], "Testo posizione"), "FATTURA N. VS81 41/2026");
  assert.ok(codes(d).includes("number-spaces"));
  assert.equal(d.preview.vatCode, "A2");
  assert.equal(d.preview.rows.length, 3);
});

test("credit notes use KG and inverted keys 21/50", () => {
  const d = doc(project(), "vim-03");
  assert.equal(value(d.preview.rows[0], "Tipo documento SAP"), "KG");
  assert.deepEqual(d.preview.rows.map((row) => row.values[COL.key - 1]), ["21", "50"]);
  assert.match(value(d.preview.rows[0], "Testo posizione"), /^N\.C\. N\. /);
  assert.equal(d.preview.balance, 0);
});

test("exempt invoices get E4 and an empty VAT column", () => {
  const d = doc(project(), "vim-05");
  assert.equal(d.preview.vatCode, "E4");
  assert.ok(d.preview.rows.every((row) => row.values[COL.vat - 1] === ""));
});

test("reconciliation requires documented mock evidence rather than guessing a commission", () => {
  const before = doc(project(), "vim-06");
  const issue = before.preview.issues.find((item) => item.code === "total-mismatch");
  assert.equal(issue.action.type, "add-supported-line");
  assert.equal(issue.action.line.evidenceId, "INT-131");
  assert.equal(issue.action.line.unitPrice, 16.39);
  const after = doc(project({ reviews: { "vim-06": { extraLines: [issue.action.line] } } }), "vim-06");
  assert.ok(!codes(after).includes("total-mismatch"));
  assert.equal(after.preview.totals.gross, 813);
  assert.equal(after.preview.vatCode, "A2");
  assert.equal(after.preview.balance, 0);
  assert.equal(after.preview.rows.length, 2, "documented service charge stays on the service account");
  const invoices = XML_INVOICES.map((invoice) => invoice.id === "xml-06" ? { ...invoice, supportingEvidence: undefined } : invoice);
  const unknown = doc(project({ invoices }), "vim-06").preview.issues.find((item) => item.code === "total-mismatch");
  assert.equal(unknown.action, null, "an unexplained difference has no automatic adjustment");
});

test("a supplier without SAP code blocks the document until the VIM code is assigned", () => {
  const before = doc(project(), "vim-07");
  const issue = before.preview.issues.find((item) => item.code === "missing-sap-code");
  assert.equal(issue.action.sapCode, "900606");
  const suppliers = structuredClone(SUPPLIERS);
  suppliers.DEMO0606.sapCode = "900606";
  const after = doc(project({ suppliers }), "vim-07");
  assert.equal(after.preview.issues.filter((item) => item.severity === "error").length, 0);
  assert.equal(value(after.preview.rows[0], "Conto"), "900606");
});

test("posting keys must match account type and sign", () => {
  const wrongSide = doc(project({ reviews: { "vim-01": { keys: { services: "50" } } } }), "vim-01");
  assert.equal(wrongSide.preview.balance, 0, "the key never changes the signed amount");
  assert.ok(codes(wrongSide).includes("counterpart-direction-1"));
  const wrongType = doc(project({ reviews: { "vim-01": { keys: { supplier: "40" } } } }), "vim-01");
  assert.ok(wrongType.preview.issues.some((issue) => issue.code === "account-type-0" && issue.severity === "error"));
  const wrongSupplier = doc(project({ reviews: { "vim-01": { keys: { supplier: "21" } } } }), "vim-01");
  assert.ok(wrongSupplier.preview.issues.some((issue) => issue.code === "direction-0" && issue.severity === "error"));
});

test("amounts are signed: invoices put the supplier in Avere and counterparts in Dare", () => {
  const d = doc(project(), "vim-01");
  assert.deepEqual(d.preview.rows.map((row) => [row.amount, row.vat]), [[-2610.8, 0], [2140, 470.8]]);
  assert.equal(d.preview.debit, 2610.8);
  assert.equal(d.preview.creditSide, -2610.8);
});

test("credit notes invert signs once: supplier +total (21), counterparts negative (50)", () => {
  const d = doc(project(), "vim-03");
  assert.deepEqual(d.preview.rows.map((row) => [row.amount, row.vat]), [[263.52, 0], [-216, -47.52]]);
  assert.ok(codes(d).includes("credit-note"));
});

test("credit notes whose XML lines are already negative are not inverted twice", () => {
  const source = XML_INVOICES.find((invoice) => invoice.id === "xml-03");
  const negative = { ...source, declaredTotal: -source.declaredTotal, lines: source.lines.map((line) => ({ ...line, unitPrice: -line.unitPrice })) };
  const d = doc(project({ invoices: XML_INVOICES.map((invoice) => invoice.id === "xml-03" ? negative : invoice) }), "vim-03");
  assert.equal(d.preview.multiplier, 1);
  assert.deepEqual(d.preview.rows.map((row) => row.key), ["21", "50"]);
  assert.deepEqual(d.preview.rows.map((row) => [row.amount, row.vat]), [[263.52, 0], [-216, -47.52]]);
  assert.equal(d.preview.balance, 0);
  assert.match(d.preview.issues.find((issue) => issue.code === "credit-note").message, /doppia inversione/);
});

test("discounts reduce the original expense instead of creating a fee", () => {
  const d = doc(project(), "vim-09");
  assert.deepEqual(d.preview.rows.map((row) => row.key), ["31", "40"]);
  assert.deepEqual(d.preview.rows.map((row) => [row.amount, row.vat]), [[-976, 0], [800, 176]]);
  assert.equal(d.preview.balance, 0);
  assert.equal(d.preview.debit, 976);
  assert.equal(d.preview.creditSide, -976);
  assert.ok(codes(d).includes("mixed-lines"));
  assert.equal(d.preview.issues.filter((issue) => issue.severity === "error").length, 0);
});

test("general rules drive line classification", () => {
  const off = doc(project({ rules: { feeKeywords: ["commission", "fee"], roundingKeywords: ["arrotondamento"], negativeLinesAreFee: false } }), "vim-09");
  assert.deepEqual(off.preview.rows.map((row) => [row.slot, row.amount, row.vat]), [["supplier", -976, 0], ["services", 800, 176]]);
  assert.equal(off.preview.balance, 0);
  const rounding = doc(project({ rules: { feeKeywords: ["commission", "fee"], roundingKeywords: ["sconto"], negativeLinesAreFee: true } }), "vim-09");
  assert.equal(rounding.preview.rows.length, 2, "rounding keywords win over the negative-line rule");
  const custom = doc(project({ rules: { feeKeywords: ["commission"], roundingKeywords: [], negativeLinesAreFee: true } }), "vim-09");
  assert.deepEqual(custom.preview.rows.map((row) => row.key), ["31", "40", "50"], "explicit profile exception remains available");
});

test("a manual amount override that breaks the zeroing is an error", () => {
  const d = doc(project({ reviews: { "vim-01": { overrides: { services: { [COL.amount]: "2000,00" } } } } }), "vim-01");
  assert.equal(d.preview.balance, -140);
  assert.ok(d.preview.issues.some((issue) => issue.code === "balance" && issue.severity === "error"));
});

test("mixed VAT produces separate trace rows and independently editable groups", () => {
  const d = doc(project(), "vim-10");
  assert.equal(d.preview.rows.length, 4);
  assert.equal(new Set(d.preview.rows.map((row) => row.id)).size, 4);
  assert.deepEqual(d.preview.rows.map((row) => [row.amount, row.vat]), [[-277, 0], [100, 22], [50, 5], [100, 0]]);
  assert.deepEqual(d.preview.rows.slice(1).map((row) => value(row, "Codice IVA")), ["A2", "A1", "E4"]);
  assert.equal(d.preview.balance, 0);
  assert.equal(d.preview.issues.filter((issue) => issue.severity === "error").length, 0);
  const group = d.preview.rows[2];
  const changed = doc(project({ reviews: { "vim-10": { keys: { [group.id]: "50" } } } }), "vim-10");
  assert.deepEqual(changed.preview.rows.map((row) => row.key), ["31", "40", "50", "40"]);
  assert.ok(changed.preview.issues.some((issue) => issue.code === "counterpart-direction-2" && issue.severity === "error"));
  const csvLines = traceCsv(project({ reviews: { "vim-10": { status: "processed" } } })).split("\r\n");
  assert.equal(csvLines.length, 5);
  assert.deepEqual(csvLines.slice(2).map((line) => line.split(";")[COL.vatCode - 1]), ["A2", "A1", "E4"]);
});

test("exempt and non-taxable supplies are not merged even at the same zero rate", () => {
  const invoices = XML_INVOICES.map((invoice) => invoice.id === "xml-05" ? {
    ...invoice, lines: invoice.lines.map((line, index) => ({ ...line, description: "Prestazione", nature: index ? "N3.1" : "N4" })),
  } : invoice);
  const d = doc(project({ invoices }), "vim-05");
  assert.deepEqual(d.preview.rows.slice(1).map((row) => value(row, "Codice IVA")), ["E4", "I1"]);
  assert.equal(d.preview.balance, 0);
});

test("unmapped fiscal treatments and non-full deductibility block confirmation", () => {
  for (const patch of [
    { lines: [{ description: "Prestazione", quantity: 1, unitPrice: 1319, vatRate: 0 }] },
    { lines: [{ description: "Prestazione", quantity: 1, unitPrice: 1319, vatRate: 0, nature: "N6.9" }] },
    { vatDeductibility: 40 },
    { documentType: "TD17" },
  ]) {
    const invoices = XML_INVOICES.map((invoice) => invoice.id === "xml-05" ? { ...invoice, ...patch } : invoice);
    const d = doc(project({ invoices }), "vim-05");
    assert.ok(d.preview.issues.some((issue) => issue.severity === "error" && /tax-treatment|unsupported-deductibility|unsupported-document-type/.test(issue.code)));
  }
});

test("invalid numeric cells and tax codes cannot pass as a balanced document", () => {
  const source = doc(project(), "vim-01");
  const id = source.preview.rows[1].id;
  const invalid = doc(project({ reviews: { "vim-01": { overrides: { [id]: { [COL.amount]: "testo" } } } } }), "vim-01");
  assert.ok(invalid.preview.issues.some((issue) => issue.code.startsWith("invalid-amount-") && issue.severity === "error"));
  const wrongVat = doc(project({ reviews: { "vim-01": { vatCodes: { [id]: "E4" } } } }), "vim-01");
  assert.ok(wrongVat.preview.issues.some((issue) => issue.code === "vat-code-1" && issue.severity === "error"));
});

test("offsetting taxable amount and VAT overrides do not bypass source reconciliation", () => {
  const d = doc(project({ reviews: { "vim-01": { overrides: { "services:22:": { [COL.amount]: "2130,00", [COL.vat]: "480,80" } } } } }), "vim-01");
  assert.equal(d.preview.balance, 0);
  assert.ok(d.preview.issues.some((issue) => issue.code === "source-amount-1" && issue.severity === "error"));
});

test("export revalidates confirmed documents after changes to rules or registry", () => {
  const invalid = project({ reviews: { "vim-01": { status: "processed", keys: { services: "50" } } } });
  assert.throws(() => traceCsv(invalid), /non esportabile/);
  const unacknowledged = project({ reviews: { "vim-09": { status: "processed" } } });
  assert.throws(() => traceCsv(unacknowledged), /non esportabile/);
});

test("Trace export contains only processed documents with sequential document numbers", () => {
  const p = project({ reviews: { "vim-01": { status: "processed" }, "vim-03": { status: "processed" }, "vim-02": { status: "discarded" } } });
  const lines = traceCsv(p).split("\r\n");
  assert.equal(lines.length, 1 + 2 + 2);
  assert.equal(lines[0].split(";").length, TRACE_COLUMNS.length);
  assert.deepEqual(lines.slice(1).map((line) => line.split(";")[4]), ["1", "1", "2", "2"]);
  const outcome = vimCsv(p).split("\r\n");
  assert.match(outcome[1], /ELABORATO;20261031_FP001$/);
  assert.match(outcome[2], /SCARTATO;$/);
  assert.match(outcome.find((line) => line.startsWith("140;")), /NON TROVATO;$/);
});

test("helpers: column letters and generated XML", () => {
  assert.equal(columnLetter(1), "A");
  assert.equal(columnLetter(27), "AA");
  assert.equal(columnLetter(125), "DU");
  const xml = fatturaPaXml(XML_INVOICES[1], SUPPLIERS.DEMO0202);
  assert.match(xml, /<Numero>VS81 {6}41<\/Numero>/);
  assert.match(xml, /<ImportoTotaleDocumento>1274.29<\/ImportoTotaleDocumento>/);
});
