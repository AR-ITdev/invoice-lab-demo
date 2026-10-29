# Elaborazione Tracciati · Demo

**Elaborazione tracciati per registrazione fatture passive, riconciliazione conti, registrazione entrata merci.**

Software d'appoggio a SAP per un gruppo bancario: semplifica e automatizza processi ripetitivi oggi gestiti tra SAP e fogli Excel, fonte di errori e lentezza. Segue il vero flusso di lavoro, automatizza le regole standard e lascia all'operatore (*human in the loop*) le casistiche particolari, spesso dovute a errori di fatturazione dei fornitori.

Questa demo mostra il flusso di **registrazione fatture passive**: versione web dimostrativa di un'applicazione desktop (Electron + React) che:

1. importa l'**export VIM** delle fatture passive e una **cartella di XML FatturaPA**;
2. abbina ogni riga VIM al relativo XML tramite riferimento normalizzato (maiuscole, spazi, simboli, prefissi e zeri iniziali), con correzione manuale;
3. propone per ogni documento la **registrazione contabile** applicando le regole contabili generali (segni, Dare/Avere, azzeramento), conti di contropartita, codice IVA e mese di competenza;
4. genera il **tracciato di registrazione a 50 colonne** da caricare in SAP, con una regola per ogni colonna (fissa, da XML, da VIM, condizionale, composta, calcolata…) e la possibilità di forzare singole celle;
5. esporta il lotto e l'esito VIM in CSV.

Tutti i dati (banca committente, fornitori, codici SAP, conti, codici IVA, importi) sono **inventati**. La demo funziona interamente nel browser: nessun backend, nessun dato inviato. Lo stato viene salvato in `localStorage`.

L'importazione è simulata: i pulsanti caricano esclusivamente VIM e XML di esempio, non file reali. Riconciliazione conti ed entrata merci fanno parte del perimetro del prodotto, ma non sono disponibili in questa demo. I CSV non sono certificati per il caricamento in SAP.

Se il browser impedisce la lettura o il salvataggio locale, un avviso persistente informa l'utente; la demo rimane utilizzabile in memoria, senza garantire la conservazione delle modifiche al ricaricamento.

## Collegamenti VIM e fatture

- Relazione **uno-a-uno**: ogni riga VIM può avere un XML e ogni XML una sola riga VIM.
- La pagina VIM offre ricerca e filtri per abbinati, VIM senza XML e XML senza VIM, con gestione da entrambi i lati.
- Anche dalla proposta fattura si può collegare una riga VIM libera, cambiare XML, scollegare o aprire il collegamento nel VIM.
- Scollegare non elimina i documenti. Un cambio azzera solo le bozze coinvolte e conserva gli altri abbinamenti; il vecchio XML resta disponibile.
- Le lavorazioni elaborate o scartate devono essere riaperte prima di cambiare collegamento. Numero, fornitore, importo e data discordanti vengono segnalati prima della conferma manuale, senza aggiornare automaticamente l'anagrafica.
- L'automatismo non sceglie arbitrariamente tra XML ambigui e non abbina fornitori noti incompatibili. La mancanza di un codice SAP resta un controllo bloccante della proposta.

## Regole di colonna modificabili

In **Regole**, il pulsante **Modifica** apre un editor per ciascuna delle 50 colonne:

- **Standard**, **Vuoto**, **Testo e dati** oppure **Condizioni**.
- Composizioni con testo, fonti XML/anagrafica/VIM/registrazione/calcolo, separatori espliciti, formati data e cifre minime.
- Casi ordinabili **se → allora**, con più condizioni AND; vince il primo caso valido. Casi distinti permettono alternative OR. Il risultato **altrimenti** è esplicito.
- Confronti: uguale, diverso, contiene, vuoto/non vuoto, maggiore/minore. I confronti numerici accettano la virgola decimale italiana.
- Tre sezioni indipendenti per Fornitore, Servizi e Commissioni, ciascuna con modalità, composizioni e condizioni proprie. Standard mantiene il calcolo iniziale per la categoria. Le precedenti regole condivise vengono riportate in copie indipendenti nell'editor, conservando i risultati già configurati.
- Anteprima sul documento di esempio e salvataggio esplicito; **Annulla** non applica la bozza. Le impostazioni persistono nel browser e governano sia la proposta sia il CSV.

Le fonti leggono dati originali o calcolati, mai altre celle personalizzate. Le forzature manuali della singola fattura restano prioritarie e soggette agli stessi controlli. Modificare il profilo revoca le verifiche precedenti e, previa conferma, riapre le registrazioni elaborate. Una regola invalida o una scrittura incoerente blocca conferma ed esportazione: le condizioni non aggirano i controlli contabili e fiscali.

I campi obbligatori sono controllati dopo regole e forzature, inclusi quelli specifici di fornitore e contropartite. Tipo documento, divisa EUR, lotto, progressivi, competenza e identità del fornitore devono restare coerenti con i dati verificati. Le date devono essere valide nel formato AAAAMMGG e l'importo in divisa locale deve coincidere con l'importo riconciliato.

Le modifiche all'anagrafica conservano gli abbinamenti esistenti, riaprono le registrazioni elaborate del solo fornitore interessato e revocano la presa visione delle peculiarità. Occorre verificarle e confermarle di nuovo prima dell'export.

## Regole contabili generali

- **Importi con segno**: Dare positivo, Avere negativo (colonne Importo e IVA).
- **Fattura**: fornitore −totale con chiave 31; contropartite +imponibile e +IVA con chiave 40.
- **Nota di credito (TD04)**: segni invertiti una sola volta, fornitore +totale (21) e contropartite negative (50). Se l'XML ha già righe negative non si inverte di nuovo.
- **Chiave di contropartita** dal segno dell'imponibile (o dell'IVA se l'imponibile è zero): + → 40, − → 50.
- **Azzeramento**: per ogni documento Σ(Importo + IVA) = 0,00. L'IVA non assorbe mai differenze; un saldo diverso da zero blocca la conferma.
- **Controlli**: tipo conto (K: 21/31, S: 40/50), chiave/segno incoerenti, codici IVA incompatibili e importi non numerici bloccano la conferma. Anche importi/IVA forzati diversi dalla proposta riconciliata sono bloccanti, pure a saldo zero. L'export ricontrolla i documenti confermati.
- **Classificazione righe**: parole chiave per Commissioni e arrotondamenti. Per impostazione predefinita gli sconti riducono la categoria di costo assegnata; spostarli nel conto Commissioni è solo un'eccezione configurabile del profilo.
- **Trattamenti IVA separati**: una contropartita per categoria, aliquota e natura. Nessuna aliquota prevalente. E4 per N4; I1–I6 distinti per N3.1–N3.6; A1 per 10%, A2 per 22%, indipendentemente dalla presenza di commissioni. Tutti i codici sono fittizi.
- **Riconciliazione**: una differenza di totale non determina automaticamente una commissione o un'aliquota. Lo scenario 131 propone un'integrazione solo sulla base del riscontro mock INT-131, visibile e confermato dall'operatore; l'XML originale non viene alterato.

### Perimetro della simulazione

Il tracciato è un'interfaccia dimostrativa a 50 colonne, non un formato SAP universale né un CSV certificato per il caricamento diretto. Gli importi con segno sono una convenzione di questo profilo.

I soli scenari fiscali simulati sono acquisti interni in EUR al 10%/22% con detraibilità del 100%, esenti N4 e non imponibili N3.x. Non si presume che una banca detragga tutta l'IVA: pro-rata, indetraibilità, reverse charge, split payment e ritenute sono fuori perimetro. Trattamenti non mappati e detraibilità esplicitamente diversa dal 100% vengono bloccati. La quadratura non è una validazione fiscale.

La competenza è un'indicazione da verificare: per periodi su più mesi viene richiesta una verifica di ratei/risconti, senza simulare automaticamente scritture di assestamento.

Il nuovo profilo azzera, con notifica, bozze e conferme delle versioni precedenti conservando dataset importato e anagrafica: le vecchie forzature non sono trasferibili ai nuovi gruppi IVA.

## Scenari inclusi

| Documento | Cosa mostra |
|---|---|
| 118 | Fattura ordinaria, abbinamento esatto, codice IVA A2 |
| VS81 41 | Numero XML normalizzato nel testo posizione (AA), servizi + commissioni sullo stesso trattamento IVA A2 |
| NC 7 | Nota di credito TD04: documento KG, fornitore +263,52 (21), contropartita −216 / −47,52 (50) |
| 305 | Abbinamento normalizzato con VIM «0305», differenza di 1 centesimo, competenza dedotta dalla causale |
| CN-077 | Operazione esente: codice E4 e colonna IVA vuota |
| 131 | Differenza bloccante: integrazione solo dopo conferma del riscontro documentale mock INT-131 |
| PF-0912 | Fornitore senza codice SAP in anagrafica: assegnazione dal VIM |
| 88/P | Sconto che riduce il costo Servizi: netto 800 €, IVA 176 €, debito 976 € |
| MIX-52 | Stesso conto di costo con tre trattamenti distinti: 22%, 10% e N4; quattro righe di tracciato inclusa quella fornitore |
| 140 | Riga VIM senza XML (NON TROVATO) |

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5174
npm test         # test delle regole del tracciato (node --test)
npm run build    # build statica in dist/
```

## Deploy

La build è statica, con asset dalla root (`base: "/"`). Su Vercel usare `npm run build` e la directory di output `dist`: le riscritture in `vercel.json` consentono di aprire e ricaricare direttamente le rotte. Nessuna variabile d'ambiente richiesta. Altri hosting devono configurare il fallback delle rotte verso `index.html`; la pubblicazione in sottocartella richiede una configurazione dedicata di base e percorsi.

### Navigazione

- `/`: home, anche con un progetto già salvato.
- `/fatture`: elenco e lavorazione; `/fatture/vim-01` apre il documento selezionato.
- `/fatture/vim-01/tracciato`: editor del tracciato; `/fatture/vim-01/documento`: vista documento.
- `/vim`: abbinamenti; il parametro `collegamento` identifica l'editor aperto, ad esempio `/vim?collegamento=xml%3Axml-01`.
- `/anagrafica`: fornitori.
- `/regole`: regole; `/regole/AA`: editor della colonna AA.

Indietro/Avanti ripristinano pagina e selezione dall'URL. Importazione ed esportazione sono pannelli temporanei, non pagine distinte. Gli URL non contengono i dati del progetto: su un browser senza dati salvati viene richiesto di caricare l'esempio. Documenti assenti e percorsi non riconosciuti mostrano un messaggio esplicito, senza aprire silenziosamente un'altra fattura.

## Struttura

- `src/data/demoData.js`: dati fittizi (VIM, XML, anagrafica)
- `src/lib/matching.js`: abbinamento VIM ↔ XML
- `src/lib/proposal.js`: regole delle 50 colonne, proposta IVA/competenza, controlli e saldo
- `src/lib/project.js`: costruzione del progetto ed export CSV
- `src/components/`: interfaccia (proposta, tracciato, documento originale, pagine VIM/Anagrafica/Regole)
