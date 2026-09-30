// Google Analytics 4. The Google tag itself (Measurement ID G-R3LKFK10D5,
// the Celestera web stream) sits at the top of every page's <head>, exactly
// as Google supplies it; this only sends game events through it. Where the
// tag is absent (tests, a page without it) track() does nothing.

export function track(name, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}
