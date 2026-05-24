# FinEdge — Guida per Claude Code

## Cos'è il progetto
Dashboard finanziaria gratuita per investitori retail (italiano + inglese).
Sito live: **finedge.it** | Fondatore: Alessandro Mazzeo (LUISS, Economia e Management)

## Stack tecnico
- **Frontend**: HTML / CSS / JavaScript vanilla (no framework, no build step)
- **Backend**: Serverless functions su Vercel (`/api/`)
- **Auth**: Clerk (`@clerk/backend`)
- **Database**: Upstash Redis (portafogli, watchlist)
- **Email**: Resend
- **Dati finanziari**: `yahoo-finance2`
- **Deploy**: Vercel

## Struttura cartelle
```
FinEdge/
├── CLAUDE.md              ← questo file
├── README.md
├── package.json           ← deps: @clerk/backend, resend, yahoo-finance2
├── vercel.json            ← routing + security headers + redirect 301
├── api/                   ← serverless functions Vercel (NON toccare se lavori sul frontend)
│   ├── _lib/yahoo.js      ← helper Yahoo Finance condiviso tra le API
│   ├── auth.js
│   ├── earnings.js
│   ├── earnings-result.js
│   ├── ecocal.js
│   ├── insider.js
│   ├── news.js
│   ├── quote.js
│   ├── screener.js
│   ├── stats.js
│   ├── stockdetail.js
│   └── user.js
├── public/                ← frontend statico (servito da Vercel)
│   ├── about.html         ← HOMEPAGE (/ punta qui via vercel.json)
│   ├── index.html         ← app dashboard principale
│   ├── chi-siamo.html     ← pagina chi siamo
│   ├── contatti.html      ← pagina contatti
│   ├── demo.html          ← pagina demo
│   ├── affiliate.js       ← infrastruttura link affiliati
│   ├── i18n.js            ← internazionalizzazione IT/EN
│   ├── assets/            ← immagini e icone (favicon.png, logo.png, logo-icon.png, icon-192/512.png)
│   │   └── (NON spostare: i path sono hardcoded negli HTML e in manifest.json)
│   ├── fonts/             ← IBM Plex Mono, Plus Jakarta Sans (self-hosted, NON toccare)
│   ├── legal/             ← pagine legali (URL pubblici: /legal/*)
│   │   ├── privacy.html
│   │   ├── cookie.html
│   │   ├── termini.html
│   │   ├── disclaimer.html
│   │   └── affiliazioni.html
│   ├── favicon.ico        ← favicon root (NON spostare: i browser lo cercano qui)
│   ├── og-image.png       ← immagine social (NON spostare: URL assoluto in meta tag)
│   ├── manifest.json, robots.txt, sitemap.xml, ads.txt
└── docs/                  ← materiali non-codice
    ├── FinEdge_Logo.png
    └── FinEdge_Prompt_ClaudeCode_Affiliazioni.md
```

## Routing Vercel (vercel.json)
| Richiesta | Destinazione |
|-----------|-------------|
| `/api/*`  | `/api/$1` (serverless) |
| `/`       | `/public/about.html` |
| `/privacy.html` | `/legal/privacy.html` (301 redirect) |
| `/cookie.html` | `/legal/cookie.html` (301 redirect) |
| `/termini.html` | `/legal/termini.html` (301 redirect) |
| `/disclaimer.html` | `/legal/disclaimer.html` (301 redirect) |
| `/affiliazioni.html` | `/legal/affiliazioni.html` (301 redirect) |
| `/*`      | `/public/$1` |

**IMPORTANTE**: i path in `public/` sono URL pubblici diretti. Non spostare o rinominare file in `public/` senza aggiornare i link nelle HTML e in `sitemap.xml`.

## Regole di sviluppo
- **Nessuna nuova dipendenza esterna** per il frontend — solo HTML/CSS/JS vanilla
- **Il footer è hardcoded** su ogni pagina (non è un componente condiviso): se modifichi il footer, va replicato su tutte le pagine HTML
- **Mostra sempre le modifiche** prima di applicarle e aspetta conferma
- **Procedi un task alla volta**, attendi OK tra uno e l'altro
- Mantieni stile grafico esistente: colori, font, spacing, classi CSS, struttura HTML
- Tono testi legali: formale ma chiaro, non legalese, con box "In parole semplici"
- Commenti nel codice in italiano

## Pagine legali
Sono in `public/legal/`: `privacy.html`, `cookie.html`, `termini.html`, `disclaimer.html`, `affiliazioni.html`
Pagine info (root): `chi-siamo.html`, `contatti.html`

## Funzionalità principali della dashboard
Dati live, analisi fondamentale/tecnica, FinEdge Score proprietario, portafoglio con metriche rischio (Sharpe, VaR, stress test), backtest, screener, dashboard macro, insider trading, calendario economico.

## Deploy
`git push` oppure deploy manuale su Vercel. Non c'è build step — i file vengono serviti direttamente.
