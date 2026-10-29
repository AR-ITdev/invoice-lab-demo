import { BANK } from "../data/demoData.js";
import { round2 } from "./format.js";

const escape = (value) => String(value ?? "").replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
const amount = (value) => round2(value).toFixed(2);

// Rebuilds a simplified FatturaPA document from the mock data, so the "XML" tab shows realistic source material.
export function fatturaPaXml(invoice, supplier) {
  const lines = invoice.lines.map((line, index) => `      <DettaglioLinee>
        <NumeroLinea>${index + 1}</NumeroLinea>
        <Descrizione>${escape(line.description)}</Descrizione>
        <Quantita>${amount(line.quantity)}</Quantita>
        <PrezzoUnitario>${amount(line.unitPrice)}</PrezzoUnitario>
        <PrezzoTotale>${amount(line.quantity * line.unitPrice)}</PrezzoTotale>
        <AliquotaIVA>${amount(line.vatRate)}</AliquotaIVA>${line.nature ? `\n        <Natura>${line.nature}</Natura>` : ""}
      </DettaglioLinee>`).join("\n");
  const byRate = new Map();
  for (const line of invoice.lines) {
    const key = `${line.vatRate}|${line.nature ?? ""}`;
    byRate.set(key, round2((byRate.get(key) ?? 0) + line.quantity * line.unitPrice));
  }
  const summaries = [...byRate].map(([key, base]) => {
    const [rate, nature] = key.split("|");
    return `      <DatiRiepilogo>
        <AliquotaIVA>${amount(rate)}</AliquotaIVA>${nature ? `\n        <Natura>${nature}</Natura>` : ""}
        <ImponibileImporto>${amount(base)}</ImponibileImporto>
        <Imposta>${amount((base * Number(rate)) / 100)}</Imposta>
      </DatiRiepilogo>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Documento dimostrativo: dati inventati -->
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${escape(invoice.supplierVat)}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${escape(supplier?.name)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Comune>${escape(supplier?.city)}</Comune><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${BANK.vat}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${escape(BANK.name)}</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${invoice.documentType}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${invoice.date}</Data>
        <Numero>${escape(invoice.number)}</Numero>
        <ImportoTotaleDocumento>${amount(invoice.declaredTotal)}</ImportoTotaleDocumento>
        <Causale>${escape(invoice.causale)}</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
${lines}
${summaries}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}
