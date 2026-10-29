import test from "node:test";
import assert from "node:assert/strict";
import { SUPPLIERS, VIM_ROWS, XML_INVOICES } from "../src/data/demoData.js";
import { associationWarnings, changeAssociation, matchDocuments } from "../src/lib/matching.js";
import { buildProject, traceCsv, vimCsv } from "../src/lib/project.js";
import { COL, DEFAULT_ACCOUNTING_RULES, TRACE_COLUMNS, column } from "../src/lib/proposal.js";
import { conditionMatches, evaluateColumnRule, ruleContext, validateColumnRule, validateColumnSettings } from "../src/lib/columnRules.js";

const base = { vimRows: VIM_ROWS, invoices: XML_INVOICES, suppliers: SUPPLIERS, batchDate: "2026-10-31" };
const project = (patch = {}) => buildProject({ ...base, ...patch });
const get = (p, id) => p.documents.find((doc) => doc.id === id);
const patchLink = (p, vimId, xmlId, reviews = {}) => changeAssociation({ documents: p.documents, vimId, xmlId, reviews });
const text = (value) => ({ type: "text", value });
const data = (key, extra = {}) => ({ type: "data", key, ...extra });
const compose = (...parts) => ({ mode: "compose", parts });
const when = (key, operator, value = "") => ({ key, operator, value });

test("unlink keeps both documents, clears only involved reviews and preserves other match types", () => {
  const reviews = { "vim-01": { competence: "202610" }, "vim-02": { status: "processed" } };
  const initial = project({ reviews });
  const patch = patchLink(initial, "vim-01", null, reviews);
  const next = project(patch);
  assert.equal(get(next, "vim-01").xmlId, null);
  assert.equal(get(next, "xml-01").vimId, null);
  assert.equal(get(next, "vim-02").match, get(initial, "vim-02").match);
  assert.deepEqual(patch.reviews, { "vim-02": { status: "processed" } });
  assert.equal(next.documents.filter((doc) => doc.invoice).length, XML_INVOICES.length);
  assert.equal(next.documents.filter((doc) => doc.vim).length, VIM_ROWS.length);
  assert.match(vimCsv(next).split("\r\n")[1], /NON TROVATO;$/);
});

test("a free XML can be connected from either direction and replaces without deleting", () => {
  const firstPatch = patchLink(project(), "vim-01", null);
  const first = project(firstPatch);
  const secondPatch = patchLink(first, "vim-02", "xml-01");
  const second = project(secondPatch);
  assert.equal(get(second, "vim-02").xmlId, "xml-01");
  assert.equal(get(second, "vim-02").match, "manual");
  assert.equal(get(second, "xml-02").vimId, null);
  assert.equal(get(second, "vim-01").xmlId, null);
  const third = project(patchLink(second, "vim-01", "xml-02"));
  assert.equal(get(third, "vim-01").xmlId, "xml-02");
  assert.equal(third.documents.length, project().documents.length);
  assert.ok(get(third, "vim-01").preview.issues.some((issue) => issue.code === "vendor-mismatch"));
});

test("association changes reject occupied XML, unknown IDs and locked rows or invoices", () => {
  assert.throws(() => patchLink(project(), "vim-01", "xml-02"), /già collegata/);
  assert.throws(() => patchLink(project(), "absent", null), /non presente/);
  assert.throws(() => patchLink(project(), "vim-01", "absent"), /non presente/);
  for (const status of ["processed", "discarded"]) {
    assert.throws(() => patchLink(project({ reviews: { "vim-01": { status } } }), "vim-01", null), /Riapri/);
    const free = project({ manualLinks: { "vim-01": null }, reviews: { "xml-01": { status } } });
    assert.throws(() => patchLink(free, "vim-01", "xml-01"), /Riapri/);
  }
  assert.equal(patchLink(project(), "vim-01", "xml-01"), null);
});

test("changing links clears orphan draft too and persists across JSON round trips", () => {
  const reviews = { "xml-01": { overrides: { supplier: { 1: "WRONG" } } } };
  const free = project({ manualLinks: { "vim-01": null }, reviews });
  const patch = patchLink(free, "vim-01", "xml-01", reviews);
  assert.deepEqual(patch.reviews, {});
  const restored = project(JSON.parse(JSON.stringify(patch)));
  assert.equal(get(restored, "vim-01").preview.rows[0].values[0], "BD01");
});

test("manual maps enforce one-to-one and existing IDs even without the UI", () => {
  assert.throws(() => project({ manualLinks: { "vim-01": "xml-01", "vim-02": "xml-01" } }), /più righe/);
  assert.throws(() => project({ manualLinks: { "vim-01": "absent" } }), /non presente/);
});

test("automatic matching leaves ambiguous candidates and wrong suppliers unlinked", () => {
  const row = VIM_ROWS[0], invoice = XML_INVOICES[0];
  const duplicate = { ...invoice, id: "duplicate" };
  assert.equal(matchDocuments([row], [invoice, duplicate], () => row.vendor)[0].xmlId, null);
  assert.equal(matchDocuments([row], [invoice], () => "OTHER")[0].xmlId, null);
  assert.equal(matchDocuments([row], [invoice], () => null)[0].xmlId, invoice.id);
});

test("manual association warnings expose reference, supplier, amount and date discrepancies", () => {
  assert.deepEqual(associationWarnings(VIM_ROWS[0], XML_INVOICES[0], SUPPLIERS), []);
  assert.equal(associationWarnings(VIM_ROWS[0], XML_INVOICES[1], SUPPLIERS).length, 4);
  assert.equal(associationWarnings(VIM_ROWS[3], XML_INVOICES[3], SUPPLIERS).length, 0);
});

test("conditions support normalized text, numeric comparisons, contains and emptiness", () => {
  const context = { "xml.number": " abc ", "row.amount": -12.5, "row.nature": "", "vim.amount": "1.200,50" };
  assert.equal(conditionMatches(when("xml.number", "equals", "ABC"), context), true);
  assert.equal(conditionMatches(when("xml.number", "notEquals", "ABC"), context), false);
  assert.equal(conditionMatches(when("xml.number", "contains", "B"), context), true);
  assert.equal(conditionMatches(when("xml.number", "contains", ""), context), false);
  assert.equal(conditionMatches(when("row.nature", "empty"), context), true);
  assert.equal(conditionMatches(when("xml.number", "notEmpty"), context), true);
  assert.equal(conditionMatches(when("row.amount", "less", "-12,40"), context), true);
  assert.equal(conditionMatches(when("vim.amount", "greater", "1200"), context), true);
  assert.equal(conditionMatches(when("row.nature", "greater", "-1"), context), false);
  assert.equal(conditionMatches(when("row.amount", "equals", "-12,50"), context), true);
});

test("cases use AND, first match wins and otherwise is explicit", () => {
  const rule = { mode: "conditional", cases: [
    { when: [when("row.amount", "greater", "0"), when("xml.number", "contains", "A")], parts: [text("FIRST")] },
    { when: [when("row.amount", "greater", "0")], parts: [text("SECOND")] },
  ], otherwise: [text("OTHER")] };
  assert.equal(evaluateColumnRule(rule, { "row.amount": 1, "xml.number": "A1" }), "FIRST");
  assert.equal(evaluateColumnRule(rule, { "row.amount": 1, "xml.number": "B1" }), "SECOND");
  assert.equal(evaluateColumnRule(rule, { "row.amount": -1, "xml.number": "A1" }), "OTHER");
  assert.equal(evaluateColumnRule({ ...rule, cases: [] }, {}), "OTHER");
});

test("compositions keep separators, date formats, zero padding and signed decimals", () => {
  const value = evaluateColumnRule(compose(data("xml.date", { format: "yyyymm" }), text("_"),
    data("registration.documentSequence", { width: "3" }), text(" / "), data("row.amount")),
  { "xml.date": "2026-10-29", "registration.documentSequence": 2, "row.amount": -12.5 });
  assert.equal(value, "202610_002 / -12,50");
  assert.equal(evaluateColumnRule(compose(data("xml.date", { format: "ddmmyyyy" })), { "xml.date": "2026-10-29" }), "29/10/2026");
  assert.equal(evaluateColumnRule({ mode: "empty" }, {}), "");
  assert.equal(evaluateColumnRule({ mode: "default" }, { "default.value": "STANDARD" }), "STANDARD");
});

test("invalid settings are rejected with explicit errors", () => {
  const conditional = (condition) => ({ mode: "conditional", cases: [{ when: [condition], parts: [] }], otherwise: [] });
  assert.throws(() => validateColumnRule(compose(data("column.other"))), /fonte/);
  assert.throws(() => validateColumnRule(compose(data("xml.number", { format: "yyyy" }))), /Formato/);
  assert.throws(() => validateColumnRule(compose(data("xml.number", { width: 31 }))), /Cifre/);
  assert.throws(() => validateColumnRule(conditional(when("row.amount", "greater", "oops"))), /numero/);
  assert.throws(() => validateColumnRule(conditional(when("row.amount", "greater", ""))), /numero/);
  assert.throws(() => validateColumnRule(conditional(when("xml.number", "contains", ""))), /testo/);
  assert.throws(() => validateColumnRule({ mode: "conditional", cases: [{ when: [], parts: [] }], otherwise: [] }), /almeno/);
  assert.throws(() => validateColumnSettings({ 51: { all: { mode: "empty" } } }, TRACE_COLUMNS), /Colonna/);
  assert.throws(() => validateColumnSettings({ 1: { unknown: { mode: "empty" } } }, TRACE_COLUMNS), /Categoria/);
});

test("saved column rules apply to preview and actual CSV, with category precedence", () => {
  const index = column("Testo posizione").index;
  const rules = { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [index]: {
    all: { mode: "conditional", cases: [{
      when: [when("xml.documentType", "equals", "TD04")], parts: [text("STORNO "), data("xml.number")],
    }], otherwise: [text("ACQUISTO "), data("xml.number")] },
    supplier: compose(text("FORNITORE")),
  } } };
  const p = project({ rules, reviews: { "vim-01": { status: "processed" } } });
  assert.equal(get(p, "vim-01").preview.rows[0].values[index - 1], "FORNITORE");
  assert.equal(get(p, "vim-01").preview.rows[1].values[index - 1], "ACQUISTO 118");
  assert.equal(get(p, "vim-03").preview.rows[1].values[index - 1], "STORNO NC 7");
  assert.match(traceCsv(p), /ACQUISTO 118/);
  const restored = project({ rules: JSON.parse(JSON.stringify(rules)) });
  assert.equal(get(restored, "vim-03").preview.rows[1].values[index - 1], "STORNO NC 7");
});

test("specific standard mode overrides a general rule, empty clears cells, manual cells win", () => {
  const index = COL.text;
  const rules = { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [index]: {
    all: compose(text("CUSTOM")), supplier: { mode: "default" }, services: { mode: "empty" },
  } } };
  const p = project({ rules });
  assert.equal(get(p, "vim-01").preview.rows[0].values[index - 1], "FATTURA N. 118/2026");
  assert.equal(get(p, "vim-01").preview.rows[1].values[index - 1], "");
  const overridden = project({ rules, reviews: { "vim-01": { overrides: { supplier: { [index]: "MANUAL" } } } } });
  assert.equal(get(overridden, "vim-01").preview.rows[0].values[index - 1], "MANUAL");
});

test("conditional changes cannot bypass reconciliation, fiscal or posting guards", () => {
  for (const [index, replacement] of [[COL.amount, "0,00"], [COL.vatCode, "INVALID"], [COL.key, "99"]]) {
    const p = project({ rules: { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [index]: { all: compose(text(replacement)) } } },
      reviews: { "vim-01": { status: "processed" } } });
    assert.ok(get(p, "vim-01").preview.issues.some((issue) => issue.severity === "error"));
    assert.throws(() => traceCsv(p), /non esportabile/);
  }
});

test("invalid persisted rules block preview confirmation and CSV instead of silently defaulting", () => {
  const p = project({ rules: { ...DEFAULT_ACCOUNTING_RULES, columnSettings: { [COL.text]: { all: compose(data("unknown")) } } },
    reviews: { "vim-01": { status: "processed" } } });
  assert.ok(get(p, "vim-01").preview.issues.some((issue) => issue.code.startsWith("column-rule-")));
  assert.throws(() => traceCsv(p), /non esportabile/);
});

test("rule context uses original sources, not another edited column", () => {
  const context = ruleContext({ invoice: XML_INVOICES[0], vim: VIM_ROWS[0], supplier: SUPPLIERS.DEMO0101,
    amount: 10, vat: 2.2, slot: "services", credit: false, key: "40", sapCode: "900101" }, "BASE");
  assert.equal(context["xml.total"], 2610.8);
  assert.equal(context["row.amount"], 10);
  assert.equal(context["default.value"], "BASE");
  assert.equal(context["row.documentKind"], "Fattura");
});
