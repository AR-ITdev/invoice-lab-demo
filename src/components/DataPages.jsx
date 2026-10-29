import { Fragment, useState } from "react";
import { COST_CENTERS } from "../data/demoData.js";
import { dateText, money } from "../lib/format.js";
import { ACCOUNTS, COMPANY_CODE, TRACE_COLUMNS, VAT_CODES } from "../lib/proposal.js";
import { Badge } from "./RegistrationPane.jsx";
import { SupplierIcon } from "./icons.jsx";
import AssociationControls from "./AssociationControls.jsx";
import ColumnRuleEditor from "./ColumnRuleEditor.jsx";

const MATCH_LABELS = { exact: "Esatto", normalized: "Normalizzato", manual: "Manuale", none: "Nessun XML" };

export function VimPage({ project, focusId, onLink, onOpen }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(() => focusId ? `${project.documents.find((doc) => doc.id === focusId)?.vim ? "vim" : "xml"}:${focusId}` : null);
  const documents = project.documents;
  const matches = (doc) => `${doc.vim?.reference ?? ""} ${doc.vim?.vendor ?? ""} ${doc.invoice?.number ?? ""} ${doc.invoice?.fileName ?? ""} ${doc.supplier?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase());
  const rows = documents.filter((doc) => doc.vim && matches(doc)
    && filter !== "orphan" && (filter !== "unlinked" || !doc.invoice) && (filter !== "linked" || doc.invoice));
  const xmls = documents.filter((doc) => doc.invoice && matches(doc)
    && filter !== "unlinked" && (filter !== "orphan" || !doc.vim) && (filter !== "linked" || doc.vim));
  const filters = [
    ["all", "Tutti", documents.length],
    ["linked", "Abbinati", documents.filter((doc) => doc.vim && doc.invoice).length],
    ["unlinked", "VIM senza XML", documents.filter((doc) => doc.vim && !doc.invoice).length],
    ["orphan", "XML senza VIM", documents.filter((doc) => !doc.vim).length],
  ];
  const editor = (doc, span, side) => editing === `${side}:${doc.id}` && <tr><td colSpan={span}>
    <AssociationControls key={`${doc.id}-${doc.xmlId}`} doc={doc} documents={documents} onLink={onLink} />
  </td></tr>;
  return <div className="page-scroll"><section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">ABBINAMENTI</p><h1>Export VIM e fatture XML</h1>
      <p className="muted">Collegamenti uno-a-uno, consultabili da VIM a fattura e viceversa. L'abbinamento automatico confronta riferimento normalizzato e fornitore; i candidati ambigui restano da verificare. Puoi collegare, cambiare o scollegare senza eliminare i documenti.</p></div></div>
    <div className="rules-toolbar">
      <div className="association-actions" role="group" aria-label="Filtra abbinamenti">{filters.map(([id, label, count]) =>
        <button type="button" className={`secondary-button ${filter === id ? "active" : ""}`} aria-pressed={filter === id} key={id}
          onClick={() => { setFilter(id); setEditing(null); }}>{label} · {count}</button>)}</div>
      <input type="search" aria-label="Cerca negli abbinamenti" placeholder="Riferimento, fornitore o file..." value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <h2>Righe VIM</h2>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Riferimento VIM</th><th>Fornitore</th><th>Data SDI</th><th className="number">Importo</th><th>XML abbinato</th><th>Abbinamento</th><th>Stato</th><th /></tr></thead>
      <tbody>{rows.map((doc) => <Fragment key={doc.id}><tr className={editing === `vim:${doc.id}` ? "association-selected" : ""}><td><b>{doc.vim.reference}</b></td><td>{doc.vim.vendor}</td><td>{dateText(doc.vim.sdiDate)}</td><td className="number">{money(doc.vim.amount)}</td>
          <td>{doc.invoice ? <button type="button" className="secondary-button" onClick={() => onOpen(doc.id)}>{doc.invoice.number} · Apri fattura</button> : "Nessun XML"}</td>
          <td><span className={`match-tag ${doc.match}`}>{MATCH_LABELS[doc.match]}</span></td><td><Badge status={doc.status} /></td>
          <td><button type="button" className="secondary-button" aria-label={`Gestisci riga VIM ${doc.vim.reference}`} aria-expanded={editing === `vim:${doc.id}`}
            onClick={() => setEditing(editing === `vim:${doc.id}` ? null : `vim:${doc.id}`)}>Gestisci</button>
            <button type="button" className="secondary-button" onClick={() => onOpen(doc.id)}>Apri lavorazione</button></td></tr>{editor(doc, 8, "vim")}</Fragment>)}
        {!rows.length && <tr><td colSpan={8}>Nessuna riga VIM per questo filtro.</td></tr>}
      </tbody></table></div>
    <h2>Fatture XML e collegamento inverso</h2>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Fattura XML</th><th>Fornitore</th><th>Importo</th><th>Riga VIM</th><th>Azioni</th></tr></thead>
      <tbody>{xmls.map((doc) => <Fragment key={doc.id}><tr className={editing === `xml:${doc.id}` ? "association-selected" : ""}>
        <td><b>{doc.invoice.number}</b><small>{doc.invoice.fileName}</small></td><td>{doc.supplier?.name ?? doc.invoice.supplierVat}</td><td>{money(doc.invoice.declaredTotal)}</td>
        <td>{doc.vim ? `${doc.vim.reference} · ${doc.vim.vendor}` : "Nessuna riga VIM"}</td>
        <td><button type="button" className="secondary-button" onClick={() => onOpen(doc.id)}>Apri fattura</button>
          <button type="button" className="secondary-button" aria-label={`Gestisci collegamento fattura ${doc.invoice.number}`} aria-expanded={editing === `xml:${doc.id}`}
            onClick={() => setEditing(editing === `xml:${doc.id}` ? null : `xml:${doc.id}`)}>{doc.vim ? "Gestisci collegamento VIM" : "Collega VIM"}</button></td>
      </tr>{editor(doc, 5, "xml")}</Fragment>)}
        {!xmls.length && <tr><td colSpan={5}>Nessuna fattura XML per questo filtro.</td></tr>}
      </tbody></table></div>
  </section></div>;
}

export function SupplierPage({ suppliers, onChange }) {
  return <div className="page-scroll"><section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">ANAGRAFICA</p><h1>Fornitori e codici SAP</h1>
      <p className="muted">La partita IVA del cedente nell'XML viene ricondotta al codice fornitore SAP e al centro di costo. Senza codice SAP le colonne fornitore e conto del tracciato restano vuote.</p></div></div>
    <p className="info-banner">Le modifiche conservano i collegamenti VIM/XML e riaprono le registrazioni elaborate del fornitore. Prima di esportare occorre verificarle e confermarle di nuovo.</p>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Fornitore</th><th>Partita IVA</th><th>Codice fornitore SAP</th><th>Centro di costo</th></tr></thead>
      <tbody>{Object.values(suppliers).map((supplier) => <tr key={supplier.vat}>
        <td><div className="supplier-name"><span className="supplier-icon"><SupplierIcon supplier={supplier} /></span><div><b>{supplier.name}</b><small>{supplier.category} · {supplier.city}</small></div></div></td>
        <td>IT{supplier.vat}</td>
        <td><input aria-label={`Codice SAP ${supplier.name}`} className={supplier.sapCode ? "" : "missing-value"} value={supplier.sapCode ?? ""} placeholder="Mancante" maxLength={10}
          onChange={(event) => onChange(supplier.vat, { sapCode: event.target.value.trim() || null })} /></td>
        <td><select aria-label={`Centro di costo ${supplier.name}`} value={supplier.costCenter ?? ""} onChange={(event) => onChange(supplier.vat, { costCenter: event.target.value || null })}>
          <option value="">— nessuno —</option>{COST_CENTERS.map((center) => <option key={center.id} value={center.id}>{center.id} · {center.label}</option>)}</select></td>
      </tr>)}</tbody></table></div>
  </section></div>;
}

const keywordText = (words) => words.join("; ");
const keywordList = (text) => text.split(";").map((word) => word.trim()).filter(Boolean);

function KeywordField({ label, value, onChange }) {
  const [text, setText] = useState(keywordText(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(keywordText(value));
  }
  return <label className="field"><span>{label}</span>
    <input value={text} onChange={(event) => setText(event.target.value)} onBlur={() => onChange(keywordList(text))} /></label>;
}

function GeneralRules({ rules, hasProject, onChange, onReset }) {
  return <section className="general-rules" aria-label="Regole contabili generali">
    <h2>Regole contabili generali</h2>
    <p className="muted">Valgono per ogni documento, prima delle regole di colonna: decidono segni, verso Dare/Avere e azzeramento della registrazione.</p>
    <div className="rules-params general">
      <section className="card"><h3>Segni e verso</h3><ul>
        <li>Nel tracciato gli importi sono <b>con segno</b>: Dare positivo, Avere negativo.</li>
        <li>Fattura: fornitore <b>−totale</b> in Avere (<b>31</b>), contropartite <b>+imponibile</b> e <b>+IVA</b> in Dare (<b>40</b>).</li>
        <li>Nota di credito (TD04): segni invertiti <b>una sola volta</b>: fornitore +totale (<b>21</b>), contropartite negative (<b>50</b>).</li>
        <li>Se l'XML della nota ha già righe negative non si inverte di nuovo (no doppia inversione).</li>
        <li>Chiave di contropartita dal segno dell'imponibile; se è zero, dal segno dell'IVA.</li>
      </ul></section>
      <section className="card"><h3>Azzeramento</h3><ul>
        <li>Per ogni documento: <b>Σ (Importo + IVA) = 0,00</b> su tutte le righe del tracciato.</li>
        <li>Fornitore = −(imponibili + IVA delle contropartite).</li>
        <li>IVA e imponibile della stessa riga devono avere lo stesso segno.</li>
        <li>Nessuna differenza viene assorbita nell'IVA: va spiegata con una riga esplicita.</li>
        <li>Saldo diverso da zero = documento non confermabile.</li>
      </ul></section>
      <section className="card"><h3>Controlli di coerenza</h3><ul>
        <li>Fornitore (tipo conto K) solo 21/31; contropartite (S) solo 40/50.</li>
        <li>21 con importo negativo o 31 con positivo: <b>errore</b>.</li>
        <li>40 negativo o 50 positivo: <b>verso incoerente nel profilo demo</b>.</li>
        <li>Segno del fornitore diverso dal tipo documento, righe di segno misto, aliquote diverse: <b>peculiarità</b>.</li>
      </ul></section>
      <section className="card editable"><h3>Classificazione delle righe XML</h3>
        <KeywordField label="Parole Commissioni (separate da ;)" value={rules.feeKeywords} onChange={(feeKeywords) => onChange({ feeKeywords })} />
        <KeywordField label="Parole arrotondamento → Servizi (hanno precedenza)" value={rules.roundingKeywords} onChange={(roundingKeywords) => onChange({ roundingKeywords })} />
        <label className="check-field"><input type="checkbox" checked={rules.negativeLinesAreFee} onChange={(event) => onChange({ negativeLinesAreFee: event.target.checked })} />
          Eccezione del profilo: sposta le righe negative nel conto Commissioni (non una regola SAP)</label>
        <p className="muted">Predefinito: gli sconti riducono la categoria di costo assegnata. La sola presenza di una commissione non cambia il trattamento IVA.</p>
        <div className="general-rules-footer"><span className="muted">{hasProject ? "Le modifiche ricalcolano subito le proposte non confermate." : "Applicate ai prossimi progetti."}</span>
          <button type="button" className="secondary-button" onClick={onReset}>Ripristina</button></div>
      </section>
    </div>
  </section>;
}

export function RulesPage({ rules, hasProject, documents, onChange, onReset }) {
  const [query, setQuery] = useState("");
  const [hideFree, setHideFree] = useState(true);
  const [editing, setEditing] = useState(null);
  const needle = query.trim().toLowerCase();
  const visible = TRACE_COLUMNS.filter((column) => (!hideFree || column.mode !== "Vuoto")
    && (!needle || `${column.letter} ${column.label} ${column.text}`.toLowerCase().includes(needle)));
  return <div className="page-scroll"><section className="data-page">
    <div className="data-page-heading"><div><p className="eyebrow">PROFILO REGOLE · DEMO</p><h1>Regole contabili e tracciato di registrazione</h1>
      <p className="muted">Regole contabili generali e regole per {TRACE_COLUMNS.length} colonne: testo e dati, casi condizionali ordinati e risultati diversi per categoria di riga. I controlli contabili restano obbligatori. Le modifiche richiedono una nuova verifica delle lavorazioni.</p></div></div>
    <GeneralRules rules={rules} hasProject={hasProject} onChange={onChange} onReset={onReset} />
    <h2 className="rules-section-title">Parametri del profilo</h2>
    <div className="rules-params">
      <section className="card"><h3>Codici IVA</h3><ul>{Object.entries(VAT_CODES).map(([code, label]) => <li key={code}><b>{code}</b> {label}</li>)}</ul></section>
      <section className="card"><h3>Conti di contropartita</h3><ul><li><b>{ACCOUNTS.services}</b> Servizi</li><li><b>{ACCOUNTS.fees}</b> Commissioni</li><li>Società <b>{COMPANY_CODE}</b></li></ul></section>
      <section className="card"><h3>Chiavi contabili</h3><ul><li><b>21</b> fornitore Dare (+)</li><li><b>31</b> fornitore Avere (−)</li><li><b>40</b> conto generale Dare (+)</li><li><b>50</b> conto generale Avere (−)</li></ul></section>
      <section className="card"><h3>Lotto e righe</h3><ul><li>ID lotto <b>AAAAMMGG_FP001</b></li><li>1 riga fornitore + contropartite distinte per categoria, aliquota e natura</li><li>Saldo richiesto esattamente 0,00 €</li><li>Tolleranza 0,01 € solo nel confronto VIM/XML</li></ul></section>
    </div>
    <p className="info-banner">Tracciato dimostrativo a 50 colonne, non formato universale SAP. Segni, conti e codici IVA dipendono dal profilo. IVA detraibile al 100% nei soli scenari simulati: pro-rata bancario, indetraibilità e regimi speciali richiedono configurazioni non incluse. La competenza proposta è un'indicazione da verificare, non una scrittura automatica di ratei o risconti.</p>
    <h2 className="rules-section-title">Regole delle colonne</h2>
    <div className="rules-toolbar">
      <input type="search" aria-label="Cerca colonna" placeholder="Cerca per lettera, nome o regola…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <label><input type="checkbox" checked={hideFree} onChange={(event) => setHideFree(event.target.checked)} />Nascondi campi liberi</label>
      <span className="muted">{visible.length} colonne</span>
    </div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Col.</th><th>#</th><th>Campo</th><th>Modalità</th><th>Regola</th><th>Azioni</th></tr></thead>
      <tbody>{visible.map((column) => <Fragment key={column.index}><tr><td className="column-letter">{column.letter}</td><td>{column.index}</td><td><b>{column.label}</b></td>
        <td><span className="mode-tag">{Object.keys(rules.columnSettings?.[column.index] ?? {}).length ? "Personalizzata" : column.mode}</span></td>
        <td className={`rule-cell mode-${column.mode.toLowerCase().replace(/\s+/g, "-")}`}>{column.text}</td>
        <td><button type="button" className="secondary-button" aria-label={`Modifica regola ${column.letter}`} aria-expanded={editing === column.index}
          onClick={() => setEditing(editing === column.index ? null : column.index)}>Modifica</button></td></tr>
        {editing === column.index && <tr><td colSpan={6}><ColumnRuleEditor key={column.index} column={column} settings={rules.columnSettings?.[column.index]}
          sample={documents.find((doc) => doc.preview)} onCancel={() => setEditing(null)}
          onSave={(settings) => onChange({ columnSettings: { ...rules.columnSettings, [column.index]: settings } })} /></td></tr>}
      </Fragment>)}</tbody></table></div>
  </section></div>;
}
