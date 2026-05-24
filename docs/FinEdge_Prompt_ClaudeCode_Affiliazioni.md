# Prompt completo per Claude Code — Ottimizzazione FinEdge per affiliazioni

> **Obiettivo**: preparare finedge.it a integrare link di affiliazione (broker, exchange, network) sistemando contraddizioni nelle pagine legali, creando la pagina "Trasparenza Affiliazioni", aggiornando footer e infrastruttura tecnica.

---

## Come usare questo prompt

1. Apri il terminale e vai nella cartella del progetto FinEdge:
   ```bash
   cd ~/path/to/finedge
   ```
2. Lancia Claude Code:
   ```bash
   claude
   ```
3. Copia tutto il blocco **PROMPT DA COPIARE** qui sotto e incollalo in un'unica volta.
4. Claude Code eseguirà i task in ordine, mostrandoti le modifiche **prima** di applicarle. Autorizza una alla volta dopo aver verificato.
5. Quando tutto è stato applicato e testato in locale, fai il **deploy su Vercel**.

---

## PROMPT DA COPIARE

```
Ciao Claude. Sto preparando il sito finedge.it (dashboard di analisi finanziaria) per iniziare a integrare link di affiliazione con broker, exchange e network di affiliazione (Awin, Impact, Directa, Freedom24, Bitpanda, Binance, TradingView, ecc.).

Prima di lanciare le candidature ai programmi devo sistemare alcune contraddizioni nelle pagine legali, creare una pagina di trasparenza affiliazioni, aggiornare il footer, aggiungere un'email pubblica di contatto e preparare l'infrastruttura tecnica per i link affiliati.

Procedi con i task qui sotto IN ORDINE, mostrandomi le modifiche di ogni file PRIMA di scriverle definitivamente. Aspetta sempre il mio OK tra un task e il successivo.

==========================================
CONTESTO DEL PROGETTO
==========================================

- Stack: HTML/CSS/JavaScript vanilla, hosting su Vercel
- Auth: Clerk (Privacy Policy lo cita già come processor)
- Database: Upstash Redis per portafogli/watchlist
- Lingua: Italiano + Inglese (verifica se serve aggiornare entrambe)
- Pagine legali esistenti: privacy.html, cookie.html, termini.html, disclaimer.html, chi-siamo.html, contatti.html
- Footer comune (verificare se è un template condiviso o ripetuto su ogni pagina)
- Target audience: investitori retail italiani, europei, USA, internazionali
- Fondatore: Alessandro Mazzeo

==========================================
TASK 0 — AUDIT PRELIMINARE
==========================================

Prima di toccare qualsiasi cosa, leggi e analizza:
1. Tutte le pagine legali (privacy.html, cookie.html, termini.html, disclaimer.html)
2. La struttura del footer (è un componente condiviso o hardcoded su ogni pagina?)
3. La pagina contatti.html
4. L'header/navigazione delle pagine legali (vedo che linka a /about.html — verifica se è la homepage)
5. Se esiste un sistema di build (Vite, webpack, statico puro?) e come vengono gestiti i file comuni

Fammi un report sintetico di cosa hai trovato e ATTENDI il mio OK prima di procedere.

==========================================
TASK 1 — CORREGGERE LA PRIVACY POLICY
==========================================

Nel file privacy.html ci sono affermazioni in contraddizione con i piani futuri di monetizzazione:

CONTRADDIZIONI DA RISOLVERE:
- Intro "Cosa facciamo con i tuoi dati": dice "Non c'è nessuna pubblicità" → da aggiornare
- Sezione 04 "Utilizzo dei dati": dice "Non utilizziamo i dati per: pubblicità, profilazione, rivendita a terzi, analisi di marketing" → riformulare
- Sezione 08 "Cookie": dice "Cookie di terze parti per advertising — nessuno. Non c'è nessun pixel di Facebook, Google Ads o simili." → falso, il banner cookie cita già AdSense

COSA AGGIUNGERE/MODIFICARE:
- Dichiara esplicitamente l'uso (presente o futuro) di cookie di partner affiliati per il tracking conversioni (Awin, Impact, broker partner)
- Dichiara la possibile attivazione futura di Google AdSense con consenso esplicito tramite banner cookie
- Mantieni i principi positivi: nessuna profilazione comportamentale interna, nessuna rivendita di dati personali, nessuna mail di marketing senza consenso
- Aggiungi una nuova sotto-sezione "Cookie di affiliazione" dentro la sezione 08, con elenco indicativo dei provider (Awin, Impact, Bitpanda, Binance, TradingView, ecc.) e durata tipica cookie (30–90 giorni)
- Aggiorna la data "Ultimo aggiornamento" a maggio 2026 v1.2
- Aggiorna anche il riassunto "In breve — senza legalese" mantenendo lo stesso tono onesto e diretto

VINCOLI STILISTICI:
- Mantieni rigorosamente lo stile grafico, la struttura HTML, le icone emoji, i box "In parole semplici", le classi CSS esistenti
- Tono: chiaro, onesto, non legalese, come nelle altre sezioni

Mostrami le modifiche (diff) prima di applicarle.

==========================================
TASK 2 — CREARE LA PAGINA TRASPARENZA AFFILIAZIONI
==========================================

Crea un nuovo file `affiliazioni.html` (oppure `partners.html` se più coerente con la struttura URL) con lo STESSO layout, header, footer, stile grafico e struttura HTML delle altre pagine legali (usa disclaimer.html come template di riferimento).

CONTENUTO:

Titolo: "Trasparenza sulle affiliazioni"
Sottotitolo: "Documento informativo · Conforme D.Lgs. 145/2007 (pubblicità ingannevole), Codice del Consumo, FTC Endorsement Guidelines, Reg. UE 2019/2161 (Direttiva Omnibus)"
Data: "Ultimo aggiornamento: Maggio 2026 · v1.0"

Sezioni (mantenendo struttura visiva delle altre pagine legali con icone, indice cliccabile, box "In parole semplici"):

01 — COSA SONO I LINK AFFILIATI
Spiegazione semplice: l'utente clicca un link partner, apre conto, FinEdge riceve commissione dal broker. Nessuna magia.

02 — NESSUN COSTO AGGIUNTIVO PER TE
Chiarire che il prezzo/condizioni per l'utente non cambiano. Le commissioni le paga il partner a FinEdge come compenso per la segnalazione.

03 — INDIPENDENZA EDITORIALE
Affermare esplicitamente:
- La presenza di un broker tra i partner NON influenza FinEdge Score, Price Target, screener, analisi
- Gli algoritmi sono oggettivi e basati su dati pubblici
- Possono esistere broker eccellenti che non sono partner (per scelta loro o nostra)
- Il giudizio resta sempre dell'utente

04 — COME RICONOSCERE I LINK AFFILIATI
Descrivi il sistema visivo:
- Piccolo badge "Partner" o icona ⓘ accanto al testo
- Tooltip al hover con disclosure
- Eventuale micro-testo inline: "Link affiliato — possibile commissione"

05 — PARTNER ATTUALI
Lascia un commento HTML <!-- AGGIORNARE QUANDO ATTIVI I PROGRAMMI --> e per ora menziona genericamente per categoria:
- Broker italiani: Directa SIM
- Broker europei: Scalable Capital, Trade Republic, Freedom24
- Broker globali: eToro, XTB, Interactive Brokers, IG, Saxo
- Exchange crypto: Bitpanda, Binance, Young Platform, Coinbase, Kraken
- Hardware wallet: Ledger
- Tool/analisi: TradingView, Seeking Alpha
- Network di affiliazione: Awin, Impact, CJ Affiliate

06 — COME SCEGLIAMO I PARTNER
Criteri editoriali (non il compenso):
- Regolamentazione (CONSOB, BaFin, CySEC, FCA, SEC, ecc.)
- Reputazione e anni sul mercato
- Sicurezza fondi cliente (segregazione conti, FSCS, MiCA)
- Qualità servizio e tariffe competitive
- Trasparenza commissioni

07 — I TUOI DIRITTI COME UTENTE
- L'utente è libero di scegliere qualsiasi broker, anche non partner
- Il sito fornisce informazioni, non consulenza personalizzata (rimando al disclaimer)
- Il fondatore non è iscritto OCF e non presta consulenza ex MiFID II

08 — DISCLAIMER SPECIFICO BROKER CFD/LEVERAGE
Testo obbligatorio: "Alcuni partner offrono prodotti con leva finanziaria (CFD, forex) ad ALTO RISCHIO. Tra il 70% e l'85% dei conti retail perde denaro con il trading di CFD. Investi solo capitale che puoi permetterti di perdere. Verifica sempre le condizioni del broker e la sua regolamentazione prima di operare."

09 — CONTATTI E SEGNALAZIONI
- Email per dubbi sull'affiliate disclosure
- Possibilità di segnalare problemi con i partner

VINCOLI:
- Meta tag SEO: title "Trasparenza Affiliazioni — FinEdge", description appropriata, og:title, og:description, og:type, twitter:card
- Mobile responsive (verifica media query con altre pagine legali)
- Stesso footer delle altre pagine
- Header coerente

Mostrami il file completo prima di crearlo.

==========================================
TASK 3 — AGGIORNARE I TERMINI
==========================================

Nel file termini.html aggiungi una nuova sezione (rispetta la numerazione esistente — leggi il file e usa il numero successivo) intitolata:

"Partner commerciali e link affiliati"

Contenuto:
- Dichiarazione che il sito contiene link affiliati verso partner commerciali
- Rimando alla pagina dedicata Trasparenza Affiliazioni per dettagli completi
- Specifica che la presenza di un partner NON costituisce raccomandazione di investimento personalizzata ai sensi della MiFID II
- Rimando al disclaimer per la natura informativa del servizio
- L'utente accetta che FinEdge può ricevere compensi per le conversioni generate

Aggiorna la data "Ultimo aggiornamento" alla versione corrente.

==========================================
TASK 4 — AGGIORNARE IL FOOTER SU TUTTE LE PAGINE
==========================================

Modifica il footer (componente condiviso o ripetuto) per:

1. Aggiungere il link "Affiliazioni" o "Trasparenza" accanto agli altri link legali. Nuovo ordine consigliato:
   Home · Chi siamo · Contatti · Privacy · Cookie · Termini · Disclaimer · Affiliazioni

2. Aggiungere un'EMAIL PUBBLICA DI CONTATTO visibile (es. info@finedge.it). FERMATI E CHIEDIMI quale email vuole usare prima di scriverla.

3. Aggiungere micro-testo disclosure (solo in pagine che potrebbero contenere link affiliati, NON nelle pagine legali pure):
   "FinEdge può ricevere commissioni dai link partner. Nessun costo aggiuntivo per te. [Maggiori info →](/affiliazioni.html)"

4. Mantenere il footer pulito e visivamente coerente con il design attuale.

5. Verifica che il footer aggiornato sia identico su:
   - index.html / about.html (homepage)
   - chi-siamo.html
   - contatti.html
   - privacy.html
   - cookie.html
   - termini.html
   - disclaimer.html
   - affiliazioni.html (nuovo)
   - Eventuali altre pagine pubbliche

Se il footer è hardcoded su ogni pagina invece che essere un componente, proponi di refactorizzarlo in un componente condiviso (un JS che inietta il footer, oppure un include lato build). NON eseguire il refactor senza il mio OK — proponilo e basta.

==========================================
TASK 5 — AGGIORNARE LA PAGINA CONTATTI
==========================================

In contatti.html:
- Aggiungi un'email pubblica visibile chiaramente (sopra il form se c'è)
- Verifica che il form di contatto sia funzionante (se ha un endpoint, dimmi quale e se serve test)
- Aggiungi un riferimento dedicato per partnership commerciali / affiliazioni: "Per richieste di partnership: partnership@finedge.it" (o email a tua scelta)
- Mantieni stile coerente

==========================================
TASK 6 — SISTEMARE L'INCOERENZA HEADER PAGINE LEGALI
==========================================

Le pagine legali hanno un header con "Fin Edge" che linka a /about.html.

Verifica:
- Se /about.html è effettivamente la homepage attuale, lasciala ma valuta di rinominare per coerenza convenzionale (about = chi siamo, home = /)
- Oppure aggiorna i link affinché "Fin Edge" porti a `/` (homepage) e /about.html resti come pagina dedicata
- In ogni caso, garantisci uniformità su tutte le pagine

NON eseguire questa modifica senza il mio OK — proponimi la soluzione che ti sembra più coerente con la struttura attuale e attendi conferma.

==========================================
TASK 7 — FILE TECNICI: ads.txt, robots.txt, sitemap.xml
==========================================

1. Crea `ads.txt` nella root. Per ora con commento placeholder:
   # AdSense not yet approved — to be populated when approved
   # Format when ready: google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0

2. Verifica `robots.txt`:
   - Esiste? Se no, crealo
   - Non deve bloccare crawler di AdSense, Awin, Impact, broker
   - Aggiungi `User-agent: *` con `Allow: /`
   - Aggiungi riga `Sitemap: https://finedge.it/sitemap.xml`

3. Verifica `sitemap.xml`:
   - Esiste? Se no, generala includendo TUTTE le pagine pubbliche (incluse le legali e la nuova affiliazioni.html)
   - Aggiungi lastmod, priority, changefreq sensati per ogni URL

==========================================
TASK 8 — INFRASTRUTTURA PER LINK AFFILIATI
==========================================

NON integrare ancora i link nei punti specifici della dashboard. Solo preparare l'infrastruttura riutilizzabile.

CSS:
Aggiungi al CSS principale una classe `.affiliate-link` (o `.partner-button`) con:
- Stile pulsante coerente col design system (colori, padding, border-radius del sito)
- Piccolo badge "Partner" o icona ⓘ accanto al testo
- Tooltip al hover che mostra "Link affiliato — FinEdge può ricevere commissioni, senza costo per te"
- Stato :hover, :focus, :active

JavaScript:
Crea un file `affiliate.js` (o aggiungilo a un file JS esistente coerente) con:
- Funzione `createAffiliateLink({ broker, url, label, ticker?, riskWarning? })` che genera HTML del pulsante con:
  - Attributi `rel="sponsored noopener nofollow"` (importante per Google e per conformità)
  - `target="_blank"`
  - Disclosure inline micro-testo (configurabile)
  - Se `riskWarning: true`, aggiunge sotto il pulsante il disclaimer ESMA "78% dei conti retail perde denaro..."
- Funzione `trackAffiliateClick(broker, url)` che per ora fa solo `console.log` (in futuro si collegherà a un sistema di tracking)
- Listener globale che aggiunge automaticamente `rel="sponsored noopener nofollow"` a tutti i link con classe `.affiliate-link` (failsafe)

Dimmi DOVE collocarlo (nuovo file o file esistente) prima di scriverlo.

==========================================
TASK 9 — VERIFICA FINALE
==========================================

Dopo aver applicato tutti i task precedenti:

1. Rileggi privacy.html, cookie.html, termini.html, disclaimer.html, affiliazioni.html e verifica che NON ci siano più contraddizioni tra le pagine (cerca specificamente menzioni di "no pubblicità" / "no advertising" / "nessun cookie pubblicitario" residue)

2. Verifica che TUTTE le pagine pubbliche abbiano lo stesso footer aggiornato

3. Verifica che l'email pubblica sia coerente ovunque venga citata

4. Verifica che le date "Ultimo aggiornamento" siano allineate

5. Apri il sito (anche solo in locale) e clicca tutti i link del footer per verificare che nessuno sia rotto

6. Verifica responsive su mobile (almeno controllando le media query)

7. Fammi un REPORT FINALE con:
   - Lista completa file modificati (con un summary di cosa è cambiato in ognuno)
   - Lista nuovi file creati
   - Eventuali avvisi di cose da fare manualmente fuori dal codice (es. "configurare DNS MX per email info@finedge.it", "deploy su Vercel", "verifica visualizzazione mobile dopo deploy")
   - Checklist test manuali post-deploy
   - Eventuali raccomandazioni aggiuntive

==========================================
LINEE GUIDA OPERATIVE (IMPORTANTI)
==========================================

- Mostrami SEMPRE le modifiche/diff PRIMA di scriverle definitivamente
- Mantieni rigorosamente lo stile grafico esistente: colori, font, spacing, struttura HTML, classi CSS
- NON aggiungere dipendenze esterne nuove (mantieni HTML/CSS/JS vanilla)
- Scrivi codice pulito, indentato, con commenti dove serve (in italiano)
- Per i testi legali in italiano usa lo stesso tono delle pagine esistenti: formale ma chiaro, con sezioni "In parole semplici"
- Se trovi ambiguità, fermati e chiedimi conferma
- Procedi UN TASK ALLA VOLTA, attendi il mio OK tra uno e l'altro

==========================================

Inizia con il Task 0 (audit preliminare). Fammi il report e attendi conferma.
```

---

## Dopo aver eseguito il prompt

### Checklist post-implementazione

1. **Test locale**: apri il sito in locale o su staging, naviga tutte le pagine modificate
2. **Verifica visuale**: controlla che il design sia rimasto coerente (footer, header, pagine legali)
3. **Verifica responsive**: prova su mobile (DevTools Chrome → modalità responsive)
4. **Verifica link**: clicca tutti i link del footer su almeno 3 pagine diverse
5. **Verifica email**: configura DNS / forwarder per l'email pubblica scelta (info@finedge.it o simili)
6. **Deploy Vercel**: `git push` o deploy manuale
7. **Test live**: ripeti i test sul sito live dopo il deploy
8. **Attendi 24-48h**: lascia il tempo a Google di re-crawlare prima di candidarti agli affiliate

### Solo dopo essere live e tutto OK → procedi con le candidature

**Prima ondata (giorno 1)**:
1. Directa SIM — directa.it (cerca "Affiliazione" o contatta info@directa.it)
2. Awin — awin.com (registrazione publisher 5€ rimborsabili)
3. Bitpanda — bitpanda.com/affiliate

**Seconda ondata (giorno 7)**:
4. Freedom24 — freedom24.com/partners
5. Impact.com — impact.com (registrazione publisher per accesso programmi USA)
6. TradingView Affiliate — tradingview.com/affiliate

**Terza ondata (settimana 3-4)**:
7. Binance Affiliate — binance.com/affiliate
8. Young Platform — programma referral
9. eToro Partners, Interactive Brokers Refer a Friend, XTB

---

## Template pitch per i form di candidatura

### Versione italiana

> FinEdge (https://finedge.it) è una dashboard professionale gratuita per l'analisi dei mercati finanziari, dedicata a investitori retail italiani, europei e internazionali.
>
> La piattaforma è disponibile in italiano e inglese e copre mercati globali: azioni USA (S&P 500, NASDAQ, NYSE), indici europei (FTSE MIB, DAX, CAC 40, FTSE 100), mercati asiatici, ETF, obbligazioni, commodities e crypto.
>
> Le funzionalità principali includono: dati live, analisi fondamentale e tecnica, FinEdge Score proprietario, gestione portafoglio con metriche di rischio (Sharpe, VaR, stress test), backtest, screener, dashboard macro, insider trading e calendario economico.
>
> Il sito è GDPR-compliant, dispone di tutte le pagine legali (Privacy, Cookie, Termini, Disclaimer, Trasparenza Affiliazioni) ed è gestito da Alessandro Mazzeo, studente di Economia e Management alla LUISS Guido Carli e sviluppatore.
>
> L'integrazione del vostro programma avverrebbe tramite pulsanti contestuali "Apri conto / Acquista su [broker]" nelle schede titoli e nel portafoglio, oltre a una pagina dedicata di comparazione broker e futuri articoli educativi.

### Versione inglese

> FinEdge (https://finedge.it) is a professional, free-to-use financial markets analysis dashboard targeting retail investors in Italy, Europe, the US and globally.
>
> The platform is available in Italian and English and covers global markets: US equities (S&P 500, NASDAQ, NYSE), European indices (FTSE MIB, DAX, CAC 40, FTSE 100, Euro Stoxx), Asian markets (Nikkei, Hang Seng), ETFs, bonds, commodities and crypto.
>
> Core features include real-time data, fundamental and technical analysis, proprietary scoring (FinEdge Score), portfolio management with risk metrics (Sharpe ratio, VaR, stress test), backtesting, screener, macro dashboard, insider trading data and economic calendar.
>
> The site is GDPR-compliant with full legal pages (Privacy, Cookie, Terms, Disclaimer, Affiliate Disclosure) and is owned and operated by Alessandro Mazzeo, Economics & Management student at LUISS Guido Carli and developer.
>
> Integration of the partner program would occur via contextual "Open account / Trade on [broker]" buttons within stock detail views, portfolio sections and a dedicated broker comparison landing page, alongside future educational articles.

---

## Documenti utili da preparare in parallelo

- [ ] Codice fiscale e documento d'identità (alcuni programmi lo richiedono)
- [ ] IBAN per ricevere pagamenti
- [ ] Account Wise o Revolut per ricevere pagamenti multi-valuta (consigliato)
- [ ] Eventuale screenshot Google Analytics o Vercel Analytics (se ti chiedono numeri)
- [ ] Per network USA (Impact, CJ): modulo W-8BEN compilato (residente fiscale italiano)

---

## Note fiscali rapide (Italia)

- Sotto ~5.000€/anno di compensi affiliate puoi gestirli come "redditi diversi" nella dichiarazione dei redditi
- Sopra quella soglia, consigliata Partita IVA forfettaria (15% per i primi 5 anni se nuova attività, codice ATECO 73.11.02 o simile)
- Per network USA serve compilare W-8BEN per evitare doppia tassazione
- Consulta un commercialista appena iniziano ad arrivare i primi guadagni significativi
