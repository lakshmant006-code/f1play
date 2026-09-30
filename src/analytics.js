// Google Analytics 4. The Measurement ID comes from the VITE_GA4_ID
// environment variable at build time (set it in Vercel: Project Settings →
// Environment Variables, then redeploy). Without an ID nothing loads and
// track() does nothing, so local builds and tests stay silent.

const ID = import.meta.env?.VITE_GA4_ID || '';
let ready = false;

export function initAnalytics() {
  if (ready || !ID || typeof document === 'undefined') return;
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
