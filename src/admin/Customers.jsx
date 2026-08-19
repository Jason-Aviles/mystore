import { useEffect, useState } from 'react';
import { adminListCustomers, isLive } from './adminData';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => { adminListCustomers().then(setCustomers); }, []);

  const visible = customers.filter((c) =>
    !q || (c.email || '').includes(q.toLowerCase()) || (c.name || '').toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Customers</h1>
        <input type="text" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 280 }} aria-label="Search customers" />
      </div>
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Run <b>npm run import:shopify</b> after connecting Supabase to pull your
          Shopify customer export (cvs/customers_export.csv) into this table.
        </div>
      )}
      {visible.length === 0 ? (
        <p className="empty-note">No customers yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Name</th><th>Orders</th><th>Total spent</th><th>Marketing</th><th>Since</th></tr></thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id || c.email}>
                  <td>{c.email}</td>
                  <td>{c.name || '—'}</td>
                  <td>{c.orders_count ?? '—'}</td>
                  <td>{c.total_spent != null ? `$${Number(c.total_spent).toFixed(2)}` : '—'}</td>
                  <td>{c.accepts_marketing ? <span className="pill ok">Opted in</span> : <span className="pill">No consent</span>}</td>
                  <td style={{ fontSize: 12, color: 'var(--silver)' }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
