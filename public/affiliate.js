/**
 * affiliate.js — FinEdge Affiliate Infrastructure
 * Includi questo script nelle pagine che contengono link affiliati.
 *
 * Uso:
 *   <script src="/affiliate.js"></script>
 *
 *   <a href="https://partner.com?ref=finedge"
 *      class="partner-button"
 *      rel="sponsored noopener noreferrer"
 *      data-partner="freedom24"
 *      data-campaign="conto-titoli">Apri conto</a>
 *
 * API globale:
 *   FinEdgeAffiliate.createAffiliateLink(baseUrl, campaign, extraParams)
 *   FinEdgeAffiliate.trackAffiliateClick(partner, campaign, url)
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configurazione
  // ---------------------------------------------------------------------------
  var CONFIG = {
    utmSource: 'finedge',
    utmMedium: 'affiliate',
    trackingEndpoint: null, // es. '/api/track-click' — lasciare null per disabilitare
    debug: false,
  };

  // ---------------------------------------------------------------------------
  // Iniezione CSS
  // ---------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('fe-aff-styles')) return;
    var s = document.createElement('style');
    s.id = 'fe-aff-styles';
    s.textContent = [
      /* ---- .affiliate-link: badge "Partner" inline ---- */
      '.affiliate-link { position: relative; }',
      '.affiliate-link::after {',
      '  content: "Partner";',
      '  display: inline-block;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  letter-spacing: .05em;',
      '  text-transform: uppercase;',
      '  color: #059669;',
      '  background: rgba(5,150,105,.12);',
      '  border: 1px solid rgba(5,150,105,.3);',
      '  border-radius: 3px;',
      '  padding: 1px 5px;',
      '  margin-left: 6px;',
      '  vertical-align: middle;',
      '  line-height: 1.5;',
      '}',

      /* ---- .partner-button: CTA verde con tooltip ---- */
      '.partner-button {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 11px 22px;',
      '  background: #059669;',
      '  color: #fff !important;',
      '  border-radius: 8px;',
      '  font-weight: 600;',
      '  font-size: 14px;',
      '  text-decoration: none !important;',
      '  transition: background .2s, transform .12s;',
      '  position: relative;',
      '}',
      '.partner-button:hover { background: #047857; transform: translateY(-1px); }',
      '.partner-button::after {',
      '  content: "Link affiliato — nessun costo extra per te";',
      '  position: absolute;',
      '  bottom: calc(100% + 7px);',
      '  left: 50%;',
      '  transform: translateX(-50%);',
      '  background: rgba(0,0,0,.82);',
      '  color: #fff;',
      '  font-size: 11px;',
      '  font-weight: 400;',
      '  white-space: nowrap;',
      '  padding: 5px 9px;',
      '  border-radius: 5px;',
      '  opacity: 0;',
      '  pointer-events: none;',
      '  transition: opacity .15s;',
      '  z-index: 100;',
      '}',
      '.partner-button:hover::after { opacity: 1; }',

      /* ---- rel="sponsored": badge "Sponsorizzato" su link generici ---- */
      'a[rel~="sponsored"]:not(.partner-button)::after {',
      '  content: "Sponsorizzato";',
      '  display: inline-block;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  letter-spacing: .05em;',
      '  text-transform: uppercase;',
      '  color: #d97706;',
      '  background: rgba(217,119,6,.1);',
      '  border: 1px solid rgba(217,119,6,.28);',
      '  border-radius: 3px;',
      '  padding: 1px 5px;',
      '  margin-left: 6px;',
      '  vertical-align: middle;',
      '  line-height: 1.5;',
      '}',

      /* ---- Disclosure banner (opzionale) ---- */
      '.aff-disclosure {',
      '  font-size: 11px;',
      '  color: rgba(255,255,255,.45);',
      '  border-top: 1px solid rgba(255,255,255,.07);',
      '  padding-top: 8px;',
      '  margin-top: 12px;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // createAffiliateLink
  // ---------------------------------------------------------------------------
  /**
   * Costruisce un URL affiliato aggiungendo parametri UTM standard.
   *
   * @param {string} baseUrl   URL base del partner (es. "https://freedom24.com/...")
   * @param {string} campaign  Identificatore campagna (es. "freedom24-conto-2026")
   * @param {Object} [extra]   Parametri aggiuntivi da appendere all'URL
   * @returns {string} URL completo con UTM
   *
   * Esempio:
   *   var url = FinEdgeAffiliate.createAffiliateLink(
   *     'https://freedom24.com/open-account/',
   *     'freedom24-conto',
   *     { ref: 'finedge' }
   *   );
   */
  function createAffiliateLink(baseUrl, campaign, extra) {
    try {
      var url = new URL(baseUrl);
      url.searchParams.set('utm_source', CONFIG.utmSource);
      url.searchParams.set('utm_medium', CONFIG.utmMedium);
      url.searchParams.set('utm_campaign', campaign || 'general');
      if (extra && typeof extra === 'object') {
        Object.keys(extra).forEach(function (k) {
          url.searchParams.set(k, extra[k]);
        });
      }
      return url.toString();
    } catch (e) {
      if (CONFIG.debug) console.warn('[FinEdge Affiliate] URL non valido:', baseUrl, e);
      return baseUrl;
    }
  }

  // ---------------------------------------------------------------------------
  // trackAffiliateClick
  // ---------------------------------------------------------------------------
  /**
   * Registra un click affiliato su console, endpoint interno (opzionale) e GA4 (se presente).
   *
   * @param {string} partner   Nome del partner (es. "freedom24")
   * @param {string} campaign  Nome campagna
   * @param {string} [url]     URL di destinazione
   *
   * Esempio:
   *   FinEdgeAffiliate.trackAffiliateClick('tradingview', 'tv-pro-2026', link.href);
   */
  function trackAffiliateClick(partner, campaign, url) {
    var payload = {
      event: 'affiliate_click',
      partner: partner || 'unknown',
      campaign: campaign || 'general',
      url: url || '',
      ts: Date.now(),
      page: location.pathname,
    };

    if (CONFIG.debug) {
      console.log('[FinEdge Affiliate] Click registrato:', payload);
    }

    // Endpoint interno (opzionale)
    if (CONFIG.trackingEndpoint) {
      fetch(CONFIG.trackingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true, // garantisce invio anche se la pagina viene chiusa subito dopo
      }).catch(function () {}); // silenzioso — il tracking non deve mai bloccare la navigazione
    }

    // Google Analytics 4 (se gtag è presente)
    if (typeof gtag === 'function') {
      gtag('event', 'affiliate_click', {
        affiliate_partner: payload.partner,
        affiliate_campaign: payload.campaign,
        link_url: payload.url,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Listener globale
  // ---------------------------------------------------------------------------
  function initGlobalListener() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[rel~="sponsored"], a.affiliate-link, a.partner-button');
      if (!link) return;

      var partner  = link.dataset.partner  || (link.hostname || 'unknown');
      var campaign = link.dataset.campaign || 'general';
      trackAffiliateClick(partner, campaign, link.href);
    }, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function init() {
    injectStyles();
    initGlobalListener();
    if (CONFIG.debug) console.log('[FinEdge Affiliate] Inizializzato.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API pubblica
  window.FinEdgeAffiliate = {
    createAffiliateLink: createAffiliateLink,
    trackAffiliateClick: trackAffiliateClick,
    config: CONFIG,
  };
})();
