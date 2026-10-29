// Builds the accounting proposal and the trace rows for one document.
// The column layout is a fictional example: it mimics the shape of a SAP batch-input file, not a real customer spec.
import { normalizeDocumentNumber, matchKey } from "./matching.js";
import { columnLetter, compactDate, decimalText, money, round2 } from "./format.js";
import { evaluateColumnRule, ruleContext } from "./columnRules.js";

export const TOLERANCE = 0.01;
export const COMPANY_CODE = "BD01";
export const ACCOUNTS = { services: "6100400", fees: "6200200" };
export const VAT_CODES = {
  E4: "Esente (natura N4)",
  I1: "Non imponibile N3.1",
  I2: "Non imponibile N3.2",
  I3: "Non imponibile N3.3",
  I4: "Non imponibile N3.4",
  I5: "Non imponibile N3.5",
  I6: "Non imponibile N3.6",
  A1: "Acquisti IVA 10%",
  A2: "Acquisti IVA 22%",
};
export const SLOT_LABELS = { supplier: "Fornitore", services: "Contropartita Servizi", fees: "Contropartita Commissioni" };
const DEBIT_KEYS = ["21", "40"];
const CREDIT_KEYS = ["31", "50"];

// General accounting rules of the profile: they decide how XML lines are split between the two counterparts.
export const DEFAULT_ACCOUNTING_RULES = {
  feeKeywords: ["commission", "fee"],
  roundingKeywords: ["arrotondamento"],
  negativeLinesAreFee: false,
  columnSettings: {},
};

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const QUARTERS = { I: [1, 2, 3], II: [4, 5, 6], III: [7, 8, 9], IV: [10, 11, 12] };

export const isCreditNote = (invoice) => invoice?.documentType === "TD04";
// Literal keywords, not regexes; rounding keywords win over everything else (as in the profile editor).
export function classifyLine(line, rules = DEFAULT_ACCOUNTING_RULES, credit = false) {
  const text = String(line.description ?? "").toLowerCase();
  const has = (words) => words.some((word) => word.trim() && text.includes(word.trim().toLowerCase()));
  if (has(rules.roundingKeywords ?? [])) return "services";
  const base = round2(line.quantity * line.unitPrice);
  if ((rules.negativeLinesAreFee && base < 0 && !credit) || has(rules.feeKeywords ?? [])) return "fees";
  return "services";
}
export const documentYear = (invoice) => (invoice?.date ?? "").slice(0, 4);
export const numberWithYear = (invoice) => `${normalizeDocumentNumber(invoice.number)}/${documentYear(invoice)}`;

export function invoiceLines(invoice, review = {}, rules = DEFAULT_ACCOUNTING_RULES) {
  const extra = (review.extraLines ?? []).map((line) => ({ ...line, extra: true }));
  const credit = isCreditNote(invoice);
  return [...invoice.lines, ...extra].map((line, index) => {
    const base = round2(line.quantity * line.unitPrice);
    return {
      ...line,
      index,
      base,
      vat: round2((base * line.vatRate) / 100),
      kind: review.lineKinds?.[index] ?? line.kind ?? classifyLine(line, rules, credit),
    };
  });
}

export function totalsOf(lines) {
  const totals = { services: { base: 0, vat: 0 }, fees: { base: 0, vat: 0 } };
  for (const kind of ["services", "fees"]) {
    const own = lines.filter((line) => line.kind === kind);
    totals[kind].base = round2(own.reduce((sum, line) => sum + line.base, 0));
    totals[kind].vat = round2(own.reduce((sum, line) => sum + line.vat, 0));
  }
  totals.base = round2(totals.services.base + totals.fees.base);
  totals.vat = round2(totals.services.vat + totals.fees.vat);
  totals.gross = round2(totals.base + totals.vat);
  return totals;
}

export function proposeVatCode(lines) {
  const rates = new Set(lines.map((line) => Number(line.vatRate)));
  const natures = new Set(lines.map((line) => line.nature ?? ""));
  if (!lines.length || rates.size !== 1 || natures.size !== 1) return "";
  if (rates.has(0)) {
    if (natures.has("N4")) return "E4";
    if (/^N3\.[1-6]$/.test([...natures][0])) return `I${[...natures][0].at(-1)}`;
    return "";
  }
  if (!natures.has("")) return "";
  if (rates.has(10)) return "A1";
  if (rates.has(22)) return "A2";
  return "";
}

function postingGroups(lines) {
  const groups = new Map();
  for (const line of lines) {
    const id = `${line.kind}:${Number(line.vatRate)}:${line.nature ?? ""}`;
    if (!groups.has(id)) groups.set(id, { id, slot: line.kind, rate: Number(line.vatRate), nature: line.nature ?? "", base: 0, vat: 0, lines: [] });
    const group = groups.get(id);
    group.lines.push(line);
    group.base = round2(group.base + line.base);
    group.vat = round2(group.vat + line.vat);
  }
  return [...groups.values()];
}

export function competenceEvidence(invoice) {
  const year = documentYear(invoice);
  const sources = [{ label: "Causale", text: invoice.causale }, ...invoice.lines.map((line, index) => ({ label: `Riga ${index + 1}`, text: line.description }))];
  const evidence = [];
  for (const source of sources) {
    const text = source.text ?? "";
    const months = new Set();
    for (const match of text.matchAll(new RegExp(`\\b(${MONTHS.join("|")})(?:\\s+(\\d{4}))?`, "gi"))) {
      months.add(`${match[2] ?? year}${String(MONTHS.indexOf(match[1].toLowerCase()) + 1).padStart(2, "0")}`);
    }
    for (const match of text.matchAll(/\b(IV|III|II|I)\s+trimestre(?:\s+(\d{4}))?/g)) {
      for (const month of QUARTERS[match[1]]) months.add(`${match[2] ?? year}${String(month).padStart(2, "0")}`);
    }
    if (months.size) evidence.push({ label: source.label, text, months: [...months] });
  }
  return evidence;
}

export function proposeCompetence(invoice) {
  const months = [...new Set(competenceEvidence(invoice).flatMap((item) => item.months))].sort();
  if (months.length) return { key: months.at(-1), reason: months.length === 1 ? "Mese indicato nel testo del documento." : "Periodo su più mesi: proposto l'ultimo mese del periodo." };
  return { key: compactDate(invoice.date).slice(0, 6), reason: "Nessun periodo nel testo: proposto il mese della data documento." };
}

// Sign convention of the trace: Dare = positive, Avere = negative. The supplier key follows the supplier sign;
// a counterpart key follows the sign of its taxable amount, or of its VAT when the taxable amount is zero.
export function defaultKey(slot, amount, vat = 0) {
  const direction = amount || vat;
  if (slot === "supplier") return direction > 0 ? "21" : "31";
  return direction < 0 ? "50" : "40";
}
export const postingSide = (key) => (DEBIT_KEYS.includes(String(key)) ? "Dare" : CREDIT_KEYS.includes(String(key)) ? "Avere" : "Non standard");

const fixed = (value) => ({ mode: "Fisso", text: `Valore costante «${value}»`, value: () => value });
const columns = [
  { label: "Società", ...fixed(COMPANY_CODE) },
  { label: "Area contabile", ...fixed("FI") },
  { label: "Sistema sorgente", ...fixed("FP") },
  { label: "ID lotto", mode: "Automatico", text: "Data elaborazione + progressivo: {AAAAMMGG}_FP{001}", value: (c) => c.batchId },
  { label: "Progressivo documento", mode: "Automatico", text: "Numero del documento nel lotto, in ordine di elenco", value: (c) => String(c.docSeq) },
  { label: "Progressivo riga", mode: "Automatico", text: "Numero della riga nel documento", value: (c) => String(c.rowSeq) },
  { label: "Tipo documento SAP", mode: "Condizionale", text: "KR fattura · KG nota di credito (TD04)", value: (c) => (c.credit ? "KG" : "KR") },
  { label: "Data documento", mode: "Da XML", text: "DatiGeneraliDocumento/Data in formato AAAAMMGG", value: (c) => compactDate(c.invoice.date) },
  { label: "Data registrazione", mode: "Da VIM", text: "Data ricezione SDI dal VIM (AAAAMMGG)", value: (c) => compactDate(c.vim?.sdiDate ?? c.invoice.date) },
  { label: "Periodo competenza", mode: "Campo guidato", text: "Chiave AAAAMM scelta nella proposta", value: (c) => c.competence },
  { label: "Riferimento", mode: "Composto", text: "Numero XML normalizzato + «/» + anno", value: (c) => numberWithYear(c.invoice) },
  { label: "Codice fornitore SAP", mode: "Anagrafica", text: "Codice SAP associato alla partita IVA del cedente", value: (c) => c.sapCode ?? "" },
  { label: "Divisa", ...fixed("EUR") },
  { label: "Partita IVA fornitore", mode: "Da XML", text: "CedentePrestatore/IdFiscaleIVA", value: (c) => c.invoice.supplierVat },
  { label: "Chiave contabile", mode: "Condizionale", text: "Dal segno: fornitore 31 Avere (−) / 21 Dare (+) · contropartite 40 Dare (+) / 50 Avere (−), dall'IVA se l'imponibile è zero", value: (c) => c.key },
  { label: "Tipo conto", mode: "Condizionale", text: "K riga fornitore · S righe di contropartita", value: (c) => (c.slot === "supplier" ? "K" : "S") },
  { label: "Conto", mode: "Condizionale", text: `Fornitore: codice SAP · Servizi ${ACCOUNTS.services} · Commissioni ${ACCOUNTS.fees}`, value: (c) => (c.slot === "supplier" ? c.sapCode ?? "" : ACCOUNTS[c.slot]) },
  { label: "Centro di costo", mode: "Anagrafica", text: "Centro di costo del fornitore, solo righe di contropartita", value: (c) => (c.slot === "supplier" ? "" : c.costCenter ?? "") },
  { label: "Profit center", ...fixed("PC100") },
  { label: "Codice IVA", mode: "Campo guidato", text: "Per contropartita e trattamento: E4 N4 · I1–I6 N3.1–N3.6 · A1 10% · A2 22%. Codici demo, non standard SAP universali.", value: (c) => (c.slot === "supplier" ? "" : c.vatCode) },
  { label: "Importo", mode: "Calcolato", text: "Con segno. Fornitore: −totale XML (fattura) o +totale (nota di credito) · Contropartite: imponibile della categoria", value: (c) => decimalText(c.amount) },
  { label: "Importo divisa locale", mode: "Calcolato", text: "Uguale a Importo (documenti in EUR)", value: (c) => decimalText(c.amount) },
  { label: "IVA già calcolata", mode: "Calcolato", text: "Con segno, imposta della contropartita; vuota sul fornitore o se pari a zero", value: (c) => (c.slot === "supplier" || !c.vat ? "" : decimalText(c.vat)) },
  { label: "Condizione pagamento", mode: "Condizionale", text: "Z030 sulla riga fornitore", value: (c) => (c.slot === "supplier" ? "Z030" : "") },
  { label: "Modalità pagamento", mode: "Condizionale", text: "B (bonifico) sulla riga fornitore", value: (c) => (c.slot === "supplier" ? "B" : "") },
  { label: "Assegnazione", mode: "Composto", text: "Data SDI (AAAAMMGG) + «-» + riferimento, max 18 caratteri", value: (c) => `${compactDate(c.vim?.sdiDate ?? c.invoice.date)}-${matchKey(c.invoice.number)}`.slice(0, 18) },
  { label: "Testo posizione", mode: "Composto", text: "«FATTURA N.» o «N.C. N.» + numero normalizzato/anno", value: (c) => `${c.credit ? "N.C. N." : "FATTURA N."} ${numberWithYear(c.invoice)}` },
  { label: "Categoria statistica", mode: "Condizionale", text: "SERVIZI o COMMISSIONI sulle contropartite", value: (c) => (c.slot === "services" ? "SERVIZI" : c.slot === "fees" ? "COMMISSIONI" : "") },
  { label: "Testo testata", mode: "Composto", text: "ID lotto + «/» + progressivo documento", value: (c) => `${c.batchId}/${c.docSeq}` },
  { label: "Data base pagamento", mode: "Condizionale", text: "Data documento XML (AAAAMMGG), solo riga fornitore", value: (c) => (c.slot === "supplier" ? compactDate(c.invoice.date) : "") },
  { label: "Esercizio", mode: "Da XML", text: "Anno della data documento", value: (c) => String(c.invoice.date).slice(0, 4) },
  { label: "Paese fornitore", mode: "Da XML", text: "CedentePrestatore/IdFiscaleIVA/IdPaese", value: () => "IT" },
  { label: "Utente caricamento", ...fixed("UTENTE_DEMO") },
  { label: "Riferimento VIM", mode: "Da VIM", text: "Riferimento documento così come registrato nel VIM", value: (c) => c.vim?.reference ?? "" },
];

// Sums every trace row's amount and VAT as written in the trace: a balanced document always nets to zero.
export const parseAmount = (value) => (value === "" || value === undefined ? 0 : Number(String(value).replace(/\./g, "").replace(",", ".")) || 0);

// Column order of the trace; null marks an unused field kept empty, as in the real SAP layout.
const LAYOUT = [
  "Società", "Area contabile", "Sistema sorgente", "ID lotto", "Progressivo documento", "Progressivo riga", "Tipo documento SAP",
  "Data documento", "Data registrazione", "Periodo competenza", "Riferimento", "Codice fornitore SAP", "Divisa", null,
  "Chiave contabile", "Tipo conto", "Conto", "Centro di costo", null, "Codice IVA", "Importo", "Importo divisa locale",
  "IVA già calcolata", "Condizione pagamento", null, "Assegnazione", "Testo posizione", "Modalità pagamento", null,
  "Partita IVA fornitore", "Profit center", null, null, "Categoria statistica", null, "Testo testata", null, "Data base pagamento",
  null, null, "Esercizio", null, null, "Paese fornitore", null, "Utente caricamento", null, null, "Riferimento VIM", null,
];
const byLabel = Object.fromEntries(columns.map((definition) => [definition.label, definition]));

export const TRACE_COLUMNS = LAYOUT.map((label, offset) => {
  const index = offset + 1;
  const definition = label ? byLabel[label] : { label: `Campo libero ${String(index).padStart(2, "0")}`, mode: "Vuoto", text: "Non valorizzato in questo profilo", value: () => "" };
  return { ...definition, index, letter: columnLetter(index) };
});
export const column = (label) => TRACE_COLUMNS.find((item) => item.label === label);
export const COL = {
  key: column("Chiave contabile").index,
  account: column("Conto").index,
  amount: column("Importo").index,
  vat: column("IVA già calcolata").index,
  vatCode: column("Codice IVA").index,
  text: column("Testo posizione").index,
  supplier: column("Codice fornitore SAP").index,
};

export function buildPreview({ invoice, vim, supplier, review = {}, batchId, docSeq, rules = DEFAULT_ACCOUNTING_RULES }) {
  const ruleIssues = [];
  const credit = isCreditNote(invoice);
  const lines = invoiceLines(invoice, review, rules);
  const totals = totalsOf(lines);
  const vatProposal = proposeVatCode(lines);
  const vatCode = vatProposal;
  const competenceProposal = proposeCompetence(invoice);
  const competence = review.competence || competenceProposal.key;
  const sapCode = supplier?.sapCode ?? null;
  // Some credit-note XML already carry negative amounts: the document is reversed once, never line by line twice.
  const sourcePolarity = credit && totals.gross < 0 ? -1 : 1;
  const multiplier = (credit ? -1 : 1) * sourcePolarity;
  const supplierAmount = round2(-Math.abs(invoice.declaredTotal) * (credit ? -1 : 1));
  const groups = postingGroups(lines);
  const slots = [
    { id: "supplier", slot: "supplier", amount: supplierAmount, vat: 0 },
    ...groups.filter((group) => group.base !== 0 || group.vat !== 0)
      .map((group) => ({ ...group, vatProposal: proposeVatCode(group.lines), amount: round2(group.base * multiplier), vat: round2(group.vat * multiplier) })),
  ];
  const rows = slots.map((item, position) => {
    const proposedKey = defaultKey(item.slot, item.amount, item.vat);
    const context = {
      ...item, invoice, vim, supplier, credit, batchId, docSeq, rowSeq: position + 1, sapCode, costCenter: supplier?.costCenter,
      vatCode: review.vatCodes?.[item.id] ?? item.vatProposal ?? "", competence,
      key: review.keys?.[item.id] ?? (groups.filter((group) => group.slot === item.slot).length <= 1 ? review.keys?.[item.slot] : undefined) ?? proposedKey,
    };
    const values = TRACE_COLUMNS.map((def) => {
      const standard = def.value(context);
      const settings = rules.columnSettings?.[def.index];
      const setting = settings?.[item.slot] ?? settings?.all;
      if (!setting) return standard;
      try {
        return evaluateColumnRule(setting, ruleContext(context, standard));
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        ruleIssues.push({ code: `column-rule-${item.id}-${def.index}`, severity: "error", location: "registration",
          message: `Regola colonna ${def.letter}: ${error.message}`, suggestion: "Correggi la regola nella pagina Regole." });
        return "";
      }
    });
    const overrides = review.overrides?.[item.id] ?? (groups.filter((group) => group.slot === item.slot).length <= 1 ? review.overrides?.[item.slot] : undefined) ?? {};
    for (const [index, value] of Object.entries(overrides)) values[Number(index) - 1] = value;
    const amount = parseAmount(values[COL.amount - 1]);
    const vat = parseAmount(values[COL.vat - 1]);
    const taxLabel = item.slot === "supplier" ? "" : ` · ${item.rate}%${item.nature ? ` ${item.nature}` : ""}`;
    return { id: item.id, slot: item.slot, label: `${SLOT_LABELS[item.slot]}${taxLabel}`, rate: item.rate, nature: item.nature, vatProposal: item.vatProposal, sourceAmount: item.amount, sourceVat: item.vat, values, context, defaultKey: proposedKey, amount, vat, key: values[COL.key - 1] };
  });
  const balance = round2(rows.reduce((sum, row) => sum + row.amount + row.vat, 0));
  const debit = round2(rows.reduce((sum, row) => sum + Math.max(row.amount, 0) + Math.max(row.vat, 0), 0));
  const creditSide = round2(rows.reduce((sum, row) => sum + Math.min(row.amount, 0) + Math.min(row.vat, 0), 0));
  const issues = checks({ invoice, vim, supplier, review, lines, totals, rows, balance, competence, credit, sourcePolarity });
  issues.unshift(...ruleIssues);
  return { rows, lines, totals, balance, debit, creditSide, multiplier, vatCode, vatProposal, competence, competenceProposal, evidence: competenceEvidence(invoice), issues, credit, postingSide };
}

function checks({ invoice, vim, supplier, review, lines, totals, rows, balance, competence, credit, sourcePolarity }) {
  const issues = [];
  const add = (code, severity, location, message, suggestion, action) => issues.push({ code, severity, location, message, suggestion, action });

  if (!["TD01", "TD04"].includes(invoice.documentType)) {
    add("unsupported-document-type", "error", "document", `Tipo documento ${invoice.documentType} non gestito dal profilo demo.`, "Sono simulate solo fatture TD01 e note di credito TD04; autofatture e integrazioni richiedono un profilo dedicato.");
  }
  if (!supplier?.sapCode) {
    add("missing-sap-code", "error", "supplier", `Il fornitore ${supplier?.name ?? invoice.supplierVat} non ha un codice SAP in anagrafica: colonne ${letterOf("Codice fornitore SAP")} e ${letterOf("Conto")} vuote.`,
      vim?.vendor ? `Il VIM indica il fornitore ${vim.vendor}: puoi associarlo in anagrafica.` : "Completa l'anagrafica fornitori.",
      vim?.vendor ? { type: "assign-sap", label: `Usa codice VIM ${vim.vendor}`, vat: invoice.supplierVat, sapCode: vim.vendor } : null);
  } else if (vim && vim.vendor !== supplier.sapCode) {
    add("vendor-mismatch", "warning", "supplier", `Il VIM indica il fornitore ${vim.vendor}, l'anagrafica associa la partita IVA a ${supplier.sapCode}.`, "Verifica che la riga VIM sia abbinata alla fattura corretta.");
  }
  if (!supplier?.costCenter) add("missing-cost-center", "error", "registration", `Centro di costo mancante in anagrafica (colonna ${letterOf("Centro di costo")}).`);

  const expectedTotal = credit ? Math.abs(invoice.declaredTotal) : invoice.declaredTotal;
  const calculatedTotal = credit ? Math.abs(totals.gross) : totals.gross;
  if (round2(expectedTotal - calculatedTotal) !== 0) {
    const difference = round2(expectedTotal - calculatedTotal);
    const evidence = invoice.supportingEvidence;
    const alreadyAdded = evidence && review.extraLines?.some((line) => line.evidenceId === evidence.id);
    add("total-mismatch", "error", "document", `Totale XML ${money(invoice.declaredTotal)} diverso dalla somma delle righe ${money(totals.gross)} (differenza ${money(difference)}).`,
      evidence ? `Evidenza mock ${evidence.id}: ${evidence.description}. Integrare solo dopo riscontro; l'XML originale resta invariato.`
        : "Riconciliare il documento con il fornitore: dalla sola differenza non si possono dedurre conto, imponibile o aliquota. Nessuna rettifica automatica.",
      evidence && !alreadyAdded ? { type: "add-supported-line", label: `Conferma riscontro ${evidence.id}`, line: { ...evidence.line, evidenceId: evidence.id } } : null);
  }
  const gap = vim ? round2(Math.abs(vim.amount) - Math.abs(invoice.declaredTotal)) : 0;
  if (gap !== 0) {
    add("vim-amount", Math.abs(gap) <= TOLERANCE ? "info" : "warning", "document", `Importo VIM ${money(vim.amount)} e totale XML ${money(invoice.declaredTotal)} differiscono di ${money(gap)}.`,
      Math.abs(gap) <= TOLERANCE ? "Differenza entro la tolleranza di arrotondamento: il tracciato usa gli importi dell'XML." : "Verifica l'importo registrato in VIM.");
  }
  if (/\s{2,}/.test(invoice.number.trim())) {
    add("number-spaces", "warning", "document", `Il numero XML «${invoice.number}» contiene spazi multipli.`,
      `Nel testo posizione (colonna ${letterOf("Testo posizione")}) viene scritto «${rows[0].values[COL.text - 1]}».`);
  }
  if (credit) add("credit-note", "info", "document", sourcePolarity < 0
    ? "Nota di credito (TD04) con righe XML già negative: la proposta evita la doppia inversione dei segni."
    : "Nota di credito (TD04): documento KG, segni invertiti una sola volta. Fornitore in Dare (21, +), contropartite in Avere (50, −).");
  if (lines.every((line) => Number(line.vatRate) === 0)) add("exempt", "info", "registration", `Operazioni senza addebito IVA (${[...new Set(lines.map((line) => line.nature ?? "natura assente"))].join(", ")}): colonna ${letterOf("IVA già calcolata")} vuota. La natura distingue il trattamento fiscale.`);
  if (invoice.declaredTotal < 0) add("negative-total", "warning", "document", "Il totale XML è negativo: verifica il segno e il TipoDocumento prima di registrare.", "Il valore negativo non viene corretto automaticamente.");
  if (lines.some((line) => line.base < 0) && lines.some((line) => line.base > 0)) {
    add("mixed-lines", "warning", "registration", "Il documento contiene righe di segno misto (sconti o rettifiche).",
      "Il segno di ogni riga viene mantenuto: le righe negative riducono la loro contropartita o la portano in Avere (chiave 50). Controlla la categoria assegnata.");
  }
  const rates = [...new Set(lines.map((line) => `${line.vatRate}% ${line.nature ?? ""}`.trim()))];
  if (rates.length > 1) add("mixed-rates", "info", "registration", `Trattamenti IVA distinti (${rates.join(", ")}): contropartite separate per categoria, aliquota e natura.`);
  if (invoice.vatDeductibility !== undefined && invoice.vatDeductibility !== 100) {
    add("unsupported-deductibility", "error", "registration", "Detraibilità IVA diversa dal 100%: casistica non gestita dal profilo dimostrativo.", "Serve una configurazione fiscale dedicata per IVA indetraibile o pro-rata; non confermare con questo profilo.");
  }
  lines.forEach((line) => {
    if (!proposeVatCode([line])) add(`tax-treatment-${line.index}`, "error", "registration", `Riga XML ${line.index + 1}: aliquota/natura non supportata (${line.vatRate}% ${line.nature ?? "natura assente"}).`, "Il profilo gestisce solo 10%, 22%, esente N4 e non imponibile N3.x. Altri regimi richiedono un profilo dedicato.");
  });
  if (review.vatCode) add("legacy-vat-code", "error", "registration", "La bozza contiene un vecchio codice IVA a livello documento.", "Rigenera la proposta: i codici ora sono distinti per contropartita.");
  const months = new Set(competenceEvidence(invoice).flatMap((item) => item.months));
  if (months.size > 1) add("multi-period", "warning", "competence", "Prestazione riferita a più mesi: la competenza proposta non ripartisce automaticamente il costo.", "Verifica ratei/risconti e il periodo contabile; la sola chiave AAAAMM non esegue un assestamento.");

  rows.forEach((row, index) => {
    const where = `Riga ${index + 1} (${row.label})`;
    const required = [
      "Società", "Area contabile", "Sistema sorgente", "ID lotto", "Progressivo documento",
      "Progressivo riga", "Tipo documento SAP", "Data documento", "Data registrazione",
      "Periodo competenza", "Riferimento", "Codice fornitore SAP", "Divisa", "Partita IVA fornitore",
      "Chiave contabile", "Tipo conto", "Conto", "Importo", "Importo divisa locale",
      "Testo posizione", "Testo testata", "Esercizio", "Paese fornitore", "Utente caricamento", "Riferimento VIM",
      ...(row.slot === "supplier" ? ["Condizione pagamento", "Modalità pagamento", "Data base pagamento"] : ["Centro di costo", "Codice IVA"]),
    ];
    for (const label of required) {
      const def = column(label);
      if (!String(row.values[def.index - 1] ?? "").trim()) {
        add(`required-${index}-${def.index}`, "error", "registration", `${where}: campo obbligatorio ${def.letter} (${label}) vuoto.`, "Correggi la regola o la forzatura prima di confermare.");
      }
    }
    const expected = {
      "Tipo documento SAP": credit ? "KG" : "KR",
      "Divisa": "EUR",
      "ID lotto": row.context.batchId,
      "Progressivo documento": String(row.context.docSeq),
      "Progressivo riga": String(row.context.rowSeq),
      "Periodo competenza": competence,
      "Codice fornitore SAP": supplier?.sapCode ?? "",
      "Partita IVA fornitore": invoice.supplierVat,
    };
    for (const [label, value] of Object.entries(expected)) {
      const def = column(label);
      if (String(row.values[def.index - 1] ?? "") !== value) {
        add(`profile-${index}-${def.index}`, "error", "registration", `${where}: ${label} non coerente con i dati verificati del profilo.`, "Ripristina il valore standard o correggi i dati nella proposta.");
      }
    }
    for (const label of ["Data documento", "Data registrazione", ...(row.slot === "supplier" ? ["Data base pagamento"] : [])]) {
      const def = column(label);
      const raw = String(row.values[def.index - 1] ?? "");
      const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const date = new Date(`${iso}T00:00:00Z`);
      if (!/^\d{8}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
        add(`date-${index}-${def.index}`, "error", "registration", `${where}: ${label} deve contenere una data valida in formato AAAAMMGG.`);
      }
    }
    const localAmount = String(row.values[column("Importo divisa locale").index - 1] ?? "");
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(localAmount) || parseAmount(localAmount) !== row.sourceAmount) {
      add(`local-amount-${index}`, "error", "registration", `${where}: importo in divisa locale non coerente con l'importo riconciliato in EUR.`);
    }
    const direction = row.amount || row.vat;
    for (const field of [COL.amount, COL.vat]) {
      const raw = String(row.values[field - 1] ?? "");
      if ((field === COL.amount && !raw) || (raw && !/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))) {
        add(`invalid-amount-${index}-${field}`, "error", "registration", `${where}: importo non valido nella colonna ${TRACE_COLUMNS[field - 1].letter}.`, "Usa un importo numerico con virgola decimale, non testo o formule.");
      }
    }
    if (row.slot !== "supplier" && row.values[COL.vatCode - 1] !== row.vatProposal) {
      add(`vat-code-${index}`, "error", "registration", `${where}: codice IVA non coerente con aliquota e natura del gruppo.`, "Ripristina il codice proposto o usa un profilo fiscale dedicato.");
    }
    if (row.slot === "supplier" && row.values[COL.vatCode - 1]) add("supplier-vat-code", "error", "registration", "Codice IVA sulla riga fornitore: nel profilo va valorizzato solo sulle contropartite.");
    if (row.values[column("Tipo conto").index - 1] !== (row.slot === "supplier" ? "K" : "S")) add(`account-kind-${index}`, "error", "registration", `${where}: tipo conto incoerente con la riga (K fornitore, S conto generale).`);
    if (row.amount !== row.sourceAmount || row.vat !== row.sourceVat) {
      add(`source-amount-${index}`, "error", "registration", `${where}: importo o IVA forzati diversi dai dati riconciliati.`, "Non basta azzerare il saldo: ripristina gli importi o documenta la rettifica nella proposta, senza alterare l'IVA nel tracciato.");
    }
    if (!row.values[COL.account - 1]) add(`account-${index}`, "error", "registration", `${where}: conto non impostato.`);
    if (!/^\d{2}$/.test(row.key)) add(`key-${index}`, "error", "registration", `${where}: chiave contabile «${row.key}» non valida.`, "Usa una chiave SAP a due cifre.");
    else if (![...DEBIT_KEYS, ...CREDIT_KEYS].includes(row.key)) add(`custom-key-${index}`, "error", "registration", `${where}: chiave ${row.key} non supportata dal profilo demo 21/31/40/50.`, "Altre chiavi richiedono un profilo dedicato.");
    if ((row.slot === "supplier" && ["40", "50"].includes(row.key)) || (row.slot !== "supplier" && ["21", "31"].includes(row.key))) {
      add(`account-type-${index}`, "error", "registration", `${where}: chiave ${row.key} del tipo conto errato.`,
        row.slot === "supplier" ? "La riga fornitore (tipo conto K) usa le chiavi 21/31." : "Le contropartite (tipo conto S) usano le chiavi 40/50.");
    } else if (row.slot === "supplier" && ((row.key === "21" && direction < 0) || (row.key === "31" && direction > 0))) {
      add(`direction-${index}`, "error", "registration", `${where}: chiave ${row.key} incoerente con l'importo ${direction < 0 ? "negativo" : "positivo"}.`,
        "Convenzione del tracciato: 21 fornitore Dare (+), 31 fornitore Avere (−).");
    } else if (row.slot !== "supplier" && ((row.key === "40" && direction < 0) || (row.key === "50" && direction > 0))) {
      add(`counterpart-direction-${index}`, "error", "registration", `${where}: ${postingSide(row.key)} (chiave ${row.key}) incoerente con il segno nel profilo demo.`,
        "Ripristina la chiave coerente: 40 positivo, 50 negativo. Altre convenzioni richiedono un profilo dedicato.");
    }
    if (row.amount !== 0 && row.vat !== 0 && Math.sign(row.amount) !== Math.sign(row.vat)) {
      add(`vat-sign-${index}`, "error", "registration", `${where}: imponibile e IVA hanno segni opposti.`, "Verifica che l'IVA non sia stata usata per compensare una differenza.");
    }
  });
  const supplierRow = rows[0];
  if (supplierRow && ((credit && supplierRow.amount < 0) || (!credit && supplierRow.amount > 0))) {
    add("document-direction", "warning", "registration", "Il segno della riga fornitore non corrisponde al tipo documento XML.", "Fattura: fornitore negativo (Avere). Nota di credito: fornitore positivo (Dare).");
  }
  if (supplierRow && round2(Math.abs(supplierRow.amount) - Math.abs(invoice.declaredTotal)) !== 0) {
    add("header-total", "warning", "registration", `L'importo fornitore ${money(supplierRow.amount)} differisce dal totale XML ${money(invoice.declaredTotal)}.`, "Verifica la modifica manuale nel tracciato.");
  }

  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(competence)) add("competence", "error", "competence", "La competenza deve essere nel formato AAAAMM.");
  if (balance !== 0) add("balance", "error", "registration", `Il tracciato non si azzera: saldo ${money(balance)}.`,
    `La somma con segno di Importo (${letterOf("Importo")}) e IVA (${letterOf("IVA già calcolata")}) su tutte le righe deve essere zero. Non usare l'IVA per assorbire differenze.`);
  return issues;
}

function letterOf(label) {
  return column(label).letter;
}
