import { useState } from "react";
import { BANK } from "../data/demoData.js";
import { dateText, money } from "../lib/format.js";
import { isCreditNote } from "../lib/proposal.js";
import { fatturaPaXml } from "../lib/xml.js";
import { SupplierIcon } from "./icons.jsx";

export default function InvoiceDocument({ invoice, supplier, vim }) {
  const [tab, setTab] = useState("document");
  const credit = isCreditNote(invoice);
  return <section className="document-pane">
    <div className="pane-heading"><div><p className="eyebrow">DOCUMENTO ORIGINALE</p>
      <h2>{credit ? "Nota di credito" : "Fattura"} {invoice.number.replace(/\s+/g, " ")}</h2>
      <p className="muted">{dateText(invoice.date)} · {invoice.documentType} · {invoice.fileName}</p></div>
      <div className="segmented" role="group" aria-label="Vista documento">
        <button type="button" className={tab === "document" ? "active" : ""} onClick={() => setTab("document")}>Leggibile</button>
        <button type="button" className={tab === "vim" ? "active" : ""} onClick={() => setTab("vim")}>Riga VIM</button>
        <button type="button" className={tab === "xml" ? "active" : ""} onClick={() => setTab("xml")}>XML</button>
      </div>
    </div>
    {tab === "xml" ? <pre className="raw-xml">{fatturaPaXml(invoice, supplier)}</pre>
      : tab === "vim" ? <div className="invoice-paper"><h3>Riga dell'export VIM</h3>
        {vim ? <>
          {[["Riferimento", vim.reference], ["Fornitore (codice SAP)", vim.vendor], ["Data documento", dateText(vim.documentDate)],
            ["Data ricezione SDI", dateText(vim.sdiDate)], ["Importo", money(vim.amount)]].map(([label, value]) =>
            <div className="xml-value" key={label}><b>{label}</b><span>{value}</span></div>)}
          <p className="muted" style={{ marginTop: 16 }}>Il VIM fornisce data di ricezione SDI e codice fornitore: alimentano la data di registrazione e il controllo dell'anagrafica.</p>
        </> : <p className="muted">Nessuna riga VIM abbinata a questo XML.</p>}
      </div>
      : <div className="invoice-paper">
        <div className="party-grid">
          <section className="party"><h3>Cedente / prestatore</h3>
            <strong><SupplierIcon supplier={supplier} />{supplier?.name ?? "Non indicato"}</strong>
            <p>IT{invoice.supplierVat}</p><p>{supplier?.city}</p><p>{supplier?.category}</p></section>
          <section className="party"><h3>Cessionario / committente</h3>
            <strong>{BANK.name}</strong><p>IT{BANK.vat}</p><p>Società {BANK.companyCode}</p></section>
        </div>
        <div className="document-total"><span>Totale dichiarato nell'XML</span><strong>{money(invoice.declaredTotal)}</strong></div>
        <section className="invoice-section"><h3>Numero documento nell'XML</h3>
          <p className="muted">Valore grezzo del tag &lt;Numero&gt;: <span className="number-raw">{invoice.number}</span></p></section>
        <section className="invoice-section"><h3>Causale</h3><p className="note-text">{invoice.causale}</p></section>
        <section className="invoice-section"><h3>Dettaglio delle prestazioni</h3><div className="table-scroll">
          <table><thead><tr><th>N.</th><th>Descrizione</th><th className="number">Q.tà</th><th className="number">Prezzo</th><th className="number">Imponibile</th><th>IVA</th></tr></thead>
            <tbody>{invoice.lines.map((line, index) => <tr key={index}><td>{index + 1}</td><td>{line.description}</td>
              <td className="number">{line.quantity}</td><td className="number">{money(line.unitPrice)}</td>
              <td className="number">{money(line.quantity * line.unitPrice)}</td><td>{line.vatRate}% {line.nature ?? ""}</td></tr>)}</tbody></table>
        </div></section>
        <p className="muted" style={{ marginTop: 18 }}>Documento dimostrativo: fornitori, importi e codici sono inventati.</p>
      </div>}
  </section>;
}
