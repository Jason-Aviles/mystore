import { useStore } from '../context/StoreContext';

/* Shown only in preview mode (?preview=1). Makes it impossible to mistake
   draft settings for the live store. */
export default function PreviewBar() {
  const { preview } = useStore();
  if (preview === 'off') return null;
  const exit = () => { window.location.href = `${window.location.pathname}?preview=0`; };
  return (
    <div className="preview-bar" role="status">
      {preview === 'draft' ? (
        <>
          <b>PREVIEW</b>
          <span>You're seeing your unpublished draft — visitors still see the live version.</span>
          <a className="pb-btn" href="/admin/settings">Back to settings · Publish</a>
        </>
      ) : (
        <>
          <b>PREVIEW</b>
          <span>Sign in to the admin in this browser to preview drafts. You're seeing the live site.</span>
          <a className="pb-btn" href="/admin">Admin sign-in</a>
        </>
      )}
      <button type="button" className="pb-btn ghost" onClick={exit}>Exit preview</button>
    </div>
  );
}
