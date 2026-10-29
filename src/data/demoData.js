// Every name, code and amount in this file is invented for demonstration purposes.
// Tax identifiers use a visible "DEMO" prefix so they cannot be mistaken for real VAT numbers.

export const BANK = { name: "Banca Demo S.p.A.", vat: "DEMO0001", companyCode: "BD01" };

export const COST_CENTERS = [
  { id: "CC1001", label: "Rete ATM" },
  { id: "CC1002", label: "Monetica e POS" },
  { id: "CC1003", label: "Rete filiali" },
  { id: "CC1004", label: "Sede centrale" },
];

// Supplier registry keyed by VAT number. sapCode null = supplier missing from the SAP registry (scenario).
export const SUPPLIERS = {
  DEMO0101: { vat: "DEMO0101", name: "Nordica Servizi ATM S.r.l.", city: "Torino", category: "Manutenzione ATM", icon: "atm", sapCode: "900101", costCenter: "CC1001" },
  DEMO0202: { vat: "DEMO0202", name: "Valori Sicuri S.p.A.", city: "Bologna", category: "Trasporto valori", icon: "cash", sapCode: "900202", costCenter: "CC1003" },
  DEMO0303: { vat: "DEMO0303", name: "PayGrid Italia S.r.l.", city: "Milano", category: "Terminali POS", icon: "pos", sapCode: "900303", costCenter: "CC1002" },
  DEMO0404: { vat: "DEMO0404", name: "Archivio Digitale Credito S.r.l.", city: "Padova", category: "Conservazione documenti", icon: "archive", sapCode: "900404", costCenter: "CC1004" },
  DEMO0505: { vat: "DEMO0505", name: "ClearNet Consorzio Pagamenti", city: "Roma", category: "Compensazione interbancaria", icon: "clearing", sapCode: "900505", costCenter: "CC1004" },
  DEMO0606: { vat: "DEMO0606", name: "Presidio Filiali S.r.l.", city: "Verona", category: "Vigilanza filiali", icon: "security", sapCode: null, costCenter: "CC1003" },
};

// Rows of the VIM export (one per document received through the SDI), as they appear in the Excel file.
export const VIM_ROWS = [
  { id: "vim-01", reference: "118", vendor: "900101", documentDate: "2026-10-02", sdiDate: "2026-10-03", amount: 2610.8 },
  { id: "vim-02", reference: "VS81 41", vendor: "900202", documentDate: "2026-10-06", sdiDate: "2026-10-07", amount: 1274.29 },
  { id: "vim-03", reference: "NC7", vendor: "900303", documentDate: "2026-10-08", sdiDate: "2026-10-08", amount: -263.52 },
  { id: "vim-04", reference: "0305", vendor: "900404", documentDate: "2026-10-10", sdiDate: "2026-10-12", amount: 512.41 },
  { id: "vim-05", reference: "CN-077", vendor: "900505", documentDate: "2026-10-13", sdiDate: "2026-10-14", amount: 1319 },
  { id: "vim-06", reference: "131", vendor: "900101", documentDate: "2026-10-16", sdiDate: "2026-10-17", amount: 813 },
  { id: "vim-07", reference: "PF 0912", vendor: "900606", documentDate: "2026-10-20", sdiDate: "2026-10-21", amount: 3904 },
  { id: "vim-09", reference: "88/P", vendor: "900303", documentDate: "2026-10-21", sdiDate: "2026-10-22", amount: 976 },
  { id: "vim-10", reference: "MIX-52", vendor: "900404", documentDate: "2026-10-22", sdiDate: "2026-10-23", amount: 277 },
  { id: "vim-08", reference: "140", vendor: "900101", documentDate: "2026-10-22", sdiDate: "2026-10-23", amount: 1220 },
];

// Electronic invoices (FatturaPA) found in the XML folder. Line kinds are not in the XML: the app classifies them.
export const XML_INVOICES = [
  {
    id: "xml-01", fileName: "IT_DEMO0101_00118.xml", supplierVat: "DEMO0101", documentType: "TD01", number: "118",
    date: "2026-10-02", declaredTotal: 2610.8, causale: "Canone manutenzione ATM ottobre 2026",
    lines: [
      { description: "Manutenzione programmata ATM — ottobre", quantity: 1, unitPrice: 1850, vatRate: 22 },
      { description: "Sostituzione lettore carte", quantity: 2, unitPrice: 145, vatRate: 22 },
    ],
  },
  {
    id: "xml-02", fileName: "IT_DEMO0202_VS8141.xml", supplierVat: "DEMO0202", documentType: "TD01", number: "VS81      41",
    date: "2026-10-06", declaredTotal: 1274.29, causale: "Trasporto valori settimana 40",
    note: "Il numero nell'XML contiene spazi multipli: viene normalizzato prima di finire in colonna AA (testo posizione).",
    lines: [
      { description: "Servizio trasporto valori — settimana 40", quantity: 1, unitPrice: 960, vatRate: 22 },
      { description: "Commissione contazione banconote", quantity: 1, unitPrice: 84.5, vatRate: 22 },
    ],
  },
  {
    id: "xml-03", fileName: "IT_DEMO0303_NC7.xml", supplierVat: "DEMO0303", documentType: "TD04", number: "NC 7",
    date: "2026-10-08", declaredTotal: 263.52, causale: "Storno canoni POS non attivati",
    note: "Nota di credito (TD04): tipo documento SAP KG e segni invertiti una sola volta: fornitore positivo in Dare (21), contropartita negativa in Avere (50).",
    lines: [{ description: "Storno canoni POS non attivati", quantity: 12, unitPrice: 18, vatRate: 22 }],
  },
  {
    id: "xml-04", fileName: "IT_DEMO0404_305.xml", supplierVat: "DEMO0404", documentType: "TD01", number: "305",
    date: "2026-10-10", declaredTotal: 512.4, causale: "Conservazione digitale III trimestre",
    note: "Nel VIM il riferimento è «0305»: l'abbinamento ignora gli zeri iniziali. Il VIM riporta 1 centesimo in più, entro la tolleranza.",
    lines: [{ description: "Conservazione digitale documenti — III trimestre", quantity: 1, unitPrice: 420, vatRate: 22 }],
  },
  {
    id: "xml-05", fileName: "IT_DEMO0505_CN077.xml", supplierVat: "DEMO0505", documentType: "TD01", number: "CN-077",
    date: "2026-10-13", declaredTotal: 1319, causale: "Servizi di regolamento ottobre",
    note: "Operazione esente (natura N4): il codice IVA proposto è E4 e la colonna dell'IVA resta vuota.",
    lines: [
      { description: "Servizio di compensazione interbancaria", quantity: 1, unitPrice: 1200, vatRate: 0, nature: "N4" },
      { description: "Commissioni regolamento bonifici SEPA", quantity: 340, unitPrice: 0.35, vatRate: 0, nature: "N4" },
    ],
  },
  {
    id: "xml-06", fileName: "IT_DEMO0101_00131.xml", supplierVat: "DEMO0101", documentType: "TD01", number: "131",
    date: "2026-10-16", declaredTotal: 813, causale: "Intervento straordinario filiale 12",
    note: "Differenza di 20 € da riconciliare, non classificata automaticamente. Il riscontro mock INT-131 documenta un diritto di chiamata urgente: imponibile 16,39 € e IVA 22% 3,61 €. L'operatore deve confermare l'evidenza prima di integrare la proposta.",
    supportingEvidence: {
      id: "INT-131",
      description: "Prospetto integrativo fittizio del fornitore: diritto di chiamata urgente 16,39 € + IVA 22% 3,61 €, totale 20,00 €",
      line: { description: "Diritto di chiamata urgente (riscontro INT-131)", quantity: 1, unitPrice: 16.39, vatRate: 22, kind: "services" },
    },
    lines: [{ description: "Intervento straordinario ATM — filiale 12", quantity: 1, unitPrice: 650, vatRate: 22 }],
  },
  {
    id: "xml-07", fileName: "IT_DEMO0606_PF0912.xml", supplierVat: "DEMO0606", documentType: "TD01", number: "PF-0912",
    date: "2026-10-20", declaredTotal: 3904, causale: "Vigilanza filiali ottobre",
    note: "Fornitore assente dall'anagrafica SAP: senza codice fornitore il tracciato non può essere generato.",
    lines: [{ description: "Vigilanza armata filiali — ottobre", quantity: 1, unitPrice: 3200, vatRate: 22 }],
  },
  {
    id: "xml-08", fileName: "IT_DEMO0303_88P.xml", supplierVat: "DEMO0303", documentType: "TD01", number: "88/P",
    date: "2026-10-21", declaredTotal: 976, causale: "Noleggio terminali POS ottobre 2026",
    note: "Lo sconto riduce il costo del noleggio sullo stesso conto Servizi e con la stessa aliquota: imponibile netto 800 €, IVA 176 €, debito fornitore 976 €. Una riga negativa non è automaticamente una commissione.",
    lines: [
      { description: "Noleggio terminali POS — ottobre", quantity: 40, unitPrice: 22, vatRate: 22 },
      { description: "Sconto volume su noleggio", quantity: 1, unitPrice: -80, vatRate: 22 },
    ],
  },
  {
    id: "xml-09", fileName: "IT_DEMO0404_MIX52.xml", supplierVat: "DEMO0404", documentType: "TD01", number: "MIX-52",
    date: "2026-10-22", declaredTotal: 277, causale: "Documento didattico con trattamenti IVA distinti",
    note: "Aliquote e natura sono assunzioni del dataset, non una qualificazione fiscale dei servizi: 100 € al 22%, 50 € al 10% e 100 € esenti N4. Tre contropartite fiscali distinte, pur usando lo stesso conto di costo.",
    lines: [
      { description: "Prestazione mock soggetta al 22%", quantity: 1, unitPrice: 100, vatRate: 22 },
      { description: "Prestazione mock soggetta al 10%", quantity: 1, unitPrice: 50, vatRate: 10 },
      { description: "Prestazione mock esente N4", quantity: 1, unitPrice: 100, vatRate: 0, nature: "N4" },
    ],
  },
];
