import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, List, RotateCcw, Trash2 } from "lucide-react";
import { STATUS, dateText, money } from "../lib/format.js";
import { ACCOUNTS, COL, TRACE_COLUMNS, VAT_CODES, column } from "../lib/proposal.js";
import TraceEditor from "./TraceEditor.jsx";

const letter = (label) => column(label).letter;
export const Badge = ({ status }) => <span className={`badge ${STATUS[status].className}`}>{STATUS[status].label}</span>;

function Issues({ issues, onAction, disabled }) {
  return issues.map((issue) => <article key={issue.code} className={`check-issue ${issue.severity}`}>
    <strong>{issue.message}</strong>
    {issue.suggestion && <p>{issue.suggestion}</p>}
    {issue.action && <button type="button" className="secondary-button" disabled={disabled} onClick={() => onAction(issue.action)}>{issue.action.label}</button>}
  </article>);
}

function Navigation({ position, count, onPrev, onNext, onToggleList, listOpen }) {
  return <div className="invoice-navigation">
    <button type="button" className="secondary-button icon-button" aria-pressed={listOpen} aria-label="Elenco fatture" title="Elenco fatture" onClick={onToggleList}><List /></button>
    <button type="button" className="secondary-button icon-button" aria-label="Fattura precedente" title="Fattura precedente" disabled={position <= 1} onClick={onPrev}><ChevronLeft /></button>
    <span className="invoice-nav-position">{position}/{count}</span>
    <button type="button" className="secondary-button icon-button" aria-label="Fattura successiva" title="Fattura successiva" disabled={position >= count} onClick={onNext}><ChevronRight /></button>
  </div>;
}

export default function RegistrationPane({ doc, association, navigation, onReview, onAction, onStatus }) {
  const [tab, setTab] = useState("main");
  const { preview, invoice, review } = doc;
  const locked = doc.status === "processed" || doc.status === "discarded";

  if (!preview) {
    return <aside className="registration-pane">
      <div className="pane-heading"><p className="eyebrow">PROPOSTA DI REGISTRAZIONE</p><Badge status={doc.status} /></div>
      <div className="registration-content">
        <section className="unmatched-xml"><h2>Abbina fattura XML</h2>
          <p>La riga VIM «{doc.vim.reference}» del fornitore {doc.vim.vendor} ({money(doc.vim.amount)}) non ha un XML corrispondente nella cartella importata.</p>
          {association}
          <div className="xml-link-actions">
            <button type="button" className="danger-button" disabled={locked} onClick={() => onStatus("discarded")}>Scarta riga VIM</button>
          </div>
        </section>
        {locked && <p className="info-banner" style={{ marginTop: 12 }}>Riga scartata: nell'esito VIM risulterà SCARTATO.</p>}
      </div>
      <div className="review-actions"><Navigation {...navigation} />
        {locked && <button type="button" className="secondary-button icon-button" aria-label="Riapri" title="Riapri" style={{ marginLeft: "auto" }} onClick={() => onStatus(null)}><RotateCcw /></button>}</div>
    </aside>;
  }

  const errors = preview.issues.filter((issue) => issue.severity === "error");
  const warnings = preview.issues.filter((issue) => issue.severity === "warning");
  const at = (location) => preview.issues.filter((issue) => issue.location === location);
  const edited = Object.values(review.overrides ?? {}).reduce((sum, item) => sum + Object.keys(item).length, 0);
  const set = (patch) => onReview((current) => ({ ...current, ...patch, warningsAcknowledged: false }));
  const canConfirm = !errors.length && (!warnings.length || review.warningsAcknowledged);

  return <aside className="registration-pane">
    <div className="pane-heading"><p className="eyebrow">PROPOSTA DI REGISTRAZIONE</p><Badge status={doc.status} />
      {!locked && <div className="pane-heading-actions"><button type="button" className="secondary-button regenerate-button"
        title="Sostituisce la bozza e le modifiche manuali con una nuova proposta"
        onClick={() => window.confirm("Rigenerare la proposta? Le modifiche manuali saranno sostituite.") && onReview(() => ({}))}>Rigenera</button></div>}
    </div>
    <nav className="registration-tabs" aria-label="Sezioni registrazione">
      <button type="button" className={tab === "main" ? "active" : ""} onClick={() => setTab("main")}>Dati principali</button>
      <button type="button" className={tab === "trace" ? "active" : ""} onClick={() => setTab("trace")}>Tracciato ({TRACE_COLUMNS.length} colonne){edited ? ` · ${edited} modifiche` : ""}</button>
    </nav>
    <div className="registration-content">
      {association}
      {tab === "main" ? <>
        <section className="document-review-step" aria-label="Dati del documento"><h3>Dati del documento</h3>
          <p className="document-review-summary">{invoice.number.replace(/\s+/g, " ")} · {invoice.documentType} · {dateText(invoice.date)} · {money(invoice.declaredTotal)}
            {doc.vim ? ` · VIM ${doc.vim.reference} (${doc.match === "normalized" ? "riferimento normalizzato" : doc.match === "manual" ? "abbinamento manuale" : "abbinamento esatto"})` : ""}</p>
          {invoice.note && <p className="info-banner"><b>Scenario demo:</b> {invoice.note}</p>}
          <Issues issues={[...at("supplier"), ...at("document")]} onAction={onAction} disabled={locked} />
        </section>

        <section className="line-classifications" aria-label="Classificazione righe"><h3>Classificazione delle righe</h3>
          <p>Servizi (conto {ACCOUNTS.services}) e Commissioni (conto {ACCOUNTS.fees}) sono distinti per natura del costo. Gli sconti riducono il costo della categoria assegnata. Aliquote e nature IVA diverse generano contropartite separate, non un codice prevalente.</p>
          <div className="table-scroll"><table className="line-table"><thead><tr><th>Descrizione</th><th className="number">Imponibile</th><th>IVA</th><th>Categoria</th></tr></thead>
            <tbody>{preview.lines.map((line) => <tr key={line.index} className={line.extra ? "extra-line" : ""}>
              <td>{line.description}{line.extra && !locked && <> <button type="button" className="secondary-button" style={{ minHeight: 26, padding: "2px 7px", fontSize: 11 }}
                onClick={() => set({ extraLines: (review.extraLines ?? []).filter((_, index) => index !== line.index - invoice.lines.length) })}>Rimuovi</button></>}</td>
              <td className="number" data-label="Imponibile">{money(line.base)}</td><td data-label="IVA">{line.vatRate}%</td>
              <td data-label="Categoria"><select aria-label={`Categoria riga ${line.index + 1}`} value={line.kind} disabled={locked}
                onChange={(event) => set({ lineKinds: { ...review.lineKinds, [line.index]: event.target.value } })}>
                <option value="services">Servizi</option><option value="fees">Commissioni</option></select></td>
            </tr>)}</tbody></table></div>
        </section>

        <section className="registration-rows" aria-label="Righe contabili"><h3>Registrazione proposta</h3>
          <p className="muted">Importi con segno: Dare positivo, Avere negativo. La chiave deve essere coerente con il segno (21/40 Dare, 31/50 Avere) e la somma di importi e IVA deve azzerarsi.</p>
          <div className="table-scroll"><table className="rows-summary"><thead><tr>
            <th>Riga</th><th>Conto [{letter("Conto")}]</th><th>Verso / chiave [{letter("Chiave contabile")}]</th>
            <th className="number">Importo [{letter("Importo")}]</th><th className="number">IVA [{letter("IVA già calcolata")}]</th></tr></thead>
            <tbody>{preview.rows.map((row, index) => {
              const key = row.values[COL.key - 1];
              const options = [...new Set([key, ...(row.slot === "supplier" ? ["31", "21"] : ["40", "50"])])];
              return <tr key={row.id}><td><span className="posting-row-number">{index + 1}</span><small>{row.label}</small></td>
                <td data-label={`Conto [${letter("Conto")}]`}>{row.values[COL.account - 1] || <em style={{ color: "#a44646" }}>non impostato</em>}</td>
                <td data-label={`Chiave [${letter("Chiave contabile")}]`}><select aria-label={`Chiave contabile ${row.label}`} value={key} disabled={locked}
                  onChange={(event) => set({ keys: { ...review.keys, [row.id]: event.target.value } })}>
                  {options.map((value) => <option key={value} value={value}>{preview.postingSide(value)} · {value}</option>)}</select></td>
                <td data-label={`Importo [${letter("Importo")}]`} className={`number ${row.amount < 0 ? "negative" : ""}`}>{money(row.amount)}</td>
                <td data-label={`IVA [${letter("IVA già calcolata")}]`} className={`number ${row.vat < 0 ? "negative" : ""}`}>{row.values[COL.vat - 1] ? money(row.vat) : "—"}</td></tr>;
            })}</tbody></table></div>
          <Issues issues={at("registration")} onAction={onAction} disabled={locked} />
        </section>

        <section className="document-code-step" aria-label="Codice IVA"><h3>Codice IVA [{letter("Codice IVA")}]</h3>
          {preview.rows.filter((row) => row.slot !== "supplier").map((row) => <label key={row.id} className="field">
            <span>{row.label} · proposta {row.vatProposal || "non disponibile"}</span>
            <select aria-label={`Codice IVA ${row.label}`} value={row.values[COL.vatCode - 1]} disabled={locked}
              onChange={(event) => set({ vatCodes: { ...review.vatCodes, [row.id]: event.target.value } })}>
              <option value="">Non supportato</option>
              {Object.entries(VAT_CODES).map(([code, label]) => <option key={code} value={code}>{code} — {label}</option>)}
            </select></label>)}
          <p className="document-code-legend">Codici di configurazione fittizi. Esente N4 e non imponibile N3.x restano distinti; il conto commissioni non determina il codice IVA.</p>
          <p className="info-banner">Perimetro fiscale demo: acquisti interni in EUR con IVA detraibile al 100%, N4 e N3.x. Pro-rata bancario, IVA indetraibile, reverse charge, split payment e ritenute non sono simulati. La quadratura non costituisce validazione fiscale.</p>
        </section>

        <section className="competence-box" aria-label="Competenza"><h3>Mese di competenza [{letter("Periodo competenza")}]</h3>
          <p>{preview.competenceProposal.reason}</p>
          {preview.evidence.map((item) => <div className="evidence" key={item.label}><b>{item.label}</b><blockquote>{item.text}</blockquote>
            <div>{item.months.map((month) => <button type="button" key={month} disabled={locked} className={preview.competence === month ? "active" : ""}
              onClick={() => set({ competence: month })}>{month}</button>)}</div></div>)}
          <label className="field"><span>Chiave scelta (AAAAMM)</span>
            <input value={review.competence ?? preview.competence} maxLength={6} disabled={locked} onChange={(event) => set({ competence: event.target.value })} /></label>
          <Issues issues={at("competence")} onAction={onAction} disabled={locked} />
        </section>

        <section className="final-checks-step" aria-label="Controllo finale"><h3>Controllo finale</h3>
          <ul className="final-checks-summary">
            <li>Dare {money(preview.debit)} · Avere {money(preview.creditSide)} (importi + IVA).</li>
            <li>{preview.balance === 0 ? "Registrazione azzerata: Dare e Avere si compensano." : `Registrazione non azzerata: saldo ${money(preview.balance)}.`}</li>
            <li>{errors.length ? `${errors.length} errori da risolvere prima della conferma.` : "Nessun errore rilevato dalle regole disponibili."}</li>
            <li>{warnings.length ? (review.warningsAcknowledged ? `${warnings.length} peculiarità: presa visione completata.` : `${warnings.length} peculiarità da verificare prima di confermare.`) : "Nessuna verifica in sospeso."}</li>
          </ul>
        </section>
      </> : <TraceEditor preview={preview} overrides={review.overrides} disabled={locked}
        onOverride={(slot, index, value) => set({ overrides: { ...review.overrides, [slot]: { ...review.overrides?.[slot], [index]: value } } })}
        onReset={() => set({ overrides: {} })} />}
    </div>
    <div className="review-footer">
    <div className={`balance ${preview.balance === 0 ? "balanced" : "unbalanced"}`} aria-live="polite">
      <span>Azzeramento Σ({letter("Importo")} + {letter("IVA già calcolata")}) · Dare {money(preview.debit)} · Avere {money(preview.creditSide)}</span><strong>Saldo {money(preview.balance)}</strong>
    </div>
    <div className="review-actions">
      <Navigation {...navigation} />
      {locked ? <button type="button" className="secondary-button icon-button" aria-label="Riapri per modificare" title="Riapri per modificare" style={{ marginLeft: "auto" }}
        onClick={() => onStatus(null)}><RotateCcw /></button>
        : <>
          <button type="button" className="danger-button icon-button" aria-label="Scarta fattura" title="Scarta fattura" onClick={() => onStatus("discarded")}><Trash2 /></button>
          <div className="confirm-actions">
            {warnings.length > 0 && <label className="review-acknowledge"><input type="checkbox" checked={Boolean(review.warningsAcknowledged)}
              onChange={(event) => onReview((current) => ({ ...current, warningsAcknowledged: event.target.checked }))} />Verificato</label>}
            <button type="button" className="primary-button confirm-button" disabled={!canConfirm || !doc.vim}
              title={errors.length ? "Risolvi gli errori segnalati" : !canConfirm ? "Spunta «Verificato» dopo aver controllato le peculiarità" : "Conferma e aggiungi al lotto"}
              onClick={() => onStatus("processed")}><Check /><span>Conferma</span></button>
          </div>
        </>}
    </div>
    </div>
  </aside>;
}
