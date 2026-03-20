# FinScope 🚀

Dashboard finanziaria con dati reali da Yahoo Finance.

## Struttura progetto

```
finscope/
├── api/
│   └── quote.js        ← Backend serverless (chiama Yahoo Finance)
├── public/
│   └── index.html      ← Frontend completo
└── vercel.json         ← Configurazione routing
```

## Deploy su Vercel (15 minuti)

### 1. Crea account GitHub
- Vai su https://github.com → Sign up
- Crea un nuovo repository chiamato `finscope` (pubblico)

### 2. Carica i file
- Trascina l'intera cartella `finscope/` su GitHub
- Oppure usa GitHub Desktop (più facile)

### 3. Collega Vercel
- Vai su https://vercel.com → Sign up con GitHub
- Clicca "Add New Project"
- Seleziona il repository `finscope`
- Clicca "Deploy" — nessuna configurazione necessaria

### 4. Vai live!
- Il tuo sito sarà su: `https://finscope-[tuo-username].vercel.app`
- Ogni volta che aggiorni GitHub, Vercel rideploya automaticamente

## Come funziona

Il file `api/quote.js` gira su Vercel come funzione serverless Node.js.
Fa le chiamate a Yahoo Finance lato server (niente CORS), e restituisce
i dati al frontend. Supporta tre modalità:

- `/api/quote?symbol=AAPL` → prezzo attuale
- `/api/quote?symbol=^GSPC&type=history` → storico 30gg
- `/api/quote?symbol=AAPL&type=summary` → dati fondamentali

## Simboli utili

| Titolo | Simbolo |
|--------|---------|
| S&P 500 | ^GSPC |
| FTSE MIB | ^FTSEMIB |
| Nasdaq 100 | ^NDX |
| Apple | AAPL |
| Eni | ENI.MI |
| UniCredit | UCG.MI |
| Oro | GC=F |
| Petrolio WTI | CL=F |
| EUR/USD | EURUSD=X |

## Note legali
Dati forniti da Yahoo Finance con ritardo massimo 15 minuti.
Non costituisce consulenza finanziaria.
