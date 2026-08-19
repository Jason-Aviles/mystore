import { useEffect, useState } from 'react';
import { adminListSignups, adminListSms, isLive } from './adminData';

/* The list is the business: every email and phone number the site has
   collected — gate, popup, footer, checkout — filterable and exportable.
   This is what the campaigns send to and what you'd take anywhere. */
export default function Signups() {
  const [tab, setTab] = useState('emails');
  const [rows, setRows] = useState([]);
  const [sms, setSms] = useState([]);
  const [filter, setFilter] = useState('all');
  useEffect(() => {
    adminListSignups().then(setRows);
    adminListSms().then(setSms);
  }, []);

  const sources = ['all', ...new Set(rows.map((r) => r.source).filter(Boolean))];
  const visible = filter === 'all' ? rows : rows.filter((r) => r.source === filter);

  function downloadCsv(name, head, lines) {
    const blob = new Blob([head + '\n' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const exportEmails = () => downloadCsv('darkdivine-email-list.csv', 'email,source,consent,created_at',
    visible.map((r) => [r.email, r.source, r.consent !== false, r.created_at || ''].join(',')));
  const exportSms = () => downloadCsv('darkdivine-sms-list.csv', 'phone,consent,created_at',
    sms.map((r) => [r.phone, r.consent !== false, r.created_at || ''].join(',')));

  return (
    <>
      <div className="admin-head">
        <h1 className="display">The List</h1>
        <button className="btn btn-sm" onClick={tab === 'emails' ? exportEmails : exportSms}>Export CSV</button>
      </div>
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Showing signups captured in this browser. Connect Supabase and every gate,
          popup, footer and checkout signup lands in <b>email_signups</b> / <b>sms_signups</b>.
        </div>
      )}
      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <button className={tab === 'emails' ? 'sel' : ''} onClick={() => setTab('emails')}>Emails ({rows.length})</button>
        <button className={tab === 'sms' ? 'sel' : ''} onClick={() => setTab('sms')}>Phone numbers ({sms.length})</button>
      </div>

      {tab === 'emails' ? (
        <>
          <div className="filter-bar">
            {sources.map((s) => <button key={s} className={filter === s ? 'sel' : ''} onClick={() => setFilter(s)}>{s}</button>)}
          </div>
          {visible.length === 0 ? (
            <p className="empty-note">No signups yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="admin-table">
                <thead><tr><th>Email</th><th>Source</th><th>Consent</th><th>Date</th></tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.id || r.email + i}>
                      <td>{r.email}</td>
                      <td><span className="pill info">{r.source}</span></td>
                      <td>{r.consent === false ? <span className="pill">support only</span> : <span className="pill ok">marketing ok</span>}</td>
                      <td style={{ fontSize: 12, color: 'var(--silver)' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : sms.length === 0 ? (
        <p className="empty-note">No phone numbers yet — the gate and popup collect them (optional field), always with consent.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Phone</th><th>Consent</th><th>Date</th></tr></thead>
            <tbody>
              {sms.map((r, i) => (
                <tr key={r.id || r.phone + i}>
                  <td>{r.phone}</td>
                  <td>{r.opted_out ? <span className="pill">opted out</span> : <span className="pill ok">drop-day texts ok</span>}</td>
                  <td style={{ fontSize: 12, color: 'var(--silver)' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
