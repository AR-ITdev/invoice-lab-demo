import { useEffect, useMemo, useState } from "react";
import { FileCode2, FileSpreadsheet, Landmark, Search, X } from "lucide-react";
import { SUPPLIERS, VIM_ROWS, XML_INVOICES } from "./data/demoData.js";
import { STATUS, money } from "./lib/format.js";
import { buildProject, traceCsv, updateSupplier, vimCsv } from "./lib/project.js";
import { DEFAULT_ACCOUNTING_RULES, TRACE_COLUMNS } from "./lib/proposal.js";
import InvoiceDocument from "./components/InvoiceDocument.jsx";
import RegistrationPane, { Badge } from "./components/RegistrationPane.jsx";
import { RulesPage, SupplierPage, VimPage } from "./components/DataPages.jsx";
import { SupplierIcon } from "./components/icons.jsx";
import { associationWarnings, changeAssociation } from "./lib/matching.js";
import AssociationControls from "./components/AssociationControls.jsx";
import { validateColumnSettings } from "./lib/columnRules.js";
import { readStored, writeStored } from "./lib/storage.js";

const STORAGE_KEY = "tracciati-demo-state-v1";
const PORTFOLIO_URL = "https://ar-it.dev/portfolio";
const today = () => new Date().toISOString().slice(0, 10);
const emptyState = () => ({ schemaVersion: 2, imported: null, suppliers: structuredClone(SUPPLIERS), manualLinks: {}, reviews: {}, batchDate: today(), rules: structuredClone(DEFAULT_ACCOUNTING_RULES) });

function loadState() {
  const stored = readStored(STORAGE_KEY, null);
  const saved = stored.value;
  if (!saved?.suppliers) return { state: emptyState(), error: stored.error };
  if (saved.schemaVersion !== 2) return { state: { ...saved, schemaVersion: 2, reviews: {}, rules: structuredClone(DEFAULT_ACCOUNTING_RULES), profileUpdated: true }, error: stored.error };
  return { state: { ...saved, rules: saved.rules ?? structuredClone(DEFAULT_ACCOUNTING_RULES) }, error: stored.error };
}
function download(fileName, content) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const NONE = [];
const narrow = () => window.matchMedia("(max-width: 760px)").matches;
const SPLIT_KEY = "tracciati-demo-split";
const clampSplit = (value) => Math.min(75, Math.max(25, value));

function SplitHandle({ split, onChange }) {
  function startDrag(event) {
    const area = event.currentTarget.parentElement.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (moveEvent) => onChange(clampSplit(((moveEvent.clientX - area.left) / area.width) * 100));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); document.body.classList.remove("resizing"); };
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  function onKeyDown(event) {
    const step = event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0;
    if (step) { event.preventDefault(); onChange(clampSplit(split + step)); }
    if (event.key === "Home") onChange(50);
  }
  return <div className="split-handle" role="separator" aria-orientation="vertical" aria-label="Ridimensiona proposta e documento"
    aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(split)} tabIndex={0} title="Trascina per ridimensionare · doppio clic per ripristinare"
    onPointerDown={startDrag} onKeyDown={onKeyDown} onDoubleClick={() => onChange(50)}><span /></div>;
}

export default function App() {
  const [initial] = useState(loadState);
  const [state, setState] = useState(initial.state);
  const [page, setPage] = useState(() => (initial.state.imported ? "documents" : "home"));
  const [storageReadError] = useState(initial.error);
  const [storageWriteError, setStorageWriteError] = useState(null);
  const [splitStored] = useState(() => readStored(SPLIT_KEY, 50));
  const [splitWriteError, setSplitWriteError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [staged, setStaged] = useState({ vim: false, xml: false });
  const [listOpen, setListOpen] = useState(() => !narrow());
  const [workspace, setWorkspace] = useState("proposal");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [vimFocus, setVimFocus] = useState(null);
  const [toast, setToast] = useState(() => state.profileUpdated ? { text: "Profilo contabile aggiornato: bozze e conferme precedenti azzerate per applicare i nuovi controlli IVA. Dati mock e anagrafica conservati.", id: Date.now() } : null);
  const [split, setSplit] = useState(() => clampSplit(Number(splitStored.value) || 50));

  useEffect(() => { setSplitWriteError(writeStored(SPLIT_KEY, Math.round(split))); }, [split]);
  useEffect(() => { setStorageWriteError(writeStored(STORAGE_KEY, state)); }, [state]);
  useEffect(() => {
    if (state.profileUpdated) setState((current) => ({ ...current, profileUpdated: false }));
  }, [state.profileUpdated]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), toast.error ? 9000 : 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  const hasProject = Boolean(state.imported);
  const vimRows = state.imported?.vim ? VIM_ROWS : NONE;
  const invoices = state.imported?.xml ? XML_INVOICES : NONE;
  const project = useMemo(() => buildProject({ vimRows, invoices, suppliers: state.suppliers, manualLinks: state.manualLinks, reviews: state.reviews, batchDate: state.batchDate, rules: state.rules }),
    [vimRows, invoices, state.suppliers, state.manualLinks, state.reviews, state.batchDate, state.rules]);
  const documents = project.documents;
  const list = documents.filter((doc) => {
    const text = `${doc.invoice?.number ?? ""} ${doc.vim?.reference ?? ""} ${doc.supplier?.name ?? ""} ${doc.vim?.vendor ?? ""}`.toLowerCase();
    return (filter === "all" || doc.status === filter) && text.includes(search.trim().toLowerCase());
  });
  const selected = documents.find((doc) => doc.id === selectedId) ?? list[0] ?? documents[0];
  const position = list.findIndex((doc) => doc.id === selected?.id);
  const processedCount = documents.filter((doc) => doc.status === "processed").length;
  const notify = (text, error = false) => setToast({ text, error, id: Date.now() });

  const select = (id) => { setSelectedId(id); setPage("documents"); if (narrow()) setListOpen(false); };
  const setReview = (docId, updater) => setState((current) => ({ ...current, reviews: { ...current.reviews, [docId]: updater(current.reviews[docId] ?? {}) } }));

  function newProject() {
    if (hasProject && !window.confirm("Creare un nuovo progetto? Le lavorazioni della demo verranno azzerate.")) return;
    setState((current) => ({ ...emptyState(), rules: current.rules, imported: { vim: false, xml: false } }));
    setStaged({ vim: false, xml: false });
    setSelectedId(null);
    setPage("documents");
    setExportOpen(false);
    setImportOpen(true);
  }

  function runImport(sources = staged, base = state) {
    const next = { vim: base.imported?.vim || sources.vim, xml: base.imported?.xml || sources.xml };
    setState((current) => ({ ...current, imported: next }));
    const preview = buildProject({ ...base, vimRows: next.vim ? VIM_ROWS : [], invoices: next.xml ? XML_INVOICES : [] });
    const matched = preview.documents.filter((doc) => doc.vim && doc.invoice);
    const normalized = matched.filter((doc) => doc.match === "normalized").length;
    const missing = preview.documents.filter((doc) => doc.status === "missing").length;
    const orphan = preview.documents.filter((doc) => doc.status === "orphan").length;
    setStaged({ vim: false, xml: false });
    setImportOpen(false);
    setPage("documents");
    setSelectedId(preview.documents[0]?.id ?? null);
    notify(`Importazione completata: ${next.vim ? VIM_ROWS.length : 0} righe VIM, ${next.xml ? XML_INVOICES.length : 0} XML.\n${matched.length} abbinamenti (${normalized} con riferimento normalizzato)${missing ? `, ${missing} righe VIM senza XML` : ""}${orphan ? `, ${orphan} XML senza VIM` : ""}.`);
  }

  function loadExample() {
    if (hasProject && !window.confirm("Ricaricare l'esempio? Le lavorazioni della demo verranno azzerate.")) return;
    const base = { ...emptyState(), rules: state.rules, imported: { vim: false, xml: false } };
    setState(base);
    runImport({ vim: true, xml: true }, base);
  }

  function setStatus(doc, status) {
    if (status === "processed" && (!doc.vim || !doc.preview || doc.preview.issues.some((issue) => issue.severity === "error"
      || (issue.severity === "warning" && !doc.review.warningsAcknowledged)))) {
      notify("Conferma bloccata: risolvi gli errori e verifica le peculiarità prima di aggiungere il documento al lotto.", true);
      return;
    }
    const frozenKinds = status === "processed" ? { lineKinds: Object.fromEntries(doc.preview.lines.map((line) => [line.index, line.kind])) } : {};
    setReview(doc.id, (current) => ({ ...current, ...frozenKinds, status }));
    if (status === "processed") {
      const rows = doc.preview.rows.length;
      notify(`Documento ${doc.invoice.number.replace(/\s+/g, " ")} elaborato: ${rows} righe aggiunte al lotto ${project.batchId}.`);
      const next = documents.slice(documents.indexOf(doc) + 1).find((item) => item.status === "review");
      if (next) setSelectedId(next.id);
    } else if (status === "discarded") notify(`Documento ${doc.invoice?.number ?? doc.vim.reference} scartato.`);
  }

  function runAction(action) {
    if (action.type === "assign-sap") {
      changeSupplier(action.vat, { sapCode: action.sapCode });
    }
    if (action.type === "add-supported-line") setReview(selected.id, (current) => ({ ...current, extraLines: [...(current.extraLines ?? []), action.line], warningsAcknowledged: false }));
  }

  function changeSupplier(vat, patch) {
    try {
      setState(updateSupplier(state, documents, vat, patch));
      notify("Anagrafica aggiornata. Collegamenti conservati; le lavorazioni del fornitore richiedono una nuova verifica.");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      notify(error.message, true);
    }
  }

  function linkVim(vimId, xmlId) {
    try {
      const patch = changeAssociation({ documents, reviews: state.reviews, vimId, xmlId });
      if (!patch) return false;
      const target = documents.find((doc) => doc.vimId === vimId);
      const invoice = invoices.find((item) => item.id === xmlId);
      const warnings = invoice ? associationWarnings(target.vim, invoice, state.suppliers) : [];
      const message = [...warnings, xmlId
        ? "Confermare il collegamento? Le bozze dei documenti coinvolti verranno azzerate."
        : "Scollegare l'XML? Riga VIM e fattura resteranno nel progetto; la bozza verrà azzerata."].join("\n");
      if (!window.confirm(message)) return false;
      setState((current) => ({ ...current, ...patch }));
      setSelectedId(vimId);
      notify(xmlId ? "Collegamento confermato. Proposta ricalcolata; verifica i controlli prima di registrare." : "Collegamento rimosso. Riga VIM e XML conservati.");
      return true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      notify(error.message, true);
      return false;
    }

  }

  function updateRules(patch) {
    try {
      if (patch.columnSettings) validateColumnSettings(patch.columnSettings, TRACE_COLUMNS);
      const confirmed = Object.values(state.reviews).some((review) => review.status === "processed");
      if (confirmed && !window.confirm("Modificare il profilo? Le registrazioni confermate verranno riaperte e richiederanno una nuova verifica prima dell'esportazione.")) return false;
      setState((current) => ({
        ...current, rules: { ...current.rules, ...patch },
        reviews: Object.fromEntries(Object.entries(current.reviews).map(([id, review]) =>
          [id, { ...review, status: review.status === "processed" ? null : review.status, warningsAcknowledged: false }])),
      }));
      notify("Regole aggiornate. Proposte ricalcolate e verifiche precedenti revocate.");
      return true;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      notify(error.message, true);
      return false;
    }
  }

  function exportData(kind) {
    setExportOpen(false);
    if (kind === "trace") {
      let content;
      try {
        content = traceCsv(project);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        notify(error.message, true);
        return;
      }
      download(`${project.batchId}.csv`, content);
      notify(`Tracciato ${project.batchId}.csv esportato: ${processedCount} documenti, ${documents.filter((doc) => doc.status === "processed").reduce((sum, doc) => sum + doc.preview.rows.length, 0)} righe × ${TRACE_COLUMNS.length} colonne.`);
    } else {
      download(`VIM_esito_${project.batchId}.csv`, vimCsv(project));
      notify("Esito VIM esportato con stato di lavorazione e lotto di registrazione per ogni riga.");
    }
  }

  const navButton = (id, label, extra) => <button type="button" className={`secondary-button ${page === id ? "active" : ""}`} aria-pressed={page === id}
    disabled={!hasProject} onClick={() => { setPage(id); setImportOpen(false); setExportOpen(false); }}>{label}{extra}</button>;

  return <main className="app-shell">
    <div className="demo-ribbon">Demo con dati inventati: tutto resta nel browser. <a href={PORTFOLIO_URL}>Torna al portfolio ar-it.dev</a></div>
    <header className="topbar">
      <button type="button" className="brand-mark" aria-label="Homepage" title="Homepage" onClick={() => { setPage("home"); setImportOpen(false); setExportOpen(false); }}><Landmark /></button>
      <div className="brand-title"><strong>Elaborazione Tracciati</strong>
        {hasProject && <><span className="brand-separator" aria-hidden="true">/</span><span className="project-title">fatture-passive-ottobre.trcproj</span></>}
        <span className="demo-pill">DEMO</span></div>
      <div className="project-actions" role="group" aria-label="Gestione progetto">
        <button type="button" className="secondary-button" title="Nuovo progetto" onClick={newProject}>Nuovo</button>
        <div className="import-control">
          <button type="button" className="secondary-button" title="Importa documenti" disabled={!hasProject} aria-expanded={importOpen}
            onClick={() => { setExportOpen(false); setImportOpen((value) => !value); }}>Importa</button>
          {importOpen && hasProject && <section className="import-toolbar" aria-label="Importa documenti">
            <div className="import-panel-heading"><div><strong>Importazione simulata</strong><small>Solo dati di esempio: nessun file reale viene selezionato o caricato.</small></div>
              <button type="button" className="import-close" aria-label="Chiudi importazione" onClick={() => setImportOpen(false)}><X /></button></div>
            <div className="import-sources">
              <div className={`import-source ${staged.vim || state.imported.vim ? "selected" : ""}`}>
                <button type="button" className="secondary-button" disabled={state.imported.vim} onClick={() => setStaged((value) => ({ ...value, vim: true }))}><FileSpreadsheet size={15} />VIM di esempio</button>
                <small>{state.imported.vim ? "Già importato" : staged.vim ? `VIM_export_ottobre.xlsx · ${VIM_ROWS.length} righe` : "Nessun file selezionato"}</small></div>
              <div className={`import-source ${staged.xml || state.imported.xml ? "selected" : ""}`}>
                <button type="button" className="secondary-button" disabled={state.imported.xml} onClick={() => setStaged((value) => ({ ...value, xml: true }))}><FileCode2 size={15} />XML di esempio</button>
                <small>{state.imported.xml ? "Già importata" : staged.xml ? `${XML_INVOICES.length} XML · fatture\\ottobre` : "Nessuna cartella selezionata"}</small></div>
            </div>
            <button type="button" className="primary-button import-submit" disabled={!staged.vim && !staged.xml} onClick={() => runImport()}>Importa nel progetto</button>
          </section>}
        </div>
        <div className="export-control">
          <button type="button" className="primary-button export-button" title="Scegli il formato di esportazione" disabled={!hasProject || !documents.length} aria-expanded={exportOpen}
            onClick={() => { setExportOpen((value) => !value); setImportOpen(false); }}>Esporta</button>
          {exportOpen && <section className="export-menu" aria-label="Scegli cosa esportare"><strong>Esporta progetto</strong>
            <button type="button" className="secondary-button" disabled={!vimRows.length} onClick={() => exportData("vim")}>Esito VIM (CSV)</button>
            <button type="button" className="secondary-button" disabled={!processedCount} onClick={() => exportData("trace")}>Tracciato di registrazione (CSV){processedCount ? ` · ${processedCount} doc.` : ""}</button>
          </section>}
        </div>
      </div>
      <nav className="global-nav" aria-label="Navigazione principale">
        {navButton("documents", "Fatture")}
        {navButton("vim", "VIM")}
        {navButton("suppliers", "Anagrafica")}
        {navButton("rules", "Regole", <span>{TRACE_COLUMNS.length}</span>)}
      </nav>
    </header>

    {(storageReadError || splitStored.error || storageWriteError || splitWriteError) && <div className="storage-warning" role="alert">
      {storageWriteError || splitWriteError || storageReadError || splitStored.error}
    </div>}

    {toast && <div className="toast-region" aria-live={toast.error ? "assertive" : "polite"}>
      <div key={toast.id} className={`toast-message ${toast.error ? "toast-error" : "toast-success"}`} role={toast.error ? "alert" : "status"}>
        <span className="toast-text">{toast.text}</span>
        <button type="button" aria-label="Chiudi notifica" onClick={() => setToast(null)}><X /></button>
        {!toast.error && <span className="toast-timer" />}
      </div></div>}

    {page === "home" || !hasProject ? <div className="page-scroll"><section className="welcome">
      <p className="eyebrow">ELABORAZIONE TRACCIATI · SAP</p>
      <h1>Elaborazione tracciati per registrazione fatture passive, riconciliazione conti, registrazione entrata merci</h1>
      <p>Software d'appoggio a SAP per un gruppo bancario: sostituisce i passaggi manuali tra SAP e fogli Excel, segue il vero flusso di lavoro e automatizza le regole standard, lasciando all'operatore (human in the loop) le casistiche particolari, spesso dovute a errori di fatturazione dei fornitori.</p>
      <p>Questa demo mostra il flusso di <b>registrazione fatture passive</b>: incrocia l'export VIM con le fatture elettroniche XML, propone la registrazione contabile, applica le regole di colonna e genera il tracciato a {TRACE_COLUMNS.length} colonne da caricare in SAP. Fornitori, importi e codici sono inventati.</p>
      <p className="info-banner">Riconciliazione conti ed entrata merci fanno parte del perimetro del prodotto, ma non sono disponibili in questa demo. Importazione simulata e CSV dimostrativi, non certificati per il caricamento in SAP.</p>
      <div className="welcome-grid">
        <article className="card"><span className="card-icon"><FileSpreadsheet /></span><h2>1. Importa VIM e XML</h2><p>Abbinamento automatico tra righe VIM e FatturaPA con riferimenti normalizzati, anagrafica fornitori e codici SAP.</p></article>
        <article className="card"><span className="card-icon"><Search /></span><h2>2. Verifica la proposta</h2><p>Classificazione righe, chiavi contabili, codice IVA, competenza e controlli di quadratura prima della conferma.</p></article>
        <article className="card"><span className="card-icon"><Landmark /></span><h2>3. Esporta il lotto</h2><p>CSV a {TRACE_COLUMNS.length} colonne per il caricamento in SAP ed esito di lavorazione da riportare nel VIM.</p></article>
      </div>
      <div className="welcome-actions">
        {hasProject ? <button type="button" className="primary-button" onClick={() => setPage("documents")}>Riprendi il progetto</button>
          : <button type="button" className="primary-button" onClick={newProject}>Nuovo progetto</button>}
        <button type="button" className="secondary-button" onClick={loadExample}>{hasProject ? "Ricarica l'esempio da zero" : "Carica l'esempio completo"}</button>
        <p className="welcome-hint muted">Il progetto demo resta salvato solo in questo browser.</p>
      </div>
    </section></div>
    : page === "vim" ? <VimPage project={project} focusId={vimFocus} onLink={linkVim} onOpen={select} />
    : page === "suppliers" ? <SupplierPage suppliers={state.suppliers} onChange={changeSupplier} />
    : page === "rules" ? <RulesPage rules={state.rules} hasProject={hasProject} documents={documents}
      onChange={updateRules}
      onReset={() => updateRules(structuredClone(DEFAULT_ACCOUNTING_RULES))} />
    : <div className={`workbench ${listOpen ? "invoice-list-open" : ""}`}>
      <aside className="invoice-sidebar" aria-label="Elenco fatture" hidden={!listOpen}>
        <div className="invoice-sidebar-heading"><strong>Fatture <span>{documents.length}</span></strong>
          <button type="button" className="secondary-button" aria-label="Chiudi elenco fatture" onClick={() => setListOpen(false)}><X /></button></div>
        <div className="invoice-sidebar-tools">
          <input aria-label="Cerca fatture" placeholder="Cerca numero o fornitore..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="Filtra stato" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Tutti gli stati</option>{Object.entries(STATUS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
          </select>
        </div>
        <div className="invoice-sidebar-entries">
          {list.map((doc) => <button type="button" key={doc.id} className={`invoice-sidebar-item ${selected?.id === doc.id ? "selected" : ""}`}
            aria-current={selected?.id === doc.id ? "true" : undefined} onClick={() => select(doc.id)}>
            <span className="invoice-sidebar-item-title">{doc.invoice ? doc.invoice.number.replace(/\s+/g, " ") : doc.vim.reference}<b>{money(doc.invoice?.declaredTotal ?? doc.vim.amount)}</b></span>
            <span className="invoice-sidebar-item-subtitle">{doc.supplier ? <><SupplierIcon supplier={doc.supplier} />{doc.supplier.name}</> : `Fornitore VIM ${doc.vim.vendor} · nessun XML`}</span>
            <span className="invoice-sidebar-item-meta"><Badge status={doc.status} />
              {doc.invoice && <span className={`document-kind ${doc.invoice.documentType === "TD04" ? "credit" : ""}`}>{doc.invoice.documentType === "TD04" ? "Nota di credito" : "Fattura"} · {doc.invoice.documentType}</span>}</span>
          </button>)}
          {!list.length && <p className="empty-state">{documents.length ? "Nessuna fattura con questo filtro." : "Nessuna fattura. Usa «Importa» per caricare il VIM e la cartella XML."}</p>}
        </div>
      </aside>
      {selected ? <div className={`analysis-area ${workspace}-active`} style={{ "--split": `${split}%` }}>
        <nav className="workspace-tabs" aria-label="Documento e proposta">
          <button type="button" className={workspace === "proposal" ? "active" : ""} onClick={() => setWorkspace("proposal")}>Proposta</button>
          <button type="button" className={workspace === "document" ? "active" : ""} onClick={() => setWorkspace("document")}>Documento</button>
        </nav>
        <RegistrationPane key={`proposal-${selected.id}`} doc={selected}
          association={<AssociationControls key={`${selected.id}-${selected.xmlId}`} doc={selected} documents={documents} onLink={linkVim}
            onOpenVim={(id) => { setVimFocus(id); setPage("vim"); }} />}
          navigation={{ position: position + 1, count: list.length, listOpen, onToggleList: () => setListOpen((value) => !value),
            onPrev: () => setSelectedId(list[position - 1].id), onNext: () => setSelectedId(list[position + 1].id) }}
          onReview={(updater) => setReview(selected.id, updater)} onAction={runAction}
          onStatus={(status) => setStatus(selected, status)} />
        <SplitHandle split={split} onChange={setSplit} />
        {selected.invoice ? <InvoiceDocument key={`document-${selected.invoice.id}`} invoice={selected.invoice} supplier={selected.supplier} vim={selected.vim} />
          : <section className="document-pane missing-document-pane"><p>Nessuna fattura XML abbinata.<br />Riga VIM «{selected.vim.reference}» · {money(selected.vim.amount)}</p></section>}
      </div> : <div className="analysis-area"><section className="document-pane missing-document-pane" style={{ gridColumn: "1 / -1" }}>
        <p>Nessun documento nel progetto.<br />Usa «Importa» per caricare il VIM e la cartella XML.</p></section></div>}
    </div>}
  </main>;
}
