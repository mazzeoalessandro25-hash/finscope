/**
 * /api/screener.js
 *
 * Modalità:
 *   GET /api/screener?q=apple           → autocomplete Yahoo Finance
 *   GET /api/screener?symbols=AAPL,...  → bulk quote via yahoo-finance2
 *   GET /api/screener?index=sp500       → costituenti statici (prezzi caricati dal frontend)
 *
 * Usa yahoo-finance2 (gestisce crumb/cookie automaticamente).
 */
import { yf } from './_lib/yahoo.js';

/* ─────────────────────────────────────────────────────────
   COSTITUENTI STATICI DEGLI INDICI
   Fonte: composizioni ufficiali (aggiornate a inizio 2025)
   ───────────────────────────────────────────────────────── */
const INDEX_DATA = {

  /* ── DOW JONES 30 ── */
  dowjones: [
    {s:'AAPL',n:'Apple',sec:'Technology',mkt:'US'},
    {s:'MSFT',n:'Microsoft',sec:'Technology',mkt:'US'},
    {s:'NVDA',n:'NVIDIA',sec:'Technology',mkt:'US'},
    {s:'UNH',n:'UnitedHealth',sec:'Healthcare',mkt:'US'},
    {s:'GS',n:'Goldman Sachs',sec:'Financial Services',mkt:'US'},
    {s:'HD',n:'Home Depot',sec:'Consumer Cyclical',mkt:'US'},
    {s:'SHW',n:'Sherwin-Williams',sec:'Basic Materials',mkt:'US'},
    {s:'CAT',n:'Caterpillar',sec:'Industrials',mkt:'US'},
    {s:'CRM',n:'Salesforce',sec:'Technology',mkt:'US'},
    {s:'MCD',n:"McDonald's",sec:'Consumer Cyclical',mkt:'US'},
    {s:'AXP',n:'American Express',sec:'Financial Services',mkt:'US'},
    {s:'V',n:'Visa',sec:'Financial Services',mkt:'US'},
    {s:'JPM',n:'JPMorgan Chase',sec:'Financial Services',mkt:'US'},
    {s:'IBM',n:'IBM',sec:'Technology',mkt:'US'},
    {s:'AMGN',n:'Amgen',sec:'Healthcare',mkt:'US'},
    {s:'HON',n:'Honeywell',sec:'Industrials',mkt:'US'},
    {s:'TRV',n:'Travelers',sec:'Financial Services',mkt:'US'},
    {s:'PG',n:'Procter & Gamble',sec:'Consumer Defensive',mkt:'US'},
    {s:'JNJ',n:'Johnson & Johnson',sec:'Healthcare',mkt:'US'},
    {s:'MRK',n:'Merck',sec:'Healthcare',mkt:'US'},
    {s:'KO',n:'Coca-Cola',sec:'Consumer Defensive',mkt:'US'},
    {s:'WMT',n:'Walmart',sec:'Consumer Defensive',mkt:'US'},
    {s:'CVX',n:'Chevron',sec:'Energy',mkt:'US'},
    {s:'MMM',n:'3M',sec:'Industrials',mkt:'US'},
    {s:'NKE',n:'Nike',sec:'Consumer Cyclical',mkt:'US'},
    {s:'DIS',n:'Walt Disney',sec:'Communication Services',mkt:'US'},
    {s:'BA',n:'Boeing',sec:'Industrials',mkt:'US'},
    {s:'CSCO',n:'Cisco',sec:'Technology',mkt:'US'},
    {s:'VZ',n:'Verizon',sec:'Communication Services',mkt:'US'},
    {s:'DOW',n:'Dow Inc.',sec:'Basic Materials',mkt:'US'},
  ],

  /* ── NASDAQ 100 (top 100) ── */
  nasdaq100: [
    {s:'MSFT',n:'Microsoft',sec:'Technology',mkt:'US'},
    {s:'AAPL',n:'Apple',sec:'Technology',mkt:'US'},
    {s:'NVDA',n:'NVIDIA',sec:'Technology',mkt:'US'},
    {s:'AMZN',n:'Amazon',sec:'Consumer Cyclical',mkt:'US'},
    {s:'META',n:'Meta Platforms',sec:'Technology',mkt:'US'},
    {s:'GOOGL',n:'Alphabet (A)',sec:'Technology',mkt:'US'},
    {s:'GOOG',n:'Alphabet (C)',sec:'Technology',mkt:'US'},
    {s:'TSLA',n:'Tesla',sec:'Consumer Cyclical',mkt:'US'},
    {s:'AVGO',n:'Broadcom',sec:'Technology',mkt:'US'},
    {s:'COST',n:'Costco',sec:'Consumer Defensive',mkt:'US'},
    {s:'NFLX',n:'Netflix',sec:'Technology',mkt:'US'},
    {s:'ASML',n:'ASML',sec:'Technology',mkt:'EU'},
    {s:'AZN',n:'AstraZeneca',sec:'Healthcare',mkt:'US'},
    {s:'AMD',n:'AMD',sec:'Technology',mkt:'US'},
    {s:'PEP',n:'PepsiCo',sec:'Consumer Defensive',mkt:'US'},
    {s:'LIN',n:'Linde',sec:'Basic Materials',mkt:'US'},
    {s:'QCOM',n:'Qualcomm',sec:'Technology',mkt:'US'},
    {s:'INTU',n:'Intuit',sec:'Technology',mkt:'US'},
    {s:'AMAT',n:'Applied Materials',sec:'Technology',mkt:'US'},
    {s:'TXN',n:'Texas Instruments',sec:'Technology',mkt:'US'},
    {s:'ISRG',n:'Intuitive Surgical',sec:'Healthcare',mkt:'US'},
    {s:'CSCO',n:'Cisco',sec:'Technology',mkt:'US'},
    {s:'BKNG',n:'Booking Holdings',sec:'Consumer Cyclical',mkt:'US'},
    {s:'MU',n:'Micron Technology',sec:'Technology',mkt:'US'},
    {s:'HON',n:'Honeywell',sec:'Industrials',mkt:'US'},
    {s:'AMGN',n:'Amgen',sec:'Healthcare',mkt:'US'},
    {s:'LRCX',n:'Lam Research',sec:'Technology',mkt:'US'},
    {s:'MELI',n:'MercadoLibre',sec:'Consumer Cyclical',mkt:'US'},
    {s:'VRTX',n:'Vertex Pharmaceuticals',sec:'Healthcare',mkt:'US'},
    {s:'ADI',n:'Analog Devices',sec:'Technology',mkt:'US'},
    {s:'PANW',n:'Palo Alto Networks',sec:'Technology',mkt:'US'},
    {s:'SBUX',n:'Starbucks',sec:'Consumer Cyclical',mkt:'US'},
    {s:'GILD',n:'Gilead Sciences',sec:'Healthcare',mkt:'US'},
    {s:'MDLZ',n:'Mondelez International',sec:'Consumer Defensive',mkt:'US'},
    {s:'ADP',n:'Automatic Data Processing',sec:'Technology',mkt:'US'},
    {s:'REGN',n:'Regeneron',sec:'Healthcare',mkt:'US'},
    {s:'KDP',n:'Keurig Dr Pepper',sec:'Consumer Defensive',mkt:'US'},
    {s:'KLAC',n:'KLA Corporation',sec:'Technology',mkt:'US'},
    {s:'SNPS',n:'Synopsys',sec:'Technology',mkt:'US'},
    {s:'CDNS',n:'Cadence Design',sec:'Technology',mkt:'US'},
    {s:'MAR',n:'Marriott International',sec:'Consumer Cyclical',mkt:'US'},
    {s:'CEG',n:'Constellation Energy',sec:'Utilities',mkt:'US'},
    {s:'CTAS',n:'Cintas',sec:'Industrials',mkt:'US'},
    {s:'ORLY',n:"O'Reilly Automotive",sec:'Consumer Cyclical',mkt:'US'},
    {s:'MRVL',n:'Marvell Technology',sec:'Technology',mkt:'US'},
    {s:'MNST',n:'Monster Beverage',sec:'Consumer Defensive',mkt:'US'},
    {s:'CHTR',n:'Charter Communications',sec:'Communication Services',mkt:'US'},
    {s:'PYPL',n:'PayPal',sec:'Financial Services',mkt:'US'},
    {s:'PCAR',n:'PACCAR',sec:'Industrials',mkt:'US'},
    {s:'WDAY',n:'Workday',sec:'Technology',mkt:'US'},
    {s:'ADSK',n:'Autodesk',sec:'Technology',mkt:'US'},
    {s:'NXPI',n:'NXP Semiconductors',sec:'Technology',mkt:'US'},
    {s:'MCHP',n:'Microchip Technology',sec:'Technology',mkt:'US'},
    {s:'DXCM',n:'Dexcom',sec:'Healthcare',mkt:'US'},
    {s:'FTNT',n:'Fortinet',sec:'Technology',mkt:'US'},
    {s:'ROST',n:'Ross Stores',sec:'Consumer Cyclical',mkt:'US'},
    {s:'ODFL',n:'Old Dominion Freight',sec:'Industrials',mkt:'US'},
    {s:'VRSK',n:'Verisk Analytics',sec:'Industrials',mkt:'US'},
    {s:'IDXX',n:'IDEXX Laboratories',sec:'Healthcare',mkt:'US'},
    {s:'GEHC',n:'GE HealthCare',sec:'Healthcare',mkt:'US'},
    {s:'LULU',n:'Lululemon',sec:'Consumer Cyclical',mkt:'US'},
    {s:'EXC',n:'Exelon',sec:'Utilities',mkt:'US'},
    {s:'XEL',n:'Xcel Energy',sec:'Utilities',mkt:'US'},
    {s:'ON',n:'ON Semiconductor',sec:'Technology',mkt:'US'},
    {s:'CTSH',n:'Cognizant',sec:'Technology',mkt:'US'},
    {s:'TEAM',n:'Atlassian',sec:'Technology',mkt:'US'},
    {s:'TTD',n:'The Trade Desk',sec:'Technology',mkt:'US'},
    {s:'ANSS',n:'Ansys',sec:'Technology',mkt:'US'},
    {s:'DDOG',n:'Datadog',sec:'Technology',mkt:'US'},
    {s:'ZS',n:'Zscaler',sec:'Technology',mkt:'US'},
    {s:'CRWD',n:'CrowdStrike',sec:'Technology',mkt:'US'},
    {s:'BIIB',n:'Biogen',sec:'Healthcare',mkt:'US'},
    {s:'WBD',n:'Warner Bros. Discovery',sec:'Communication Services',mkt:'US'},
    {s:'KHC',n:'Kraft Heinz',sec:'Consumer Defensive',mkt:'US'},
    {s:'CMCSA',n:'Comcast',sec:'Communication Services',mkt:'US'},
    {s:'PAYX',n:'Paychex',sec:'Technology',mkt:'US'},
    {s:'FAST',n:'Fastenal',sec:'Industrials',mkt:'US'},
    {s:'CPRT',n:'Copart',sec:'Industrials',mkt:'US'},
    {s:'FANG',n:'Diamondback Energy',sec:'Energy',mkt:'US'},
    {s:'EA',n:'Electronic Arts',sec:'Communication Services',mkt:'US'},
    {s:'GFS',n:'GlobalFoundries',sec:'Technology',mkt:'US'},
    {s:'APP',n:'Applovin',sec:'Technology',mkt:'US'},
    {s:'PLTR',n:'Palantir',sec:'Technology',mkt:'US'},
    {s:'ARM',n:'ARM Holdings',sec:'Technology',mkt:'US'},
    {s:'ILMN',n:'Illumina',sec:'Healthcare',mkt:'US'},
    {s:'MDB',n:'MongoDB',sec:'Technology',mkt:'US'},
    {s:'SMCI',n:'Super Micro Computer',sec:'Technology',mkt:'US'},
    {s:'NBIX',n:'Neurocrine Biosciences',sec:'Healthcare',mkt:'US'},
    {s:'SIRI',n:'Sirius XM',sec:'Communication Services',mkt:'US'},
    {s:'CDW',n:'CDW Corporation',sec:'Technology',mkt:'US'},
    {s:'TMUS',n:'T-Mobile',sec:'Communication Services',mkt:'US'},
    {s:'COIN',n:'Coinbase',sec:'Financial Services',mkt:'US'},
    {s:'ABNB',n:'Airbnb',sec:'Consumer Cyclical',mkt:'US'},
    {s:'ZM',n:'Zoom Video',sec:'Technology',mkt:'US'},
    {s:'ALGN',n:'Align Technology',sec:'Healthcare',mkt:'US'},
    {s:'CCEP',n:'Coca-Cola Europacific',sec:'Consumer Defensive',mkt:'EU'},
    {s:'ACGL',n:'Arch Capital',sec:'Financial Services',mkt:'US'},
  ],

  /* ── S&P 500 top 100 ── */
  sp500: [
    {s:'AAPL',n:'Apple',sec:'Technology',mkt:'US'},
    {s:'MSFT',n:'Microsoft',sec:'Technology',mkt:'US'},
    {s:'NVDA',n:'NVIDIA',sec:'Technology',mkt:'US'},
    {s:'AMZN',n:'Amazon',sec:'Consumer Cyclical',mkt:'US'},
    {s:'META',n:'Meta Platforms',sec:'Technology',mkt:'US'},
    {s:'GOOGL',n:'Alphabet (A)',sec:'Technology',mkt:'US'},
    {s:'GOOG',n:'Alphabet (C)',sec:'Technology',mkt:'US'},
    {s:'BRK-B',n:'Berkshire Hathaway',sec:'Financial Services',mkt:'US'},
    {s:'LLY',n:'Eli Lilly',sec:'Healthcare',mkt:'US'},
    {s:'TSLA',n:'Tesla',sec:'Consumer Cyclical',mkt:'US'},
    {s:'AVGO',n:'Broadcom',sec:'Technology',mkt:'US'},
    {s:'JPM',n:'JPMorgan Chase',sec:'Financial Services',mkt:'US'},
    {s:'UNH',n:'UnitedHealth',sec:'Healthcare',mkt:'US'},
    {s:'XOM',n:'ExxonMobil',sec:'Energy',mkt:'US'},
    {s:'V',n:'Visa',sec:'Financial Services',mkt:'US'},
    {s:'MA',n:'Mastercard',sec:'Financial Services',mkt:'US'},
    {s:'COST',n:'Costco',sec:'Consumer Defensive',mkt:'US'},
    {s:'HD',n:'Home Depot',sec:'Consumer Cyclical',mkt:'US'},
    {s:'JNJ',n:'Johnson & Johnson',sec:'Healthcare',mkt:'US'},
    {s:'NFLX',n:'Netflix',sec:'Technology',mkt:'US'},
    {s:'PG',n:'Procter & Gamble',sec:'Consumer Defensive',mkt:'US'},
    {s:'BAC',n:'Bank of America',sec:'Financial Services',mkt:'US'},
    {s:'WMT',n:'Walmart',sec:'Consumer Defensive',mkt:'US'},
    {s:'ABBV',n:'AbbVie',sec:'Healthcare',mkt:'US'},
    {s:'CRM',n:'Salesforce',sec:'Technology',mkt:'US'},
    {s:'CVX',n:'Chevron',sec:'Energy',mkt:'US'},
    {s:'MRK',n:'Merck',sec:'Healthcare',mkt:'US'},
    {s:'KO',n:'Coca-Cola',sec:'Consumer Defensive',mkt:'US'},
    {s:'AMD',n:'AMD',sec:'Technology',mkt:'US'},
    {s:'PEP',n:'PepsiCo',sec:'Consumer Defensive',mkt:'US'},
    {s:'ORCL',n:'Oracle',sec:'Technology',mkt:'US'},
    {s:'GS',n:'Goldman Sachs',sec:'Financial Services',mkt:'US'},
    {s:'QCOM',n:'Qualcomm',sec:'Technology',mkt:'US'},
    {s:'WFC',n:'Wells Fargo',sec:'Financial Services',mkt:'US'},
    {s:'TXN',n:'Texas Instruments',sec:'Technology',mkt:'US'},
    {s:'INTU',n:'Intuit',sec:'Technology',mkt:'US'},
    {s:'AMGN',n:'Amgen',sec:'Healthcare',mkt:'US'},
    {s:'CAT',n:'Caterpillar',sec:'Industrials',mkt:'US'},
    {s:'MS',n:'Morgan Stanley',sec:'Financial Services',mkt:'US'},
    {s:'IBM',n:'IBM',sec:'Technology',mkt:'US'},
    {s:'GE',n:'GE Aerospace',sec:'Industrials',mkt:'US'},
    {s:'RTX',n:'RTX Corporation',sec:'Industrials',mkt:'US'},
    {s:'SPGI',n:'S&P Global',sec:'Financial Services',mkt:'US'},
    {s:'ISRG',n:'Intuitive Surgical',sec:'Healthcare',mkt:'US'},
    {s:'AMAT',n:'Applied Materials',sec:'Technology',mkt:'US'},
    {s:'NOW',n:'ServiceNow',sec:'Technology',mkt:'US'},
    {s:'BKNG',n:'Booking Holdings',sec:'Consumer Cyclical',mkt:'US'},
    {s:'AXP',n:'American Express',sec:'Financial Services',mkt:'US'},
    {s:'PLD',n:'Prologis',sec:'Real Estate',mkt:'US'},
    {s:'LIN',n:'Linde',sec:'Basic Materials',mkt:'US'},
    {s:'HON',n:'Honeywell',sec:'Industrials',mkt:'US'},
    {s:'VRTX',n:'Vertex Pharmaceuticals',sec:'Healthcare',mkt:'US'},
    {s:'MU',n:'Micron Technology',sec:'Technology',mkt:'US'},
    {s:'ADI',n:'Analog Devices',sec:'Technology',mkt:'US'},
    {s:'CI',n:'Cigna',sec:'Healthcare',mkt:'US'},
    {s:'UNP',n:'Union Pacific',sec:'Industrials',mkt:'US'},
    {s:'PM',n:'Philip Morris',sec:'Consumer Defensive',mkt:'US'},
    {s:'LRCX',n:'Lam Research',sec:'Technology',mkt:'US'},
    {s:'SYK',n:'Stryker',sec:'Healthcare',mkt:'US'},
    {s:'C',n:'Citigroup',sec:'Financial Services',mkt:'US'},
    {s:'BLK',n:'BlackRock',sec:'Financial Services',mkt:'US'},
    {s:'CME',n:'CME Group',sec:'Financial Services',mkt:'US'},
    {s:'PANW',n:'Palo Alto Networks',sec:'Technology',mkt:'US'},
    {s:'REGN',n:'Regeneron',sec:'Healthcare',mkt:'US'},
    {s:'PH',n:'Parker Hannifin',sec:'Industrials',mkt:'US'},
    {s:'KLAC',n:'KLA Corporation',sec:'Technology',mkt:'US'},
    {s:'SNPS',n:'Synopsys',sec:'Technology',mkt:'US'},
    {s:'MMC',n:'Marsh & McLennan',sec:'Financial Services',mkt:'US'},
    {s:'USB',n:'U.S. Bancorp',sec:'Financial Services',mkt:'US'},
    {s:'BX',n:'Blackstone',sec:'Financial Services',mkt:'US'},
    {s:'TJX',n:'TJX Companies',sec:'Consumer Cyclical',mkt:'US'},
    {s:'ADP',n:'Automatic Data Processing',sec:'Technology',mkt:'US'},
    {s:'CDNS',n:'Cadence Design',sec:'Technology',mkt:'US'},
    {s:'SHW',n:'Sherwin-Williams',sec:'Basic Materials',mkt:'US'},
    {s:'BA',n:'Boeing',sec:'Industrials',mkt:'US'},
    {s:'SBUX',n:'Starbucks',sec:'Consumer Cyclical',mkt:'US'},
    {s:'DE',n:'Deere & Company',sec:'Industrials',mkt:'US'},
    {s:'MDT',n:'Medtronic',sec:'Healthcare',mkt:'US'},
    {s:'BMY',n:'Bristol-Myers Squibb',sec:'Healthcare',mkt:'US'},
    {s:'GILD',n:'Gilead Sciences',sec:'Healthcare',mkt:'US'},
    {s:'DUK',n:'Duke Energy',sec:'Utilities',mkt:'US'},
    {s:'APH',n:'Amphenol',sec:'Technology',mkt:'US'},
    {s:'COP',n:'ConocoPhillips',sec:'Energy',mkt:'US'},
    {s:'MO',n:'Altria',sec:'Consumer Defensive',mkt:'US'},
    {s:'MDLZ',n:'Mondelez',sec:'Consumer Defensive',mkt:'US'},
    {s:'ETN',n:'Eaton Corporation',sec:'Industrials',mkt:'US'},
    {s:'CTAS',n:'Cintas',sec:'Industrials',mkt:'US'},
    {s:'WELL',n:'Welltower',sec:'Real Estate',mkt:'US'},
    {s:'ECL',n:'Ecolab',sec:'Basic Materials',mkt:'US'},
    {s:'NEE',n:'NextEra Energy',sec:'Utilities',mkt:'US'},
    {s:'MCO',n:"Moody's",sec:'Financial Services',mkt:'US'},
    {s:'ICE',n:'Intercontinental Exchange',sec:'Financial Services',mkt:'US'},
    {s:'WM',n:'Waste Management',sec:'Industrials',mkt:'US'},
    {s:'AON',n:'Aon',sec:'Financial Services',mkt:'US'},
    {s:'SO',n:'Southern Company',sec:'Utilities',mkt:'US'},
    {s:'PNC',n:'PNC Financial',sec:'Financial Services',mkt:'US'},
    {s:'HCA',n:'HCA Healthcare',sec:'Healthcare',mkt:'US'},
    {s:'FCX',n:'Freeport-McMoRan',sec:'Basic Materials',mkt:'US'},
    {s:'ELV',n:'Elevance Health',sec:'Healthcare',mkt:'US'},
    {s:'CRWD',n:'CrowdStrike',sec:'Technology',mkt:'US'},
    {s:'ORLY',n:"O'Reilly Auto",sec:'Consumer Cyclical',mkt:'US'},
    {s:'HUM',n:'Humana',sec:'Healthcare',mkt:'US'},
    {s:'COF',n:'Capital One',sec:'Financial Services',mkt:'US'},
    {s:'EMR',n:'Emerson Electric',sec:'Industrials',mkt:'US'},
    {s:'PSA',n:'Public Storage',sec:'Real Estate',mkt:'US'},
    {s:'MCHP',n:'Microchip Technology',sec:'Technology',mkt:'US'},
    {s:'APD',n:'Air Products',sec:'Basic Materials',mkt:'US'},
    {s:'NSC',n:'Norfolk Southern',sec:'Industrials',mkt:'US'},
    {s:'CSX',n:'CSX Corporation',sec:'Industrials',mkt:'US'},
    {s:'TGT',n:'Target',sec:'Consumer Defensive',mkt:'US'},
    {s:'WDAY',n:'Workday',sec:'Technology',mkt:'US'},
    {s:'PLTR',n:'Palantir',sec:'Technology',mkt:'US'},
    {s:'GD',n:'General Dynamics',sec:'Industrials',mkt:'US'},
    {s:'MPC',n:'Marathon Petroleum',sec:'Energy',mkt:'US'},
    {s:'UBER',n:'Uber',sec:'Technology',mkt:'US'},
    {s:'MCK',n:'McKesson',sec:'Healthcare',mkt:'US'},
    {s:'CARR',n:'Carrier Global',sec:'Industrials',mkt:'US'},
    {s:'ABNB',n:'Airbnb',sec:'Consumer Cyclical',mkt:'US'},
    {s:'KMB',n:'Kimberly-Clark',sec:'Consumer Defensive',mkt:'US'},
    {s:'SPG',n:'Simon Property',sec:'Real Estate',mkt:'US'},
    {s:'CHTR',n:'Charter Communications',sec:'Communication Services',mkt:'US'},
    {s:'PSX',n:'Phillips 66',sec:'Energy',mkt:'US'},
    {s:'VLO',n:'Valero Energy',sec:'Energy',mkt:'US'},
    {s:'MRVL',n:'Marvell Technology',sec:'Technology',mkt:'US'},
    {s:'D',n:'Dominion Energy',sec:'Utilities',mkt:'US'},
    {s:'MSCI',n:'MSCI Inc.',sec:'Financial Services',mkt:'US'},
    {s:'AFL',n:'Aflac',sec:'Financial Services',mkt:'US'},
    {s:'MET',n:'MetLife',sec:'Financial Services',mkt:'US'},
    {s:'F',n:'Ford Motor',sec:'Consumer Cyclical',mkt:'US'},
    {s:'GM',n:'General Motors',sec:'Consumer Cyclical',mkt:'US'},
    {s:'TRGP',n:'Targa Resources',sec:'Energy',mkt:'US'},
    {s:'PCG',n:'PG&E',sec:'Utilities',mkt:'US'},
    {s:'OKE',n:'ONEOK',sec:'Energy',mkt:'US'},
    {s:'LHX',n:'L3Harris Technologies',sec:'Industrials',mkt:'US'},
    {s:'RSG',n:'Republic Services',sec:'Industrials',mkt:'US'},
    {s:'ROST',n:'Ross Stores',sec:'Consumer Cyclical',mkt:'US'},
    {s:'TEAM',n:'Atlassian',sec:'Technology',mkt:'US'},
    {s:'COIN',n:'Coinbase',sec:'Financial Services',mkt:'US'},
    {s:'DDOG',n:'Datadog',sec:'Technology',mkt:'US'},
    {s:'ZS',n:'Zscaler',sec:'Technology',mkt:'US'},
    {s:'TTD',n:'The Trade Desk',sec:'Technology',mkt:'US'},
    {s:'APP',n:'Applovin',sec:'Technology',mkt:'US'},
    {s:'SPOT',n:'Spotify',sec:'Communication Services',mkt:'US'},
    {s:'SQ',n:'Block',sec:'Technology',mkt:'US'},
    {s:'SNOW',n:'Snowflake',sec:'Technology',mkt:'US'},
  ],

  /* ── FTSE MIB 40 ── */
  ftsemib: [
    {s:'ENI.MI',n:'Eni',sec:'Energy',mkt:'IT'},
    {s:'UCG.MI',n:'UniCredit',sec:'Financial Services',mkt:'IT'},
    {s:'ISP.MI',n:'Intesa Sanpaolo',sec:'Financial Services',mkt:'IT'},
    {s:'ENEL.MI',n:'Enel',sec:'Utilities',mkt:'IT'},
    {s:'RACE.MI',n:'Ferrari',sec:'Consumer Cyclical',mkt:'IT'},
    {s:'STM.MI',n:'STMicroelectronics',sec:'Technology',mkt:'IT'},
    {s:'LDO.MI',n:'Leonardo',sec:'Industrials',mkt:'IT'},
    {s:'G.MI',n:'Assicurazioni Generali',sec:'Financial Services',mkt:'IT'},
    {s:'PRY.MI',n:'Prysmian',sec:'Industrials',mkt:'IT'},
    {s:'MONC.MI',n:'Moncler',sec:'Consumer Cyclical',mkt:'IT'},
    {s:'MB.MI',n:'Mediobanca',sec:'Financial Services',mkt:'IT'},
    {s:'CPR.MI',n:'Campari',sec:'Consumer Defensive',mkt:'IT'},
    {s:'BMED.MI',n:'Banca Mediolanum',sec:'Financial Services',mkt:'IT'},
    {s:'BZU.MI',n:'Buzzi',sec:'Basic Materials',mkt:'IT'},
    {s:'ERG.MI',n:'ERG',sec:'Utilities',mkt:'IT'},
    {s:'FCA.MI',n:'Stellantis',sec:'Consumer Cyclical',mkt:'IT'},
    {s:'PIRC.MI',n:'Pirelli',sec:'Consumer Cyclical',mkt:'IT'},
    {s:'BPER.MI',n:'BPER Banca',sec:'Financial Services',mkt:'IT'},
    {s:'AMP.MI',n:'Amplifon',sec:'Healthcare',mkt:'IT'},
    {s:'SRG.MI',n:'Snam',sec:'Utilities',mkt:'IT'},
    {s:'TEN.MI',n:'Tenaris',sec:'Energy',mkt:'IT'},
    {s:'TIT.MI',n:'Telecom Italia',sec:'Communication Services',mkt:'IT'},
    {s:'DIA.MI',n:'DiaSorin',sec:'Healthcare',mkt:'IT'},
    {s:'INWT.MI',n:'Inwit',sec:'Communication Services',mkt:'IT'},
    {s:'TERNA.MI',n:'Terna',sec:'Utilities',mkt:'IT'},
    {s:'A2A.MI',n:'A2A',sec:'Utilities',mkt:'IT'},
    {s:'IG.MI',n:'Italgas',sec:'Utilities',mkt:'IT'},
    {s:'RE.MI',n:'Recordati',sec:'Healthcare',mkt:'IT'},
    {s:'FBK.MI',n:'FinecoBank',sec:'Financial Services',mkt:'IT'},
    {s:'PST.MI',n:'Poste Italiane',sec:'Financial Services',mkt:'IT'},
    {s:'SPM.MI',n:'Saipem',sec:'Energy',mkt:'IT'},
    {s:'EXO.MI',n:'Exor',sec:'Financial Services',mkt:'IT'},
    {s:'CNH.MI',n:'CNH Industrial',sec:'Industrials',mkt:'IT'},
    {s:'IP.MI',n:'International Paper',sec:'Basic Materials',mkt:'IT'},
    {s:'NEXI.MI',n:'Nexi',sec:'Technology',mkt:'IT'},
    {s:'BMPS.MI',n:'Monte dei Paschi',sec:'Financial Services',mkt:'IT'},
    {s:'REC.MI',n:'Recordati',sec:'Healthcare',mkt:'IT'},
    {s:'AKZA.MI',n:'Akzo Nobel',sec:'Basic Materials',mkt:'IT'},
    {s:'HERA.MI',n:'Hera',sec:'Utilities',mkt:'IT'},
    {s:'MFB.MI',n:'Mediobanca',sec:'Financial Services',mkt:'IT'},
  ],

  /* ── DAX 40 ── */
  dax: [
    {s:'SAP.DE',n:'SAP',sec:'Technology',mkt:'EU'},
    {s:'SIE.DE',n:'Siemens',sec:'Industrials',mkt:'EU'},
    {s:'DTE.DE',n:'Deutsche Telekom',sec:'Communication Services',mkt:'EU'},
    {s:'ALV.DE',n:'Allianz',sec:'Financial Services',mkt:'EU'},
    {s:'MUV2.DE',n:'Munich Re',sec:'Financial Services',mkt:'EU'},
    {s:'RWE.DE',n:'RWE',sec:'Utilities',mkt:'EU'},
    {s:'MBG.DE',n:'Mercedes-Benz',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'BMW.DE',n:'BMW',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'VOW3.DE',n:'Volkswagen',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'BAS.DE',n:'BASF',sec:'Basic Materials',mkt:'EU'},
    {s:'BAYN.DE',n:'Bayer',sec:'Healthcare',mkt:'EU'},
    {s:'DBK.DE',n:'Deutsche Bank',sec:'Financial Services',mkt:'EU'},
    {s:'ADS.DE',n:'Adidas',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'IFX.DE',n:'Infineon',sec:'Technology',mkt:'EU'},
    {s:'BEI.DE',n:'Beiersdorf',sec:'Consumer Defensive',mkt:'EU'},
    {s:'CON.DE',n:'Continental',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'DAI.DE',n:'Daimler Truck',sec:'Industrials',mkt:'EU'},
    {s:'HEN3.DE',n:'Henkel',sec:'Consumer Defensive',mkt:'EU'},
    {s:'HNR1.DE',n:'Hannover Rück',sec:'Financial Services',mkt:'EU'},
    {s:'FRE.DE',n:'Fresenius',sec:'Healthcare',mkt:'EU'},
    {s:'FME.DE',n:'Fresenius Medical Care',sec:'Healthcare',mkt:'EU'},
    {s:'QIA.DE',n:'Qiagen',sec:'Healthcare',mkt:'EU'},
    {s:'DPW.DE',n:'Deutsche Post DHL',sec:'Industrials',mkt:'EU'},
    {s:'MTX.DE',n:'MTU Aero Engines',sec:'Industrials',mkt:'EU'},
    {s:'MRK.DE',n:'Merck KGaA',sec:'Healthcare',mkt:'EU'},
    {s:'SHL.DE',n:'Siemens Healthineers',sec:'Healthcare',mkt:'EU'},
    {s:'SY1.DE',n:'Symrise',sec:'Basic Materials',mkt:'EU'},
    {s:'AIR.DE',n:'Airbus',sec:'Industrials',mkt:'EU'},
    {s:'ENR.DE',n:'Siemens Energy',sec:'Industrials',mkt:'EU'},
    {s:'VNA.DE',n:'Vonovia',sec:'Real Estate',mkt:'EU'},
    {s:'ZAL.DE',n:'Zalando',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'P911.DE',n:'Porsche AG',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'PAH3.DE',n:'Porsche Automobil',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'HEI.DE',n:'HeidelbergMaterials',sec:'Basic Materials',mkt:'EU'},
    {s:'DB1.DE',n:'Deutsche Börse',sec:'Financial Services',mkt:'EU'},
    {s:'EOAN.DE',n:'E.ON',sec:'Utilities',mkt:'EU'},
    {s:'SHL.DE',n:'Siemens Healthineers',sec:'Healthcare',mkt:'EU'},
    {s:'PUM.DE',n:'Puma',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'RHM.DE',n:'Rheinmetall',sec:'Industrials',mkt:'EU'},
    {s:'CBK.DE',n:'Commerzbank',sec:'Financial Services',mkt:'EU'},
  ],

  /* ── CAC 40 ── */
  cac40: [
    {s:'MC.PA',n:'LVMH',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'TTE.PA',n:'TotalEnergies',sec:'Energy',mkt:'EU'},
    {s:'AIR.PA',n:'Airbus',sec:'Industrials',mkt:'EU'},
    {s:'BNP.PA',n:'BNP Paribas',sec:'Financial Services',mkt:'EU'},
    {s:'SAN.PA',n:'Sanofi',sec:'Healthcare',mkt:'EU'},
    {s:'OR.PA',n:"L'Oréal",sec:'Consumer Defensive',mkt:'EU'},
    {s:'KER.PA',n:'Kering',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'RI.PA',n:'Pernod Ricard',sec:'Consumer Defensive',mkt:'EU'},
    {s:'ACA.PA',n:'Crédit Agricole',sec:'Financial Services',mkt:'EU'},
    {s:'GLE.PA',n:'Société Générale',sec:'Financial Services',mkt:'EU'},
    {s:'CAP.PA',n:'Capgemini',sec:'Technology',mkt:'EU'},
    {s:'DSY.PA',n:'Dassault Systèmes',sec:'Technology',mkt:'EU'},
    {s:'EL.PA',n:'EssilorLuxottica',sec:'Healthcare',mkt:'EU'},
    {s:'SGO.PA',n:'Saint-Gobain',sec:'Basic Materials',mkt:'EU'},
    {s:'VIE.PA',n:'Veolia',sec:'Utilities',mkt:'EU'},
    {s:'VIV.PA',n:'Vivendi',sec:'Communication Services',mkt:'EU'},
    {s:'EN.PA',n:'Bouygues',sec:'Industrials',mkt:'EU'},
    {s:'ML.PA',n:'Michelin',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'PUB.PA',n:'Publicis',sec:'Communication Services',mkt:'EU'},
    {s:'RMS.PA',n:'Hermès',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'FP.PA',n:'TotalEnergies ADR',sec:'Energy',mkt:'EU'},
    {s:'ERF.PA',n:'Eurofins Scientific',sec:'Healthcare',mkt:'EU'},
    {s:'ATO.PA',n:'Atos',sec:'Technology',mkt:'EU'},
    {s:'SU.PA',n:'Schneider Electric',sec:'Industrials',mkt:'EU'},
    {s:'CS.PA',n:'AXA',sec:'Financial Services',mkt:'EU'},
    {s:'WLN.PA',n:'Worldline',sec:'Technology',mkt:'EU'},
    {s:'ORA.PA',n:'Orange',sec:'Communication Services',mkt:'EU'},
    {s:'SAF.PA',n:'Safran',sec:'Industrials',mkt:'EU'},
    {s:'LR.PA',n:'Legrand',sec:'Industrials',mkt:'EU'},
    {s:'AI.PA',n:'Air Liquide',sec:'Basic Materials',mkt:'EU'},
    {s:'RNO.PA',n:'Renault',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'DG.PA',n:'Vinci',sec:'Industrials',mkt:'EU'},
    {s:'URW.PA',n:'Unibail-Rodamco',sec:'Real Estate',mkt:'EU'},
    {s:'ALO.PA',n:'Alstom',sec:'Industrials',mkt:'EU'},
    {s:'SW.PA',n:'Sodexo',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'HO.PA',n:'Thales',sec:'Industrials',mkt:'EU'},
    {s:'STM.PA',n:'STMicroelectronics',sec:'Technology',mkt:'EU'},
    {s:'BVI.PA',n:'Bureau Veritas',sec:'Industrials',mkt:'EU'},
    {s:'OPM.PA',n:'Opella Healthcare',sec:'Healthcare',mkt:'EU'},
    {s:'ENGI.PA',n:'Engie',sec:'Utilities',mkt:'EU'},
  ],

  /* ── FTSE 100 top 50 ── */
  ftse100: [
    {s:'SHEL.L',n:'Shell',sec:'Energy',mkt:'EU'},
    {s:'AZN.L',n:'AstraZeneca',sec:'Healthcare',mkt:'EU'},
    {s:'HSBA.L',n:'HSBC',sec:'Financial Services',mkt:'EU'},
    {s:'ULVR.L',n:'Unilever',sec:'Consumer Defensive',mkt:'EU'},
    {s:'BP.L',n:'BP',sec:'Energy',mkt:'EU'},
    {s:'RIO.L',n:'Rio Tinto',sec:'Basic Materials',mkt:'EU'},
    {s:'GSK.L',n:'GSK',sec:'Healthcare',mkt:'EU'},
    {s:'BATS.L',n:'British American Tobacco',sec:'Consumer Defensive',mkt:'EU'},
    {s:'REL.L',n:'RELX',sec:'Industrials',mkt:'EU'},
    {s:'DGE.L',n:'Diageo',sec:'Consumer Defensive',mkt:'EU'},
    {s:'NG.L',n:'National Grid',sec:'Utilities',mkt:'EU'},
    {s:'BHP.L',n:'BHP Group',sec:'Basic Materials',mkt:'EU'},
    {s:'GLEN.L',n:'Glencore',sec:'Basic Materials',mkt:'EU'},
    {s:'RB.L',n:'Reckitt Benckiser',sec:'Consumer Defensive',mkt:'EU'},
    {s:'LSEG.L',n:'London Stock Exchange',sec:'Financial Services',mkt:'EU'},
    {s:'BA.L',n:'BAE Systems',sec:'Industrials',mkt:'EU'},
    {s:'LLOY.L',n:'Lloyds Banking',sec:'Financial Services',mkt:'EU'},
    {s:'BARC.L',n:'Barclays',sec:'Financial Services',mkt:'EU'},
    {s:'ABF.L',n:'Associated British Foods',sec:'Consumer Defensive',mkt:'EU'},
    {s:'PRU.L',n:'Prudential',sec:'Financial Services',mkt:'EU'},
    {s:'WPP.L',n:'WPP',sec:'Communication Services',mkt:'EU'},
    {s:'TSCO.L',n:'Tesco',sec:'Consumer Defensive',mkt:'EU'},
    {s:'IMB.L',n:'Imperial Brands',sec:'Consumer Defensive',mkt:'EU'},
    {s:'NWG.L',n:'NatWest Group',sec:'Financial Services',mkt:'EU'},
    {s:'CRH.L',n:'CRH',sec:'Basic Materials',mkt:'EU'},
    {s:'EXPN.L',n:'Experian',sec:'Industrials',mkt:'EU'},
    {s:'JD.L',n:'JD Sports',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'VOD.L',n:'Vodafone',sec:'Communication Services',mkt:'EU'},
    {s:'MNDI.L',n:'Mondi',sec:'Basic Materials',mkt:'EU'},
    {s:'SSE.L',n:'SSE',sec:'Utilities',mkt:'EU'},
    {s:'CNA.L',n:'Centrica',sec:'Utilities',mkt:'EU'},
    {s:'ADM.L',n:'Admiral Group',sec:'Financial Services',mkt:'EU'},
    {s:'SBRY.L',n:'Sainsbury',sec:'Consumer Defensive',mkt:'EU'},
    {s:'SN.L',n:'Smith & Nephew',sec:'Healthcare',mkt:'EU'},
    {s:'STJ.L',n:'St. James Place',sec:'Financial Services',mkt:'EU'},
    {s:'FRES.L',n:'Fresnillo',sec:'Basic Materials',mkt:'EU'},
    {s:'LAND.L',n:'Land Securities',sec:'Real Estate',mkt:'EU'},
    {s:'PSN.L',n:'Persimmon',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'SGE.L',n:'Sage Group',sec:'Technology',mkt:'EU'},
    {s:'CPG.L',n:'Compass Group',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'SMDS.L',n:'DS Smith',sec:'Basic Materials',mkt:'EU'},
    {s:'INF.L',n:'Informa',sec:'Communication Services',mkt:'EU'},
    {s:'RKT.L',n:'Reckitt',sec:'Consumer Defensive',mkt:'EU'},
    {s:'KGF.L',n:'Kingfisher',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'SVT.L',n:'Severn Trent',sec:'Utilities',mkt:'EU'},
    {s:'OCDO.L',n:'Ocado',sec:'Consumer Defensive',mkt:'EU'},
    {s:'UU.L',n:'United Utilities',sec:'Utilities',mkt:'EU'},
    {s:'BWY.L',n:'Bellway',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'III.L',n:'3i Group',sec:'Financial Services',mkt:'EU'},
    {s:'HWDN.L',n:'Howden Joinery',sec:'Consumer Cyclical',mkt:'EU'},
  ],

  /* ── EURO STOXX 50 ── */
  eurostoxx50: [
    {s:'ASML',n:'ASML',sec:'Technology',mkt:'EU'},
    {s:'SAP.DE',n:'SAP',sec:'Technology',mkt:'EU'},
    {s:'MC.PA',n:'LVMH',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'SIE.DE',n:'Siemens',sec:'Industrials',mkt:'EU'},
    {s:'TTE.PA',n:'TotalEnergies',sec:'Energy',mkt:'EU'},
    {s:'ALV.DE',n:'Allianz',sec:'Financial Services',mkt:'EU'},
    {s:'SAN.PA',n:'Sanofi',sec:'Healthcare',mkt:'EU'},
    {s:'AIR.PA',n:'Airbus',sec:'Industrials',mkt:'EU'},
    {s:'BNP.PA',n:'BNP Paribas',sec:'Financial Services',mkt:'EU'},
    {s:'RACE.MI',n:'Ferrari',sec:'Consumer Cyclical',mkt:'IT'},
    {s:'SU.PA',n:'Schneider Electric',sec:'Industrials',mkt:'EU'},
    {s:'OR.PA',n:"L'Oréal",sec:'Consumer Defensive',mkt:'EU'},
    {s:'EL.PA',n:'EssilorLuxottica',sec:'Healthcare',mkt:'EU'},
    {s:'RMS.PA',n:'Hermès',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'DTE.DE',n:'Deutsche Telekom',sec:'Communication Services',mkt:'EU'},
    {s:'MUV2.DE',n:'Munich Re',sec:'Financial Services',mkt:'EU'},
    {s:'SAF.PA',n:'Safran',sec:'Industrials',mkt:'EU'},
    {s:'AI.PA',n:'Air Liquide',sec:'Basic Materials',mkt:'EU'},
    {s:'SAN',n:'Santander',sec:'Financial Services',mkt:'EU'},
    {s:'IBE.MC',n:'Iberdrola',sec:'Utilities',mkt:'EU'},
    {s:'ITX.MC',n:'Inditex',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'IFX.DE',n:'Infineon',sec:'Technology',mkt:'EU'},
    {s:'MBG.DE',n:'Mercedes-Benz',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'CS.PA',n:'AXA',sec:'Financial Services',mkt:'EU'},
    {s:'UCG.MI',n:'UniCredit',sec:'Financial Services',mkt:'IT'},
    {s:'ENI.MI',n:'Eni',sec:'Energy',mkt:'IT'},
    {s:'ACA.PA',n:'Crédit Agricole',sec:'Financial Services',mkt:'EU'},
    {s:'DPW.DE',n:'Deutsche Post DHL',sec:'Industrials',mkt:'EU'},
    {s:'MRK.DE',n:'Merck KGaA',sec:'Healthcare',mkt:'EU'},
    {s:'BAYN.DE',n:'Bayer',sec:'Healthcare',mkt:'EU'},
    {s:'BMW.DE',n:'BMW',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'ENEL.MI',n:'Enel',sec:'Utilities',mkt:'IT'},
    {s:'NOKIA.HE',n:'Nokia',sec:'Technology',mkt:'EU'},
    {s:'PRY.MI',n:'Prysmian',sec:'Industrials',mkt:'IT'},
    {s:'DBK.DE',n:'Deutsche Bank',sec:'Financial Services',mkt:'EU'},
    {s:'GLE.PA',n:'Société Générale',sec:'Financial Services',mkt:'EU'},
    {s:'ML.PA',n:'Michelin',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'STMPA.PA',n:'STMicroelectronics',sec:'Technology',mkt:'EU'},
    {s:'RWE.DE',n:'RWE',sec:'Utilities',mkt:'EU'},
    {s:'AMS.AS',n:'Amsterdam Exchange',sec:'Technology',mkt:'EU'},
    {s:'ADYEN.AS',n:'Adyen',sec:'Technology',mkt:'EU'},
    {s:'NN.AS',n:'NN Group',sec:'Financial Services',mkt:'EU'},
    {s:'AD.AS',n:'Ahold Delhaize',sec:'Consumer Defensive',mkt:'EU'},
    {s:'PHIA.AS',n:'Philips',sec:'Healthcare',mkt:'EU'},
    {s:'VIV.PA',n:'Vivendi',sec:'Communication Services',mkt:'EU'},
    {s:'DSY.PA',n:'Dassault Systèmes',sec:'Technology',mkt:'EU'},
    {s:'CAP.PA',n:'Capgemini',sec:'Technology',mkt:'EU'},
    {s:'ENGI.PA',n:'Engie',sec:'Utilities',mkt:'EU'},
    {s:'KER.PA',n:'Kering',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'VOW3.DE',n:'Volkswagen',sec:'Consumer Cyclical',mkt:'EU'},
  ],

  /* ── IBEX 35 ── */
  ibex35: [
    {s:'ITX.MC',n:'Inditex',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'IBE.MC',n:'Iberdrola',sec:'Utilities',mkt:'EU'},
    {s:'SAN.MC',n:'Santander',sec:'Financial Services',mkt:'EU'},
    {s:'TEF.MC',n:'Telefónica',sec:'Communication Services',mkt:'EU'},
    {s:'BBVA.MC',n:'BBVA',sec:'Financial Services',mkt:'EU'},
    {s:'REP.MC',n:'Repsol',sec:'Energy',mkt:'EU'},
    {s:'CABK.MC',n:'CaixaBank',sec:'Financial Services',mkt:'EU'},
    {s:'ACS.MC',n:'ACS',sec:'Industrials',mkt:'EU'},
    {s:'MAP.MC',n:'MAPFRE',sec:'Financial Services',mkt:'EU'},
    {s:'IAG.MC',n:'IAG (Iberia/BA)',sec:'Industrials',mkt:'EU'},
    {s:'ACX.MC',n:'Acerinox',sec:'Basic Materials',mkt:'EU'},
    {s:'ENG.MC',n:'Enagás',sec:'Utilities',mkt:'EU'},
    {s:'ELE.MC',n:'Endesa',sec:'Utilities',mkt:'EU'},
    {s:'GRF.MC',n:'Grifols',sec:'Healthcare',mkt:'EU'},
    {s:'BKT.MC',n:'Bankinter',sec:'Financial Services',mkt:'EU'},
    {s:'COL.MC',n:'Inmobiliaria Colonial',sec:'Real Estate',mkt:'EU'},
    {s:'VIS.MC',n:'Viscofan',sec:'Consumer Defensive',mkt:'EU'},
    {s:'NHH.MC',n:'NH Hotel Group',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'MEL.MC',n:'Meliá Hotels',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'SAB.MC',n:'Banco Sabadell',sec:'Financial Services',mkt:'EU'},
    {s:'FER.MC',n:'Ferrovial',sec:'Industrials',mkt:'EU'},
    {s:'MTS.MC',n:'ArcelorMittal',sec:'Basic Materials',mkt:'EU'},
    {s:'RED.MC',n:'Redeia',sec:'Utilities',mkt:'EU'},
    {s:'CLNX.MC',n:'Cellnex Telecom',sec:'Communication Services',mkt:'EU'},
    {s:'AENA.MC',n:'Aena',sec:'Industrials',mkt:'EU'},
    {s:'ANA.MC',n:'Acciona',sec:'Utilities',mkt:'EU'},
    {s:'CIE.MC',n:'CIE Automotive',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'PHM.MC',n:'Pharma Mar',sec:'Healthcare',mkt:'EU'},
    {s:'SOL.MC',n:'Solaria',sec:'Utilities',mkt:'EU'},
    {s:'LOG.MC',n:'Logista',sec:'Industrials',mkt:'EU'},
    {s:'INM.MC',n:'Indra Sistemas',sec:'Technology',mkt:'EU'},
    {s:'MRL.MC',n:'Merlin Properties',sec:'Real Estate',mkt:'EU'},
    {s:'SGRE.MC',n:'Siemens Gamesa',sec:'Industrials',mkt:'EU'},
    {s:'CAF.MC',n:'CAF',sec:'Industrials',mkt:'EU'},
    {s:'NTGY.MC',n:'Naturgy',sec:'Utilities',mkt:'EU'},
  ],

  /* ── SMI 20 ── */
  smi: [
    {s:'NESN.SW',n:'Nestlé',sec:'Consumer Defensive',mkt:'EU'},
    {s:'ROG.SW',n:'Roche',sec:'Healthcare',mkt:'EU'},
    {s:'NOVN.SW',n:'Novartis',sec:'Healthcare',mkt:'EU'},
    {s:'ABBN.SW',n:'ABB',sec:'Industrials',mkt:'EU'},
    {s:'UBSG.SW',n:'UBS',sec:'Financial Services',mkt:'EU'},
    {s:'SIKA.SW',n:'Sika',sec:'Basic Materials',mkt:'EU'},
    {s:'GIVN.SW',n:'Givaudan',sec:'Basic Materials',mkt:'EU'},
    {s:'CFR.SW',n:'Richemont',sec:'Consumer Cyclical',mkt:'EU'},
    {s:'LONN.SW',n:'Lonza',sec:'Healthcare',mkt:'EU'},
    {s:'SRENH.SW',n:'Swiss Re',sec:'Financial Services',mkt:'EU'},
    {s:'ZURN.SW',n:'Zurich Insurance',sec:'Financial Services',mkt:'EU'},
    {s:'SLHN.SW',n:'Swiss Life',sec:'Financial Services',mkt:'EU'},
    {s:'SCMN.SW',n:'Swisscom',sec:'Communication Services',mkt:'EU'},
    {s:'CSGN.SW',n:'Credit Suisse',sec:'Financial Services',mkt:'EU'},
    {s:'LOGN.SW',n:'Logitech',sec:'Technology',mkt:'EU'},
    {s:'STMN.SW',n:'Straumann',sec:'Healthcare',mkt:'EU'},
    {s:'GEBN.SW',n:'Geberit',sec:'Industrials',mkt:'EU'},
    {s:'PGHN.SW',n:'Partners Group',sec:'Financial Services',mkt:'EU'},
    {s:'BALN.SW',n:'Baloise',sec:'Financial Services',mkt:'EU'},
    {s:'VACN.SW',n:'VAT Group',sec:'Industrials',mkt:'EU'},
  ],

  /* ── NIKKEI 225 (top 50) ── */
  nikkei225: [
    {s:'7203.T',n:'Toyota Motor',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'6758.T',n:'Sony Group',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'9984.T',n:'SoftBank Group',sec:'Technology',mkt:'AS'},
    {s:'7267.T',n:'Honda Motor',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'9432.T',n:'NTT',sec:'Communication Services',mkt:'AS'},
    {s:'6501.T',n:'Hitachi',sec:'Industrials',mkt:'AS'},
    {s:'8306.T',n:'Mitsubishi UFJ',sec:'Financial Services',mkt:'AS'},
    {s:'4063.T',n:'Shin-Etsu Chemical',sec:'Basic Materials',mkt:'AS'},
    {s:'6861.T',n:'Keyence',sec:'Technology',mkt:'AS'},
    {s:'7974.T',n:'Nintendo',sec:'Communication Services',mkt:'AS'},
    {s:'4661.T',n:'Oriental Land',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'9983.T',n:'Fast Retailing',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'8058.T',n:'Mitsubishi Corp',sec:'Industrials',mkt:'AS'},
    {s:'8001.T',n:'Itochu',sec:'Industrials',mkt:'AS'},
    {s:'8031.T',n:'Mitsui & Co',sec:'Industrials',mkt:'AS'},
    {s:'6902.T',n:'Denso',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'6954.T',n:'Fanuc',sec:'Technology',mkt:'AS'},
    {s:'4543.T',n:'Terumo',sec:'Healthcare',mkt:'AS'},
    {s:'7751.T',n:'Canon',sec:'Technology',mkt:'AS'},
    {s:'6098.T',n:'Recruit Holdings',sec:'Industrials',mkt:'AS'},
    {s:'3382.T',n:'Seven & i Holdings',sec:'Consumer Defensive',mkt:'AS'},
    {s:'4519.T',n:'Chugai Pharmaceutical',sec:'Healthcare',mkt:'AS'},
    {s:'8802.T',n:'Mitsubishi Estate',sec:'Real Estate',mkt:'AS'},
    {s:'9022.T',n:'Central Japan Railway',sec:'Industrials',mkt:'AS'},
    {s:'4502.T',n:'Takeda Pharmaceutical',sec:'Healthcare',mkt:'AS'},
    {s:'5108.T',n:'Bridgestone',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'8316.T',n:'Sumitomo Mitsui',sec:'Financial Services',mkt:'AS'},
    {s:'6367.T',n:'Daikin Industries',sec:'Industrials',mkt:'AS'},
    {s:'7741.T',n:'Hoya',sec:'Healthcare',mkt:'AS'},
    {s:'4568.T',n:'Daiichi Sankyo',sec:'Healthcare',mkt:'AS'},
    {s:'9433.T',n:'KDDI',sec:'Communication Services',mkt:'AS'},
    {s:'6645.T',n:'Omron',sec:'Technology',mkt:'AS'},
    {s:'9613.T',n:'NTT Data',sec:'Technology',mkt:'AS'},
    {s:'2802.T',n:'Ajinomoto',sec:'Consumer Defensive',mkt:'AS'},
    {s:'4507.T',n:'Shionogi',sec:'Healthcare',mkt:'AS'},
    {s:'8035.T',n:'Tokyo Electron',sec:'Technology',mkt:'AS'},
    {s:'9434.T',n:'SoftBank Corp',sec:'Communication Services',mkt:'AS'},
    {s:'8766.T',n:'Tokio Marine',sec:'Financial Services',mkt:'AS'},
    {s:'4911.T',n:'Shiseido',sec:'Consumer Defensive',mkt:'AS'},
    {s:'7269.T',n:'Suzuki Motor',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'2914.T',n:'Japan Tobacco',sec:'Consumer Defensive',mkt:'AS'},
    {s:'7733.T',n:'Olympus',sec:'Healthcare',mkt:'AS'},
    {s:'6952.T',n:'Casio Computer',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'4704.T',n:'Trend Micro',sec:'Technology',mkt:'AS'},
    {s:'9005.T',n:'Tokyu Corp',sec:'Industrials',mkt:'AS'},
    {s:'5020.T',n:'ENEOS Holdings',sec:'Energy',mkt:'AS'},
    {s:'7832.T',n:'Bandai Namco',sec:'Consumer Cyclical',mkt:'AS'},
    {s:'4151.T',n:'Kyowa Kirin',sec:'Healthcare',mkt:'AS'},
    {s:'6762.T',n:'TDK Corporation',sec:'Technology',mkt:'AS'},
    {s:'4452.T',n:'Kao Corporation',sec:'Consumer Defensive',mkt:'AS'},
  ],

  /* ── TSX (top 40 Canada) ── */
  tsx: [
    {s:'RY.TO',n:'Royal Bank of Canada',sec:'Financial Services',mkt:'CA'},
    {s:'TD.TO',n:'TD Bank',sec:'Financial Services',mkt:'CA'},
    {s:'ENB.TO',n:'Enbridge',sec:'Energy',mkt:'CA'},
    {s:'CNQ.TO',n:'Canadian Natural Resources',sec:'Energy',mkt:'CA'},
    {s:'BNS.TO',n:'Scotiabank',sec:'Financial Services',mkt:'CA'},
    {s:'BMO.TO',n:'Bank of Montreal',sec:'Financial Services',mkt:'CA'},
    {s:'SU.TO',n:'Suncor Energy',sec:'Energy',mkt:'CA'},
    {s:'CNR.TO',n:'Canadian National Railway',sec:'Industrials',mkt:'CA'},
    {s:'CP.TO',n:'Canadian Pacific',sec:'Industrials',mkt:'CA'},
    {s:'MFC.TO',n:'Manulife Financial',sec:'Financial Services',mkt:'CA'},
    {s:'TRP.TO',n:'TC Energy',sec:'Energy',mkt:'CA'},
    {s:'BCE.TO',n:'BCE Inc.',sec:'Communication Services',mkt:'CA'},
    {s:'T.TO',n:'TELUS',sec:'Communication Services',mkt:'CA'},
    {s:'SLF.TO',n:'Sun Life Financial',sec:'Financial Services',mkt:'CA'},
    {s:'ABX.TO',n:'Barrick Gold',sec:'Basic Materials',mkt:'CA'},
    {s:'IMO.TO',n:'Imperial Oil',sec:'Energy',mkt:'CA'},
    {s:'AGI.TO',n:'Alamos Gold',sec:'Basic Materials',mkt:'CA'},
    {s:'K.TO',n:'Kinross Gold',sec:'Basic Materials',mkt:'CA'},
    {s:'WPM.TO',n:'Wheaton Precious Metals',sec:'Basic Materials',mkt:'CA'},
    {s:'G.TO',n:'Iamgold',sec:'Basic Materials',mkt:'CA'},
    {s:'FM.TO',n:'First Quantum',sec:'Basic Materials',mkt:'CA'},
    {s:'TRI.TO',n:'Thomson Reuters',sec:'Industrials',mkt:'CA'},
    {s:'ATD.TO',n:'Alimentation Couche-Tard',sec:'Consumer Defensive',mkt:'CA'},
    {s:'WCN.TO',n:'Waste Connections',sec:'Industrials',mkt:'CA'},
    {s:'AEM.TO',n:'Agnico Eagle Mines',sec:'Basic Materials',mkt:'CA'},
    {s:'SHOP.TO',n:'Shopify',sec:'Technology',mkt:'CA'},
    {s:'BAM.TO',n:'Brookfield Asset Mgmt',sec:'Financial Services',mkt:'CA'},
    {s:'CM.TO',n:'CIBC',sec:'Financial Services',mkt:'CA'},
    {s:'NA.TO',n:'National Bank',sec:'Financial Services',mkt:'CA'},
    {s:'QBR-B.TO',n:'Quebecor',sec:'Communication Services',mkt:'CA'},
    {s:'L.TO',n:'Loblaw Companies',sec:'Consumer Defensive',mkt:'CA'},
    {s:'MRU.TO',n:'Metro Inc.',sec:'Consumer Defensive',mkt:'CA'},
    {s:'EMP-A.TO',n:'Empire Company',sec:'Consumer Defensive',mkt:'CA'},
    {s:'POW.TO',n:'Power Corporation',sec:'Financial Services',mkt:'CA'},
    {s:'FTS.TO',n:'Fortis',sec:'Utilities',mkt:'CA'},
    {s:'H.TO',n:'Hydro One',sec:'Utilities',mkt:'CA'},
    {s:'PPL.TO',n:'Pembina Pipeline',sec:'Energy',mkt:'CA'},
    {s:'CCO.TO',n:'Cameco',sec:'Energy',mkt:'CA'},
    {s:'GIB-A.TO',n:'CGI Group',sec:'Technology',mkt:'CA'},
    {s:'SNC.TO',n:'SNC-Lavalin',sec:'Industrials',mkt:'CA'},
  ],
};

/* ─────────────────────────────────────────────────────────
   BULK QUOTE via Yahoo Finance (gratuito, no key)
   ───────────────────────────────────────────────────────── */
const _timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

function _quoteToRow(q) {
  return {
    price:     q.regularMarketPrice            ?? null,
    prev:      q.regularMarketPreviousClose    ?? null,
    chg:       q.regularMarketChangePercent    ?? null,
    pe:        q.trailingPE                    ?? null,
    marketCap: q.marketCap                     ?? null,
    volume:    q.regularMarketVolume           ?? null,
    divAnnual: q.trailingAnnualDividendRate    ?? null,
  };
}

async function fetchChunk(chunk) {
  // Prima prova: batch (più veloce)
  try {
    const results = await Promise.race([
      yf.quote(chunk, {}, { validateResult: false }),
      _timeout(6000),
    ]);
    const arr = Array.isArray(results) ? results : [results];
    const m = {};
    arr.forEach(q => {
      if (!q?.symbol) return;
      m[q.symbol] = _quoteToRow(q);
    });
    // Se il batch ha restituito tutti i simboli richiesti, ottimo
    if (Object.keys(m).length > 0) return m;
  } catch { /* batch fallito, passa al fallback */ }

  // Fallback: richieste individuali (più lento ma resistente a errori di validazione)
  const m = {};
  await Promise.all(chunk.map(async sym => {
    try {
      const q = await Promise.race([
        yf.quote(sym, {}, { validateResult: false }),
        _timeout(4000),
      ]);
      if (q?.regularMarketPrice != null) m[q.symbol || sym] = _quoteToRow(q);
    } catch { /* simbolo non trovato, lascia null */ }
  }));
  return m;
}

async function yahooQuote(symbols) {
  const CHUNK = 10;
  const CONCURRENCY = 3; // max 3 richieste parallele per evitare rate limit
  const chunks = [];
  for (let i = 0; i < symbols.length; i += CHUNK) chunks.push(symbols.slice(i, i + CHUNK));

  const result = {};
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const maps = await Promise.all(batch.map(fetchChunk));
    maps.forEach(m => Object.assign(result, m));
  }
  return result;
}

/* ─────────────────────────────────────────────────────────
   HANDLER PRINCIPALE
   ───────────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { q, symbols, index } = req.query;

  try {
    // ── AUTOCOMPLETE ──────────────────────────────────────────────────────────
    if (q !== undefined) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      if (!q.trim()) return res.json({ quotes: [] });

      const url = `https://query1.finance.yahoo.com/v1/finance/search`
        + `?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      if (!r.ok) throw new Error(`Yahoo search error: ${r.status}`);
      const data = await r.json();

      const quotes = (data?.quotes || [])
        .filter(item => ['EQUITY', 'ETF'].includes(item.quoteType))
        .slice(0, 9)
        .map(item => ({
          symbol:   item.symbol,
          name:     item.shortname || item.longname || item.symbol,
          exchange: item.exchDisp  || item.exchange || '',
          type:     item.quoteType,
        }));

      return res.json({ quotes });
    }

    // ── BULK QUOTE ────────────────────────────────────────────────────────────
    if (symbols) {
      res.setHeader('Cache-Control', 'no-store');
      const symList = symbols.split(',').filter(Boolean);
      const qMap = await yahooQuote(symList);

      const quotes = symList.map(s => ({
        s,
        ...(qMap[s] || { price: null, prev: null, chg: null, pe: null, marketCap: null }),
      }));

      return res.json({ quotes });
    }

    // ── INDICE SPECIFICO ──────────────────────────────────────────────────────
    // Restituisce solo la lista statica — i prezzi vengono caricati dal frontend
    // a chunk via /api/screener?symbols=... per evitare timeout Vercel
    if (index && index !== 'all') {
      res.setHeader('Cache-Control', 'no-store');

      const constituents = INDEX_DATA[index];
      if (!constituents) return res.status(400).json({ error: 'Indice non supportato: ' + index });

      return res.json({ stocks: constituents, total: constituents.length, source: 'static', index });
    }

    // ── TUTTI (screener generico) ─────────────────────────────────────────────
    // Senza FMP, restituiamo la lista completa di tutti gli indici unificata
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    const allStocks = [];
    const seen = new Set();
    for (const list of Object.values(INDEX_DATA)) {
      for (const s of list) {
        if (!seen.has(s.s)) { seen.add(s.s); allStocks.push(s); }
      }
    }

    // Applica filtri query string
    const { sector, country } = req.query;
    let filtered = allStocks;
    if (sector && sector !== 'all') filtered = filtered.filter(s => s.sec === sector);
    if (country) {
      const mktMap = { US:'US', IT:'IT', EU:'EU', AS:'AS', CA:'CA' };
      filtered = filtered.filter(s => s.mkt === mktMap[country] || s.country === country);
    }

    // Restituisce la lista statica senza prezzi — il frontend li carica in batch via ?symbols=
    const stocks = filtered.map(s => ({ ...s, price: null, prev: null, chg: null, pe: null, marketCap: null, divAnnual: null }));
    return res.json({ stocks, total: stocks.length, source: 'static' });

  } catch (e) {
    console.error('[screener]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
