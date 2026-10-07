import { useEffect, useState } from 'react';
import { adminPublishSettings, adminSettingsStatus, isLive } from './adminData';

/* The one Preview → Publish control, shared by every admin page whose
   edits are drafts (Site Settings has its own richer bar; Drops uses this).
   Bump `refreshKey` after saving a draft so the status re-checks. */
export default function PublishBar({ refreshKey = 0, previewPath = '/' }) {
  const [status, setStatus] = useState({ dirty: false, publishedAt: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (isLive) adminSettingsStatus().then(setStatus).catch(() => {}); }, [refreshKey]);
  if (!isLive) return null;

  async function publish() {
    setBusy(true); setMsg('');
    try {
      const at = await adminPublishSettings();
      setStatus(await adminSettingsStatus());
      setMsg(`Published ${new Date(at).toLocaleTimeString()} — live for every visitor.`);
    } catch (e) { setMsg(e.message || 'Publish failed'); }
    setBusy(false);
  }
  return (
    <div className="publish-bar" role="region" aria-label="Preview and publish">
      <span className={`pill ${status.dirty ? 'info' : 'ok'}`}>{status.dirty ? 'Unpublished draft changes' : 'Everything is published'}</span>
      <a className="btn btn-ghost btn-sm" href={`${previewPath}${previewPath.includes('?') ? '&' : '?'}preview=1`} target="_blank" rel="noopener">Preview</a>
      <button className="btn btn-sm" type="button" onClick={publish} disabled={busy || !status.dirty}>{busy ? 'Publishing…' : 'Publish'}</button>
      {status.publishedAt && <small>Last published {new Date(status.publishedAt).toLocaleString()}</small>}
      {msg && <span className="pb-notice" role="status">{msg}</span>}
    </div>
  );
}
