import { useState, Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Header from './Header';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import Gate from './Gate';
import Popups from './Popups';
import SocialProof from './SocialProof';
import QuickView from './QuickView';
import { Preloader, Cursor } from './MotionLayer';
import usePageMotion from '../hooks/usePageMotion';

/* Owner's call: the gate greets every FIRST visit to the site (any page),
   then never again — unlock persists in localStorage. The admin Site
   Settings control whether it shows at all and whether guests can skip it. */
export default function Layout() {
  const { unlocked, toast, loading, CONFIG, products, isPreorder } = useStore();
  const { pathname, search } = useLocation();
  // owner preview: darkdivine.store/?gate always shows the gate, even after
  // unlock; entering/guest-skipping dismisses the preview like a real visit
  const [preview, setPreview] = useState(() => new URLSearchParams(window.location.search).has('gate'));
  const forceGate = preview && new URLSearchParams(search).has('gate');
  const preorderUtilityPaths = ['/drop', '/cart', '/thanks', '/order-status', '/shipping', '/refunds', '/privacy', '/size-guide', '/contact', '/unsubscribe'];
  const productHandle = pathname.startsWith('/product/') ? decodeURIComponent(pathname.slice('/product/'.length)) : '';
  const productAllowed = productHandle && products.some((product) => product.handle === productHandle && isPreorder(product));
  const preorderPathAllowed = preorderUtilityPaths.includes(pathname) || productAllowed;
  const preorderRouteBlocked = CONFIG.preorderOnlyLock === true
    && !preorderPathAllowed
    && !(loading && Boolean(productHandle));
  usePageMotion(!loading);
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <Preloader />
      <Cursor />
      {(!unlocked || forceGate) && CONFIG.gateEnabled && <Gate onDone={() => setPreview(false)} />}
      <Header />
      {/* ScrollSmoother owns everything inside #smooth-content; all fixed
          UI (header, drawers, overlays, toasts) lives outside the wrapper */}
      <div id="smooth-wrapper">
        <div id="smooth-content">
          {/* keyed per route: GSAP pins re-parent sections into pin-spacers,
              so React must remove ONE wrapper per page (spacers ride along)
              instead of each section — otherwise unmount throws removeChild
              and React tears down the whole app (the dead-navigation bug) */}
          {/* Suspense sits INSIDE the keyed page-root so code-split routes
              load on navigation without disturbing the single-wrapper rule
              the GSAP pin/unmount fix depends on */}
          <main id="main-content" tabIndex="-1"><div className="page-root" key={pathname}><Suspense fallback={null}>{preorderRouteBlocked ? <Navigate to="/drop" replace /> : <Outlet />}</Suspense></div></main>
          <Footer />
        </div>
      </div>
      <CartDrawer />
      <QuickView />
      <Popups />
      <SocialProof />
      <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
      <div className="page-veil" aria-hidden="true"><span className="logo-mark lg" /></div>
      <div className="lbox-bar lbox-top" aria-hidden="true" />
      <div className="lbox-bar lbox-bot" aria-hidden="true" />
      <div className="scroll-progress" aria-hidden="true" />
    </>
  );
}
