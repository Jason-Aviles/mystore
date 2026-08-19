import { useEffect, useState } from 'react';
import { adminListCampaigns, adminSaveCampaign, adminSendCampaign, adminAudienceCount, isLive } from './adminData';
import { useStore } from '../context/StoreContext';

/* client-side twin of the send-campaign HTML shell — keeps the preview honest */
function previewHtml(subject, body) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:32px 12px;"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141416;border:1px solid #2a2a2e;"><tr><td style="padding:36px 32px 8px;text-align:center;"><div style="font-family:Georgia,serif;font-size:26px;letter-spacing:4px;color:#f2f1ee;font-weight:bold;">DARK DIVINE</div><div style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#8e939c;margin-top:6px;">Illuminate the darkness within</div></td></tr><tr><td style="padding:24px 32px;font-family:Arial,sans-serif;color:#c9c7c1;font-size:15px;line-height:1.7;">${esc(body || 'Your message…').split('\n').join('<br>')}</td></tr><tr><td style="padding:4px 32px 32px;" align="center"><a style="display:inline-block;background:#efb6c4;color:#0a0a0b;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:3px;text-decoration:none;padding:15px 38px;">SHOP THE DROP</a></td></tr><tr><td style="padding:0 32px 32px;font-family:Arial,sans-serif;color:#8e939c;font-size:12px;text-align:center;border-top:1px solid #2a2a2e;padding-top:20px;">One email per drop. Nothing else.<br><br><a style="color:#5a5f66;">Unsubscribe</a></td></tr></table></td></tr></table>`;
}

/* Klaviyo-style campaign composer.
   Audiences map to email_signups.source filters; sending happens through
   the send-campaign Edge Function (Resend), which also appends the
   unsubscribe footer to every message. */
const AUDIENCES = [
  ['all', 'Everyone (consented)'],
  ['password_gate', 'Gate signups'],
  ['popup', 'Popup signups'],
  ['footer_signup', 'Footer signups'],
  ['checkout', 'Checkout emails'],
  ['back_in_stock', 'Back-in-stock requests'],
];

/* templates are built from live Site Settings so the drop name and code
   are always current — the "live" one is the one-click site-open blast */
const buildTemplates = (CONFIG) => ({
  live: {
    subject: (CONFIG.dropName || 'DARK DIVINE') + ' IS LIVE — the door is open',
    body: [
      'The wait is over — ' + (CONFIG.dropName || 'the new drop') + ' is live right now.',
      '',
      'Every piece is one run. When your size sells through, it never comes back.',
      '',
      'Your access code: ' + ((CONFIG.fallbackAccessCodes || [])[0] || 'DIVINE333'),
      '',
      'Enter: darkdivine.store',
      '',
      'The list sees it first. This is that moment.',
    ].join('\n'),
  },
  drop: {
    subject: (CONFIG.dropName ? CONFIG.dropName.split('—')[0].trim() : 'THE NEXT RUN') + ' — your access code inside',
    body: [
      // the real drop date from Site Settings — never a made-up "Friday 7PM"
      CONFIG.dropDate && !Number.isNaN(new Date(CONFIG.dropDate).getTime())
        ? 'The next run goes live ' + new Date(CONFIG.dropDate).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) + '.'
        : 'The next run is loading.',
      '',
      'One run per colorway. When your size sells through, it never comes back.',
      '',
      'Your private access code: ' + ((CONFIG.fallbackAccessCodes || [])[0] || 'DIVINE333'),
      '',
      'Enter at darkdivine.store — the list gets the door first.',
    ].join('\n'),
  },
  welcome: {
    subject: "You're in. Here's 10% — DARK DIVINE",
    body: `Welcome to the list.\n\nYou get drop dates first, private access codes before every release, and 10% off your first order:\n\nCode: ${CONFIG.welcomeCode || 'DARKDIVINEWELCOME10'}\n\nShop: darkdivine.store`,
  },
  winback: {
    subject: 'Last call — 25% says come back',
    body: `Still thinking it over?\n\nThis is a one-run brand — when your size goes, it's gone for good.\n\n25% off your next order: ${CONFIG.comebackCode || 'DARKDIVINECOMEBACK25'}\n\ndarkdivine.store`,
  },
});

export default function Campaigns() {
  const { CONFIG } = useStore();
  const TEMPLATES = buildTemplates(CONFIG);
  const [campaigns, setCampaigns] = useState([]);
  const [draft, setDraft] = useState({ subject: '', body: '', audience: 'all', status: 'draft' });
  const [msg, setMsg] = useState('');
  const [reach, setReach] = useState(null);
  const load = () => adminListCampaigns().then(setCampaigns);
  useEffect(() => { load(); }, []);
  useEffect(() => { adminAudienceCount(draft.audience).then(setReach); }, [draft.audience]);

  async function testSend(c) {
    const to = window.prompt('Send a test of this campaign to which email?');
    if (!to) return;
    const res = await adminSendCampaign(c.id, to.trim());
    setMsg(res.ok ? `Test sent to ${to.trim()} — campaign stays draft.` : res.error);
  }

  async function saveDraft(e) {
    e.preventDefault();
    await adminSaveCampaign({ ...draft, status: 'draft' });
    setDraft({ subject: '', body: '', audience: 'all', status: 'draft' });
    setMsg('Draft saved.');
    load();
  }

  async function send(c) {
    if (!window.confirm(`Send "${c.subject}" to audience "${c.audience}"?\n\nThis emails real people. No undo.`)) return;
    const res = await adminSendCampaign(c.id);
    setMsg(res.ok ? `Sent to ${res.sent ?? '—'} subscribers.` : res.error);
    load();
  }

  return (
    <>
      <div className="admin-head"><h1 className="display">Campaigns</h1></div>

      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Drafts save locally. To send for real: connect Supabase, add your
          <b> RESEND_API_KEY</b> to the send-campaign Edge Function, and verify darkdivine.store as a
          sending domain in Resend. Sender: contact@darkdivine.store.
        </div>
      )}

      <div className="section-head" style={{ marginBottom: 12 }}><h2 className="display" style={{ fontSize: 16 }}>New Campaign</h2></div>
      <div className="filter-bar">
        {Object.entries(TEMPLATES).map(([k, t]) => (
          <button key={k} onClick={() => setDraft((d) => ({ ...d, ...t }))}>Template: {k}</button>
        ))}
      </div>
      <form className="admin-form" onSubmit={saveDraft} style={{ marginBottom: 40 }}>
        <div className="row two">
          <div>
            <label>Subject</label>
            <input type="text" required value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </div>
          <div>
            <label>Audience</label>
            <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })}>
              {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label>Body (plain text — it is wrapped in the branded HTML template below; unsubscribe added automatically)</label>
          <textarea rows="7" required value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn" type="submit">Save Draft</button>
          <span className="pill info">will reach {reach ?? '…'} subscriber{reach === 1 ? '' : 's'}</span>
          <span style={{ fontSize: 13, color: 'var(--green)' }}>{msg}</span>
        </div>
        <div style={{ marginTop: 22 }}>
          <label>Live preview (exactly what subscribers receive)</label>
          <iframe title="Email preview" sandbox="" srcDoc={previewHtml(draft.subject, draft.body)}
            style={{ width: '100%', height: 460, border: '1px solid var(--line-strong)', background: '#0a0a0b' }} />
        </div>
      </form>

      <div className="section-head" style={{ marginBottom: 12 }}><h2 className="display" style={{ fontSize: 16 }}>History</h2></div>
      {campaigns.length === 0 ? (
        <p className="empty-note">No campaigns yet. Draft one above — templates give you a head start.</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table">
            <thead><tr><th>Subject</th><th>Audience</th><th>Status</th><th>Sent</th><th></th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.subject}</b></td>
                  <td><span className="pill info">{c.audience}</span></td>
                  <td><span className={`pill ${c.status === 'sent' ? 'ok' : ''}`}>{c.status}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--silver)' }}>{c.sent_at ? new Date(c.sent_at).toLocaleString() : '—'}</td>
                  <td>
                    {c.status !== 'sent' && (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => testSend(c)}>Test</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => send(c)}>Send</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
