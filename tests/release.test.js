import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIERS, VIM_ROWS, XML_INVOICES } from "../src/data/demoData.js";
import { buildProject, traceCsv, updateSupplier } from "../src/lib/project.js";
import { column, DEFAULT_ACCOUNTING_RULES } from "../src/lib/proposal.js";
import { readStored, writeStored } from "../src/lib/storage.js";
import { independentRowRules } from "../src/lib/columnRules.js";

test("row editors preserve legacy effective rules as independent copies", () => {
  const settings = { all: { mode: "compose", parts: [{ type: "text", value: "GENERAL" }] }, supplier: { mode: "empty" } };
  const rules = independentRowRules(settings);
  assert.deepEqual(Object.keys(rules), ["supplier", "services", "fees"]);
  assert.equal(rules.supplier.mode, "empty");
  assert.deepEqual(rules.services, settings.all);
  rules.services.parts[0].value = "CHANGED";
  assert.equal(rules.fees.parts[0].value, "GENERAL");
  assert.equal(settings.all.parts[0].value, "GENERAL");
  assert.deepEqual(independentRowRules().fees, { mode: "default" });
});

const initial = () => ({
  suppliers: structuredClone(SUPPLIERS), reviews: {
    "vim-01": { status: "processed", warningsAcknowledged: true },
    "vim-02": { status: "processed", warningsAcknowledged: true },
    "vim-06": { warningsAcknowledged: true },
  }, batchDate: "2026-10-29", manualLinks: {},
});
const project = (state) => buildProject({ ...state, vimRows: VIM_ROWS, invoices: XML_INVOICES });

test("supplier changes reopen only affected confirmed documents and revoke checks", () => {
  const state = initial(), before = project(state);
  const next = updateSupplier(state, before.documents, "DEMO0101", { costCenter: "CC1004" });
  assert.equal(next.reviews["vim-01"].status, null);
  assert.equal(next.reviews["vim-01"].warningsAcknowledged, false);
  assert.equal(next.reviews["vim-06"].warningsAcknowledged, false);
  assert.deepEqual(next.reviews["vim-02"], state.reviews["vim-02"]);
  const after = project(next);
  assert.equal(after.documents[0].status, "review");
  assert.equal(after.documents[0].preview.rows[1].values[column("Centro di costo").index - 1], "CC1004");
  assert.equal(traceCsv(after).includes("118/2026"), false);
  assert.equal(state.suppliers.DEMO0101.costCenter, "CC1001");
});

test("changing SAP identity preserves links and requires review; no-op does not reopen", () => {
  const state = initial(), before = project(state);
  assert.equal(updateSupplier(state, before.documents, "DEMO0101", { sapCode: "900101" }), state);
  const next = updateSupplier(state, before.documents, "DEMO0101", { sapCode: "NEW" });
  assert.deepEqual(project(next).documents.map((doc) => [doc.vimId, doc.xmlId, doc.match]),
    before.documents.map((doc) => [doc.vimId, doc.xmlId, doc.match]));
  assert.equal(next.reviews["vim-01"].status, null);
  assert.ok(project(next).documents[0].preview.issues.some((issue) => issue.code === "vendor-mismatch"));
});

test("editing suppliers before XML import does not disable later automatic matching", () => {
  const state = initial();
  const partial = buildProject({ ...state, vimRows: VIM_ROWS, invoices: [] });
  const next = updateSupplier(state, partial.documents, "DEMO0101", { costCenter: "CC1004" });
  assert.equal(project(next).documents[0].xmlId, "xml-01");
});

test("required profile fields cannot be emptied by rules or cell overrides", () => {
  const labels = ["Società", "Tipo documento SAP", "Data documento", "Data registrazione", "ID lotto",
    "Progressivo documento", "Progressivo riga", "Divisa", "Periodo competenza", "Codice fornitore SAP",
    "Partita IVA fornitore", "Importo divisa locale", "Centro di costo", "Testo posizione", "Riferimento VIM"];
  for (const label of labels) {
    const index = column(label).index;
    for (const kind of ["rule", "override"]) {
      const state = initial();
      if (kind === "rule") state.rules = { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [index]: { all: { mode: "empty" } } } };
      else state.reviews["vim-01"].overrides = { supplier: { [index]: "" }, "services:22:": { [index]: "" } };
      const p = project(state);
      assert.ok(p.documents[0].preview.issues.some((issue) => issue.severity === "error"), `${label}: ${kind}`);
      assert.throws(() => traceCsv(p), /non esportabile/, `${label}: ${kind}`);
    }
  }
});

test("profile validates non-empty identity, sequences, dates and local currency amount", () => {
  for (const [label, value] of [
    ["Tipo documento SAP", "KG"], ["Divisa", "USD"], ["ID lotto", "OTHER"], ["Progressivo riga", "99"],
    ["Progressivo documento", "99"], ["Periodo competenza", "202699"], ["Data documento", "20260230"],
    ["Data registrazione", "29/10/2026"], ["Importo divisa locale", "0,00"],
  ]) {
    const state = initial(), index = column(label).index;
    state.rules = { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [index]: { all: { mode: "compose", parts: [{ type: "text", value }] } } } };
    assert.throws(() => traceCsv(project(state)), /non esportabile/, label);
  }
});

test("storage read/write failures are explicit and recoverable", (t) => {
  const memory = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  });
  assert.equal(writeStored("state", { example: true }), null);
  assert.deepEqual(readStored("state", null), { value: { example: true }, error: null });
  memory.set("state", "{broken");
  assert.ok(readStored("state", null).error);
  t.mock.method(globalThis.localStorage, "getItem", () => { throw new Error("blocked"); });
  t.mock.method(globalThis.localStorage, "setItem", () => { throw new Error("quota"); });
  assert.equal(readStored("state", 50).value, 50);
  assert.match(writeStored("state", {}), /Puoi continuare/);
});
