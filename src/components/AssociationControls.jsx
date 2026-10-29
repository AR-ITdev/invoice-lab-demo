import { useState } from "react";

export default function AssociationControls({ doc, documents, onLink, onOpenVim }) {
  const [choice, setChoice] = useState("");
  const locked = ["processed", "discarded"].includes(doc.status);
  const fromVim = Boolean(doc.vim);
  const options = documents.filter((item) => !["processed", "discarded"].includes(item.status)
    && (fromVim ? item.invoice && !item.vim : item.vim && !item.invoice));
  const label = fromVim ? `XML per ${doc.vim.reference}` : `Riga VIM per ${doc.invoice.number}`;
  const value = options.some((item) => item.id === choice) ? choice : "";

  function connect() {
    const chosen = options.find((item) => item.id === value);
    if (chosen && onLink(fromVim ? doc.vimId : chosen.vimId, fromVim ? chosen.xmlId : doc.xmlId)) setChoice("");
  }

  return <section className="association-controls" aria-label="Collegamento VIM e fattura">
    <div><b>{doc.vim && doc.invoice ? `VIM ${doc.vim.reference} ↔ XML ${doc.invoice.number}` : fromVim ? "Riga VIM senza XML" : "Fattura XML senza VIM"}</b>
      {onOpenVim && <button type="button" className="secondary-button" onClick={() => onOpenVim(doc.id)}>Apri collegamento nel VIM</button>}</div>
    {!locked ? <>
      <label className="field"><span>{fromVim ? doc.invoice ? "Cambia fattura XML" : "Collega fattura XML" : "Collega riga VIM"}</span>
        <select aria-label={label} value={value} onChange={(event) => setChoice(event.target.value)} disabled={!options.length}>
          <option value="">{options.length ? "Seleziona un documento libero..." : "Nessun documento libero disponibile"}</option>
          {options.map((item) => <option key={item.id} value={item.id}>{fromVim
            ? `${item.invoice.number} · ${item.supplier?.name ?? item.invoice.supplierVat} · ${item.invoice.fileName}`
            : `${item.vim.reference} · ${item.vim.vendor}`}</option>)}
        </select></label>
      <div className="association-actions">
        <button type="button" className="primary-button" disabled={!value} onClick={connect}>{doc.vim && doc.invoice ? "Conferma cambio" : "Conferma abbinamento"}</button>
        {doc.vim && doc.invoice && <button type="button" className="secondary-button" onClick={() => onLink(doc.vimId, null)}>Scollega XML</button>}
      </div>
      <small>Il collegamento è uno-a-uno. Scollegare conserva entrambi i documenti; cambiare collegamento azzera le bozze coinvolte.</small>
    </> : <p className="muted">Riapri la lavorazione in Fatture per modificare il collegamento.</p>}
  </section>;
}
