// Google Analytics 4 for www.celestera.online. The VITE_GA4_ID environment
// variable overrides the built-in Measurement ID. Nothing loads on localhost,
// so local play and tests don't count as visits.

const ID = import.meta.env?.VITE_GA4_ID || 'G-R3LKFK10D5';
let ready = false;

export function initAnalytics() {
  if (ready || !ID || typeof document === 'undefined') return;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  ready = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // gtag expects the arguments object
  };
  window.gtag('js', new Date());
  window.gtag('config', ID);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  document.head.append(s);
}

// A game event, e.g. track('lap_complete', { track: 'dawn', time: 52.6 }).
export function track(name, params = {}) {
  if (!ready) return;
  window.gtag('event', name, params);
}
