import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase, hasSupabase } from '../lib/supabase';
import { isLive, adminNotifications } from './adminData';
import { Bell } from '../components/Icons';
import Dashboard from './Dashboard';
import Products from './Products';
import ProductEdit from './ProductEdit';
import Orders from './Orders';
import Support from './Support';
import Customers from './Customers';
import Signups from './Signups';
import Campaigns from './Campaigns';
import ReviewsAdmin from './ReviewsAdmin';
import Settings from './Settings';
import Flows from './Flows';
import Preorders from './Preorders';
import '../styles/global.css';

/* Admin auth:
   LIVE — Supabase email/password auth (create the owner account in the
          Supabase dashboard; RLS policies gate writes to authenticated users).
   DEMO — VITE_ADMIN_PASSCODE from .env (default below for local preview). */
const DEMO_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE || 'darkdivine-admin';

function useAdminAuth() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('dd_admin') === '1');
  const [ready, setReady] = useState(!hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setAuthed(true);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(Boolean(session)));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { authed, ready, setAuthed };
}

function Login({ setAuthed }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (hasSupabase) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) { setErr(error.message); return; }
      setAuthed(true);
    } else {
      if (pass === DEMO_PASSCODE) { sessionStorage.setItem('dd_admin', '1'); setAuthed(true); }
      else setErr('Wrong passcode.');
    }
  }

  return (
    <div className="admin-login">
      <div className="box">
        <span className="logo">Dark <em>Divine</em></span>
        <p style={{ color: 'var(--silver)', fontSize: 12, marginTop: 8, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Admin</p>
        <form onSubmit={submit}>
          {hasSupabase && (
            <input type="email" required placeholder="Email" aria-label="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          )}
          <input type="password" required placeholder={hasSupabase ? 'Password' : 'Passcode'} aria-label="Password"
            value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn btn-block" type="submit">Sign In</button>
        </form>
        <p style={{ color: '#e8a0a3', fontSize: 12, minHeight: 18, marginTop: 10 }}>{err}</p>
        {!hasSupabase && (
          <p style={{ color: 'var(--silver)', fontSize: 11, marginTop: 6 }}>
            Demo mode — set <b>VITE_ADMIN_PASSCODE</b> in .env. Connect Supabase for real accounts.
          </p>
        )}
      </div>
    </div>
  );
}

const NAV = [
  ['/admin', 'Dashboard', true],
  ['/admin/products', 'Products', false],
  ['/admin/orders', 'Orders', false],
  ['/admin/support', 'Support', false],
  ['/admin/preorders', 'Preorders', false],
  ['/admin/customers', 'Customers', false],
  ['/admin/reviews', 'Reviews', false],
  ['/admin/signups', 'The List', false],
  ['/admin/campaigns', 'Campaigns', false],
  ['/admin/flows', 'Flows', false],
  ['/admin/settings', 'Site Settings', false],
];

export default function AdminRoutes() {
  const { authed, ready, setAuthed } = useAdminAuth();
  const [notif, setNotif] = useState({ total: 0, items: [] });
  const [notifOpen, setNotifOpen] = useState(false);

  // poll actionable counts every minute while signed in
  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const load = () => adminNotifications().then((r) => alive && setNotif(r)).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [authed]);

  if (!ready) return null;
  if (!authed) return <Login setAuthed={setAuthed} />;

  // per-nav badges pull from the same counts
  const navCount = { '/admin/orders': notif.orders, '/admin/support': notif.support, '/admin/preorders': notif.balances, '/admin/reviews': notif.reviews };

  async function signOut() {
    sessionStorage.removeItem('dd_admin');
    if (hasSupabase) await supabase.auth.signOut();
    setAuthed(false);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="logo">Dark <em>Divine</em></div>
        <div className="admin-notif">
          <button className="admin-bell" onClick={() => setNotifOpen((o) => !o)}
            aria-label={`Notifications — ${notif.total} need your attention`} aria-expanded={notifOpen}>
            <Bell /> <span>Notifications</span>
            {notif.total > 0 && <span className="notif-badge">{notif.total}</span>}
          </button>
          {notifOpen && (
            <div className="notif-panel">
              {notif.items.length === 0
                ? <p className="notif-empty">All caught up — nothing needs you right now.</p>
                : notif.items.map((it) => (
                  <NavLink key={it.key} to={it.to} className={`notif-item ${it.info ? 'info' : ''}`} onClick={() => setNotifOpen(false)}>
                    <span className="ni-count">{it.count}</span> {it.label}
                  </NavLink>
                ))}
            </div>
          )}
        </div>
        <nav>
          {NAV.map(([to, label, end]) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
              {navCount[to] > 0 && <span className="nav-badge">{navCount[to]}</span>}
            </NavLink>
          ))}
          <a href="/" target="_blank" rel="noopener noreferrer">View Store ↗</a>
        </nav>
        <div className="foot">
          <span className={`admin-mode ${isLive ? 'live' : ''}`}>{isLive ? 'LIVE — Supabase' : 'DEMO — local only'}</span>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="products/new" element={<ProductEdit />} />
          <Route path="products/:handle" element={<ProductEdit />} />
          <Route path="orders" element={<Orders />} />
          <Route path="support" element={<Support />} />
          <Route path="preorders" element={<Preorders />} />
          <Route path="customers" element={<Customers />} />
          <Route path="reviews" element={<ReviewsAdmin />} />
          <Route path="signups" element={<Signups />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="flows" element={<Flows />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
