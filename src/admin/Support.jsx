import { useEffect, useState } from 'react';
import { adminListSupportRequests, adminUpdateSupportRequest } from './adminData';

const STATUSES = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const KINDS = ['message', 'tracking', 'return', 'order_issue'];
const label = (value) => value.replaceAll('_', ' ');

export default function Support() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ status: '', kind: '' });
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setMessage('Loading support requests…');
    adminListSupportRequests(filters)
      .then((result) => {
        if (!active) return;
        setRows(result);
        setDrafts(Object.fromEntries(result.map((row) => [row.id, {
          status: row.status || 'new',
          internal_note: row.internal_note || '',
        }])));
        setMessage(result.length ? '' : 'No support requests match these filters.');
      })
      .catch((error) => active && setMessage(error.message || 'Support requests could not be loaded.'));
    return () => { active = false; };
  }, [filters]);

  function edit(id, patch) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  async function save(row) {
    setBusy(row.id);
    setMessage('');
    try {
      const patch = drafts[row.id];
      await adminUpdateSupportRequest(row.id, patch);
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, ...patch } : item));
      setMessage(`${row.reference} saved.`);
    } catch (error) {
      setMessage(error.message || 'This support request could not be saved.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section>
      <header className="admin-head">
        <div><h1>Support</h1><p>Private customer requests and order questions.</p></div>
      </header>

      <div className="support-filters">
        <label>Status
          <select name="support-status-filter" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <label>Request type
          <select name="support-kind-filter" value={filters.kind} onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value }))}>
            <option value="">All types</option>
            {KINDS.map((kind) => <option key={kind} value={kind}>{label(kind)}</option>)}
          </select>
        </label>
      </div>

      <p className="admin-support-status" role="status" aria-live="polite">{message}</p>
      <div className="support-ticket-list">
        {rows.map((row) => {
          const draft = drafts[row.id] || { status: row.status, internal_note: row.internal_note || '' };
          return (
            <article className="support-ticket" key={row.id}>
              <header>
                <div><span className="eyebrow">{label(row.kind || 'message')}</span><h2>{row.reference}</h2></div>
                <span className="admin-mode">{label(row.status || 'new')}</span>
              </header>
              <dl className="support-ticket-meta">
                <div><dt>Customer</dt><dd>{row.name}</dd></div>
                <div><dt>Email</dt><dd><a href={`mailto:${row.email}`}>{row.email}</a></dd></div>
                <div><dt>Order</dt><dd>{row.order_number || '—'}</dd></div>
                <div><dt>Received</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div>
              </dl>
              <h3>{row.subject}</h3>
              <p className="support-ticket-message">{row.message}</p>
              <div className="support-ticket-edit">
                <label>Status
                  <select name={`status-${row.id}`} value={draft.status} onChange={(event) => edit(row.id, { status: event.target.value })}>
                    {STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </label>
                <label>Private admin note
                  <textarea name={`note-${row.id}`} rows="3" value={draft.internal_note} onChange={(event) => edit(row.id, { internal_note: event.target.value })} />
                </label>
                <button className="btn btn-sm" type="button" disabled={busy === row.id} onClick={() => save(row)}>
                  {busy === row.id ? 'Saving…' : 'Save ticket'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
