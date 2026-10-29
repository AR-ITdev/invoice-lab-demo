import { compactDate, decimalText } from "./format.js";

export const RULE_FIELDS = [
  ["default.value", "Valore standard della colonna"],
  ["xml.number", "XML · Numero documento"], ["xml.date", "XML · Data documento", "date"],
  ["xml.documentType", "XML · Tipo documento"], ["xml.currency", "XML · Divisa"],
  ["xml.total", "XML · Totale", "number"], ["xml.supplierVat", "XML · Partita IVA"],
  ["xml.notes", "XML · Causale"],
  ["supplier.name", "Anagrafica · Fornitore"], ["supplier.sapCode", "Anagrafica · Codice SAP"],
  ["supplier.costCenter", "Anagrafica · Centro di costo"],
  ["vim.reference", "VIM · Riferimento"], ["vim.vendor", "VIM · Fornitore"],
  ["vim.amount", "VIM · Importo", "number"], ["vim.sdiDate", "VIM · Ricezione SDI", "date"],
  ["registration.batchId", "Registrazione · ID lotto"],
  ["registration.documentSequence", "Registrazione · Progressivo documento", "number"],
  ["registration.rowSequence", "Registrazione · Progressivo riga", "number"],
  ["registration.competence", "Registrazione · Competenza"],
  ["row.kind", "Calcolo · Categoria riga (supplier/services/fees)"],
  ["row.documentKind", "Calcolo · Fattura / Nota di credito"],
  ["row.amount", "Calcolo · Importo riga", "number"], ["row.vat", "Calcolo · IVA riga", "number"],
  ["row.rate", "Calcolo · Aliquota riga", "number"], ["row.nature", "Calcolo · Natura IVA"],
  ["row.key", "Calcolo · Chiave contabile"], ["row.vatCode", "Calcolo · Codice IVA"],
];
export const RULE_OPERATORS = [
  ["equals", "Uguale a"], ["notEquals", "Diverso da"], ["contains", "Contiene"],
  ["empty", "Vuoto"], ["notEmpty", "Non vuoto"], ["greater", "Maggiore di"], ["less", "Minore di"],
];
export const RULE_DATE_FORMATS = [
  ["", "Formato originale"], ["yyyymmdd", "AAAAMMGG"], ["ddmmyyyy", "GG/MM/AAAA"],
  ["yyyy-mm-dd", "AAAA-MM-GG"], ["yyyymm", "AAAAMM"], ["yyyy", "AAAA"], ["mm", "MM"], ["dd", "GG"],
];
export const RULE_SCOPES = [["all", "Tutte le righe"], ["supplier", "Fornitore"], ["services", "Servizi"], ["fees", "Commissioni"]];
export const VALUELESS_OPERATORS = new Set(["empty", "notEmpty"]);
const fields = new Map(RULE_FIELDS.map(([key, label, type]) => [key, { label, type }]));
const operators = new Set(RULE_OPERATORS.map(([key]) => key));

export function ruleContext(context, standard) {
  const { invoice, vim, supplier, amount, vat } = context;
  return {
    "default.value": standard,
    "xml.number": invoice.number, "xml.date": invoice.date, "xml.documentType": invoice.documentType,
    "xml.currency": invoice.currency ?? "EUR", "xml.total": invoice.declaredTotal, "xml.supplierVat": invoice.supplierVat,
    "xml.notes": invoice.causale ?? invoice.note ?? "",
    "supplier.name": supplier?.name ?? "", "supplier.sapCode": context.sapCode ?? "",
    "supplier.costCenter": context.costCenter ?? "",
    "vim.reference": vim?.reference ?? "", "vim.vendor": vim?.vendor ?? "",
    "vim.amount": vim?.amount ?? "", "vim.sdiDate": vim?.sdiDate ?? "",
    "registration.batchId": context.batchId, "registration.documentSequence": context.docSeq,
    "registration.rowSequence": context.rowSeq, "registration.competence": context.competence,
    "row.kind": context.slot, "row.documentKind": context.credit ? "Nota di credito" : "Fattura",
    "row.amount": amount, "row.vat": vat, "row.rate": context.rate ?? "", "row.nature": context.nature ?? "",
    "row.key": context.key, "row.vatCode": context.vatCode,
  };
}

function numeric(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  return Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
}
const normalized = (value) => String(value ?? "").trim().toLocaleUpperCase("it");

export function conditionMatches(condition, context) {
  const actual = context[condition.key];
  const { operator, value } = condition;
  if (operator === "empty") return normalized(actual) === "";
  if (operator === "notEmpty") return normalized(actual) !== "";
  if (operator === "contains") return normalized(value) !== "" && normalized(actual).includes(normalized(value));
  if (operator === "equals" || operator === "notEquals") {
    const equal = normalized(actual) === normalized(value)
      || (Number.isFinite(numeric(actual)) && Number.isFinite(numeric(value)) && numeric(actual) === numeric(value));
    return operator === "equals" ? equal : !equal;
  }
  const left = numeric(actual);
  const right = numeric(value);
  if (operator === "greater") return Number.isFinite(left) && Number.isFinite(right) && left > right;
  if (operator === "less") return Number.isFinite(left) && Number.isFinite(right) && left < right;
  throw new Error("Operatore della condizione non riconosciuto.");
}

export function validateColumnRule(rule) {
  function parts(items) {
    if (!Array.isArray(items)) throw new Error("Composizione non valida.");
    for (const part of items) {
      if (part.type === "text" && typeof part.value === "string") continue;
      if (part.type !== "data" || !fields.has(part.key)) throw new Error("Scegli una fonte dati valida.");
      if (part.format && (fields.get(part.key).type !== "date" || !RULE_DATE_FORMATS.some(([format]) => format === part.format))) throw new Error("Formato data non valido.");
      if (part.width !== undefined && part.width !== "" && (!Number.isInteger(Number(part.width)) || Number(part.width) < 1 || Number(part.width) > 30)) throw new Error("Cifre minime: inserisci un intero da 1 a 30.");
    }
  }
  if (!rule || !["default", "empty", "compose", "conditional"].includes(rule.mode)) throw new Error("Modalità della regola non valida.");
  if (rule.mode === "default" || rule.mode === "empty") return;
  if (rule.mode === "compose") return parts(rule.parts);
  if (!Array.isArray(rule.cases)) throw new Error("Elenco dei casi non valido.");
  for (const entry of rule.cases) {
    if (!Array.isArray(entry.when) || !entry.when.length) throw new Error("Ogni caso richiede almeno una condizione.");
    for (const condition of entry.when) {
      if (!fields.has(condition.key) || !operators.has(condition.operator)) throw new Error("Condizione non valida.");
      if (!VALUELESS_OPERATORS.has(condition.operator) && typeof condition.value !== "string") throw new Error("Valore della condizione non valido.");
      if (["greater", "less"].includes(condition.operator) && !Number.isFinite(numeric(condition.value))) throw new Error("Il confronto numerico richiede un numero valido.");
      if (condition.operator === "contains" && !condition.value.trim()) throw new Error("Inserisci il testo da cercare.");
    }
    parts(entry.parts);
  }
  parts(rule.otherwise);
}

export function renderRuleParts(parts, context) {
  return parts.map((part) => {
    if (part.type === "text") return part.value;
    const value = context[part.key] ?? "";
    let text = fields.get(part.key)?.type === "number" && typeof value === "number"
      ? ["row.amount", "row.vat", "xml.total", "vim.amount"].includes(part.key) ? decimalText(value) : String(value)
      : String(value);
    if (part.format && text) {
      const date = compactDate(text);
      if (!/^\d{8}$/.test(date)) throw new Error("La fonte non contiene una data valida.");
      const yyyy = date.slice(0, 4), mm = date.slice(4, 6), dd = date.slice(6, 8);
      text = { yyyymmdd: date, ddmmyyyy: `${dd}/${mm}/${yyyy}`, "yyyy-mm-dd": `${yyyy}-${mm}-${dd}`, yyyymm: `${yyyy}${mm}`, yyyy, mm, dd }[part.format];
    }
    return part.width && text ? text.padStart(Number(part.width), "0") : text;
  }).join("");
}

export function evaluateColumnRule(rule, context) {
  validateColumnRule(rule);
  if (rule.mode === "default") return context["default.value"];
  if (rule.mode === "empty") return "";
  if (rule.mode === "compose") return renderRuleParts(rule.parts, context);
  const selected = rule.cases.find((entry) => entry.when.every((condition) => conditionMatches(condition, context)));
  return renderRuleParts(selected ? selected.parts : rule.otherwise, context);
}

export function validateColumnSettings(settings, columns) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Configurazione delle colonne non valida.");
  for (const [index, scoped] of Object.entries(settings)) {
    if (!columns.some((column) => String(column.index) === index) || !scoped || typeof scoped !== "object") throw new Error("Colonna della regola non valida.");
    for (const [scope, rule] of Object.entries(scoped)) {
      if (!RULE_SCOPES.some(([key]) => key === scope)) throw new Error("Categoria della regola non valida.");
      validateColumnRule(rule);
    }
  }
}
