import { Routes, Route, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import Layout from './components/Layout';
import Home from './pages/Home';
/* Home is the landing page — eager so first paint never waits on a chunk.
   Every other route is code-split, so a first visit downloads Home + the
   shell only, not Product/Cart/Policies/etc. Layout wraps <Outlet/> in a
   Suspense boundary, so these load on navigation. */
const Drop = lazy(() => import('./pages/Drop'));
const Shop = lazy(() => import('./pages/Shop'));
const Product = lazy(() => import('./pages/Product'));
const CartPage = lazy(() => import('./pages/CartPage'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Thanks = lazy(() => import('./pages/Thanks'));
const OrderStatus = lazy(() => import('./pages/OrderStatus'));
const Unsubscribe = lazy(() => import('./pages/Unsubscribe'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ShippingPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.ShippingPolicy })));
const RefundPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.RefundPolicy })));
const PrivacyPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.PrivacyPolicy })));
const TermsPolicy = lazy(() => import('./pages/Policies').then((m) => ({ default: m.TermsPolicy })));
const SizeGuidePage = lazy(() => import('./pages/Policies').then((m) => ({ default: m.SizeGuidePage })));
/* the whole admin panel is its own chunk — shoppers never download it */
const AdminRoutes = lazy(() => import('./admin/AdminRoutes'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={null}><AdminRoutes /></Suspense>} />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/drop" element={<Drop />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/collection/:slug" element={<Shop />} />
          <Route path="/product/:handle" element={<Product />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/shipping" element={<ShippingPolicy />} />
          <Route path="/refunds" element={<RefundPolicy />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsPolicy />} />
          <Route path="/size-guide" element={<SizeGuidePage />} />
          <Route path="/thanks" element={<Thanks />} />
          <Route path="/order-status" element={<OrderStatus />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  );
}
