/* Meta (Facebook) Pixel — loads ONLY when the admin sets a Pixel ID in
   Site Settings. Standard e-commerce events fire from the store flows:
   PageView · ViewContent · AddToCart · InitiateCheckout · Purchase ·
   Search · Lead. No ID → every call is a silent no-op. */

let loaded = false;

export function initMetaPixel(pixelId) {
  if (loaded || !pixelId || typeof window === 'undefined') return;
  loaded = true;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', String(pixelId).trim());
  window.fbq('track', 'PageView');
}

export function metaTrack(event, data) {
  if (typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', event, data || {});
}

export function metaPageView() {
  if (typeof window === 'undefined' || !window.fbq) return;
  window.fbq('track', 'PageView');
}
