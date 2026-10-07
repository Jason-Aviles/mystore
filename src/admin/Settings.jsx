import { useEffect, useState } from 'react';
import { DEFAULT_CONFIG } from '../lib/config';
import { mergeHomepage } from '../lib/homeContent';
import { adminGetSettings, adminReplaceSettings, adminPublishSettings, adminDiscardDraft, adminSettingsStatus, uploadProductImage, uploadMedia, isLive } from './adminData';
import LoadError from './LoadError';
import HomepageEditor from './HomepageEditor';
import { HOMEPAGE_FIELD_GROUPS } from './homepageFields';
import BrandEditor from './BrandEditor';

/* Site Settings — edit the storefront without touching code.
   Saved overrides merge over DEFAULT_CONFIG on every visitor load. */

const FIELDS = [
  ['Storefront copy', [
    ['heroScript', 'Hero script word', 'text', 'The cursive word above the headline (e.g. "Illuminate")'],
    ['heroTitle', 'Hero headline', 'text', 'Use | for a line break (e.g. "The Darkness|Within")'],
    ['heroSub', 'Hero subline', 'textarea', 'The paragraph under the headline'],
    ['anncText', 'Announcement bar', 'text', 'Leave empty for the automatic free-shipping message'],
  ]],
  ['Drop', [
    ['dropMode', 'Drop mode', 'toggle', 'Master switch. Off hides every countdown, The Drop link, and drop wording across the whole site'],
    ['dropNavLabel', 'Menu tab name', 'choice:The Drop|Preorder', 'What the drop tab is called in the header, mobile menu, and footer. Pick one or type your own'],
    ['dropName', 'Drop name', 'text', 'Shown on the gate, homepage timer, Drop page, and announcement bar'],
    ['dropDate', 'Drop date & time', 'datetime', 'The countdown target'],
    ['dropImage', 'Drop picture', 'image', 'Shown on the gate, the homepage timer panel, and the Drop page'],
    ['shopCampaignImage', 'Shop campaign picture', 'image', 'The editorial photo tile inside the Shop All grid — swap it each drop. Caption auto-updates from the Drop name'],
    ['nextDropEnabled', 'Show “Up next” teaser', 'toggle', 'A teaser for the NEXT drop on the homepage and Drop page — pieces + email signup, no prices'],
    ['nextDropName', 'Next drop name', 'text', 'e.g. THE EMBLEM — DROP 003'],
    ['nextDropBlurb', 'Next drop description', 'textarea', 'One or two lines about the pieces'],
    ['nextDropImage1', 'Next drop picture 1', 'image', 'Tall photo, shown large'],
    ['nextDropImage2', 'Next drop picture 2', 'image', 'Second photo, offset beside the first'],
    ['saleEndsAt', 'Sale ends (optional)', 'datetime', 'Shows a live countdown in the announcement bar. Only set this if the sale really ends then — then end it.'],
  ]],
  ['Access', [
    ['gateEnabled', 'Access-code gate', 'toggle', 'The password page shown on entry. Preview it anytime at yoursite.com/?gate'],
    ['gateEntryEnabled', 'Show private preorder entry', 'toggle', 'Off hides the access-code field and entry button while keeping the waitlist and policy links available'],
    ['gateRemember', 'Remember visitors', 'toggle', 'On: unlock once, never see the gate again on that device. Off: the gate greets them again on their next visit (it stays open while they browse)'],
    ['gateGuestBypass', '"Browse as guest" button', 'toggle', 'Off = an access code is the ONLY way into The Drop'],
    ['preorderOnlyLock', 'Preorder-only storefront', 'toggle', 'On = visitors can use only the private preorder, its products, cart, checkout, tracking, and policy pages'],
  ]],
  ['Store', [
    ['freeShipThreshold', 'Free shipping threshold ($)', 'number', 'US orders over this amount ship free. Set 0 to turn the free-shipping meter off everywhere'],
    ['lowStockThreshold', 'Low-stock alert level', 'number', 'Product pages say Only X left when total units fall to this number or below'],
    ['welcomeCode', 'Welcome discount code', 'text', 'Shown after email signup and in the welcome email — run scripts/setup-stripe-codes.mjs so it works at checkout'],
    ['reviewPopups', 'Review popups', 'toggle', 'Corner cards featuring your real verified reviews'],
    ['justSoldPopups', '"Just sold" popups', 'toggle', 'Corner cards from real paid orders (need orders to show)'],
  ]],
  ['Trust & policies', [
    ['returnsDays', 'Return window (days)', 'number', 'Drives every returns claim on the site — must match what you honor'],
    ['processingDays', 'Processing time (business days)', 'number', 'Drives every "ships in X days" claim — must match reality'],
    ['supportResponse', 'Support response promise', 'text', 'e.g. "within 24 hours" — general support reply time, shown in footer, contact page, product page, tracking form. Only promise what you keep'],
    ['returnsResponse', 'Returns response promise', 'text', 'e.g. "within 48 hours" — reply time on RETURN requests specifically (contact page + refund policy). Can differ from general support'],
    ['freeReturns', 'Free return shipping', 'toggle', 'ON only if you truly pay return shipping on change-of-mind returns. OFF = customer covers it (defects/wrong items are always on us either way). Drives the returns wording on product, cart, and policy pages'],
    ['payMethods', 'Accepted payment methods', 'text', 'Comma-separated, shown at cart + footer. List ONLY methods enabled in Stripe Dashboard → Payment methods (add PayPal once its Supabase secrets are set)'],
    ['payLaterNote', 'Klarna pay-in-4 note', 'toggle', 'The "4 interest-free payments" line on product + cart. Keep on only while Klarna is enabled in your Stripe dashboard'],
  ]],
  ['Founder & business proof', [
    ['founderName', 'Founder name', 'text', 'Shown only after you enter the real public-facing name.'],
    ['founderRole', 'Founder role', 'text', 'For example: Founder & Creative Director.'],
    ['founderStatement', 'Founder statement', 'textarea', 'A genuine first-person note about the brand and how the pieces are made.'],
    ['founderImage', 'Founder photograph', 'image', 'Upload a genuine founder or studio portrait.'],
    ['legalBusinessName', 'Legal business name', 'text', 'Your registered business name, shown only when entered.'],
    ['businessCity', 'Business city', 'text', 'Public city only; do not enter a home address.'],
    ['businessRegion', 'State / region', 'text', 'Public state, province, or region.'],
    ['supportPhone', 'Support phone (optional)', 'text', 'Shown only when entered and staffed.'],
    ['productionImages', 'Production photographs', 'image-list', 'Real sampling, printing, embroidery, or production photographs.'],
    ['packagingImages', 'Packaging photographs', 'image-list', 'Real packing, labels, mailers, or fulfilled-order photographs.'],
  ]],
  ['Email popup', [
    ['popupEnabled', 'Email popup', 'toggle', 'The 10%-off capture popup'],
    ['popupDelaySec', 'Popup delay (seconds)', 'number', 'How long a visitor browses before it shows'],
    ['popupTitle', 'Popup headline', 'text', 'Shown under the big 10% OFF'],
    ['popupImage', 'Popup image', 'image', 'Campaign photo on the popup left panel'],
  ]],
  ['Tracking', [
    ['metaPixelId', 'Meta Pixel ID', 'text', 'From Meta Events Manager — tracks PageView, ViewContent, AddToCart, InitiateCheckout, Purchase, Search, Lead. Leave empty to disable.'],
  ]],
  ['Contact & social', [
    ['supportEmail', 'Contact email', 'text', 'Shown across the site — the brand\'s only mailbox'],
    ['instagram', 'Instagram URL', 'text', ''],
    ['instagramHandle', 'Instagram handle', 'text', 'e.g. @darkdivine.official'],
  ]],
  ['Logos', [
    ['brand', 'Logo placement', 'brand', 'One mark per spot — the emblem and the wordmark never sit side by side.'],
  ]],
  ['Hero media', [
    ['heroVideoA', 'Hero video — Scene A', 'video', 'The looping clip behind the title. Upload or paste a URL. Keep it under 30MB — trim/compress first. Blank = the built-in broadcast clip.'],
    ['heroPosterA', 'Scene A poster', 'image', 'Still frame shown before the video loads — this is the first thing mobile visitors see, so pick a strong frame.'],
    ['heroVideoB', 'Hero video — Scene B', 'video', 'The clip revealed after the scroll “tear”. Under 30MB. Blank = built-in.'],
    ['heroPosterB', 'Scene B poster', 'image', 'Still frame for Scene B.'],
  ]],
];

export default function Settings() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);   // edits since the last draft save
  const [status, setStatus] = useState({ dirty: false, publishedAt: null }); // draft vs live
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const refreshStatus = () => adminSettingsStatus().then(setStatus).catch(() => {});
  useEffect(() => { refreshStatus(); }, []);
  // leaving with unsaved edits asks first
  useEffect(() => {
    if (!touched) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [touched]);

  async function pickImage(key, file) {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const url = await uploadProductImage(file);
      set(key, url);
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
    }
    setUploading(false);
  }

  async function pickVideo(key, file) {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const url = await uploadMedia(file);
      set(key, url);
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
    }
    setUploading(false);
  }

  async function addImage(key, file) {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const url = await uploadProductImage(file);
      setForm((current) => ({ ...current, [key]: [...(current[key] || []), url] }));
      setSaved(false);
    } catch (ex) {
      setErr(ex.message || 'Upload failed');
    }
    setUploading(false);
  }

  useEffect(() => {
    adminGetSettings().then((overrides) => setForm({
      ...DEFAULT_CONFIG,
      ...overrides,
      homepage: mergeHomepage(overrides.homepage),
    })).catch((ex) => setLoadError(ex.message));
  }, []);

  /* Never open the editor on a failed read: saving writes the whole snapshot
     back, so editing defaults here would overwrite the real saved settings. */
  if (loadError) return <LoadError error={loadError} />;
  if (!form) return <p style={{ color: 'var(--silver)' }}>Loading…</p>;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); setTouched(true); };

  /* the 4-phase drop playbook as one-click presets (then hit Save):
     Tease/Waitlist = full lock (no guest browsing), countdown collects emails.
     Early Access   = code holders enter, guests still locked out.
     Live Drop      = gate off, store open — then send the LIVE campaign.
     Off-season     = no gate, no drop language anywhere. */
  const PHASES = [
    ['Tease / Waitlist', { gateEnabled: true, gateEntryEnabled: false, gateGuestBypass: false, gateRemember: false, preorderOnlyLock: true, dropMode: true }],
    ['Early Access', { gateEnabled: true, gateEntryEnabled: true, gateGuestBypass: false, gateRemember: true, preorderOnlyLock: true, dropMode: true }],
    ['Live Drop', { gateEnabled: false, gateEntryEnabled: true, preorderOnlyLock: false, dropMode: true }],
    ['Off-season', { gateEnabled: false, gateEntryEnabled: false, preorderOnlyLock: false, dropMode: false }],
  ];
  const applyPhase = (patch) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); setTouched(true); };
  const phaseActive = (patch) => Object.entries(patch).every(([k, v]) => (form[k] ?? DEFAULT_CONFIG[k]) === v);

  /* Save writes the DRAFT. Visitors see nothing until Publish. */
  async function saveDraft() {
    setErr(''); setNotice('');
    const problems = validateSettings(form);
    if (problems.length) { setErr(problems.join(' · ')); return false; }
    // only persist keys that differ from the shipped defaults
    const patch = {};
    Object.keys(form).forEach((k) => {
      if (JSON.stringify(form[k]) !== JSON.stringify(DEFAULT_CONFIG[k])) patch[k] = form[k];
    });
    await adminReplaceSettings(patch);
    setSaved(true); setTouched(false);
    await refreshStatus();
    return true;
  }
  async function save(e) {
    e.preventDefault();
    setBusy('save');
    try { if (await saveDraft()) setNotice(isLive ? 'Draft saved — not live yet. Preview it, then Publish.' : 'Saved in this browser.'); }
    catch (ex) { setErr(ex.message || 'Save failed'); }
    setBusy('');
  }
  async function preview() {
    setBusy('preview');
    try {
      if (touched && !(await saveDraft())) { setBusy(''); return; }
      window.open('/?preview=1', '_blank', 'noopener');
      setNotice('Preview opened in a new tab — only you see the draft there.');
    } catch (ex) { setErr(ex.message || 'Could not save the draft for preview'); }
    setBusy('');
  }
  async function publish() {
    setBusy('publish');
    try {
      if (touched && !(await saveDraft())) { setBusy(''); return; }
      const at = await adminPublishSettings();
      await refreshStatus();
      setNotice(`Published ${new Date(at).toLocaleString()} — live for every visitor.`);
    } catch (ex) { setErr(ex.message || 'Publish failed'); }
    setBusy('');
  }
  async function discard() {
    if (!confirmDiscard) { setConfirmDiscard(true); return; }
    setConfirmDiscard(false); setBusy('discard');
    try {
      await adminDiscardDraft();
      const fresh = await adminGetSettings();
      setForm({ ...DEFAULT_CONFIG, ...fresh, homepage: mergeHomepage(fresh.homepage) });
      setTouched(false); await refreshStatus();
      setNotice('Draft discarded — the editor now matches the live site.');
    } catch (ex) { setErr(ex.message || 'Discard failed'); }
    setBusy('');
  }

  // datetime-local wants "YYYY-MM-DDTHH:mm" local time
  const toLocalInput = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <>
      <div className="admin-head">
        <h1 className="display">Site Settings</h1>
        <span className={`admin-mode ${isLive ? 'live' : ''}`}>{isLive ? 'LIVE — saves for all visitors' : 'DEMO — saves to this browser'}</span>
      </div>
      {!isLive && (
        <div className="note-banner">
          <b>Demo mode.</b> Settings save to this browser so you can preview changes. Connect Supabase
          and run the updated schema.sql to make them live for every visitor.
        </div>
      )}

      <div className="settings-group" style={{ marginBottom: 18 }}>
        <legend style={{ padding: 0 }}>Launch playbook</legend>
        <p style={{ fontSize: 12, color: 'var(--ad-dim, #8e939c)', margin: '6px 0 12px' }}>
          One click sets every switch for that phase of a drop — review below, then hit Save.
          Pair each phase with its campaign template: Tease collects the list, Early Access sends the code, Live Drop sends the open-doors blast.
        </p>
        <div className="filter-bar">
          {PHASES.map(([name, patch]) => (
            <button key={name} type="button" className={phaseActive(patch) ? 'sel' : ''} onClick={() => applyPhase(patch)}>{name}</button>
          ))}
        </div>
      </div>

      <form onSubmit={save} className="settings-form">
        {FIELDS.map(([group, fields]) => (
          <fieldset key={group} className="settings-group">
            <legend>{group}</legend>
            {fields.map(([key, label, type, hint]) => (
              <label key={key} className="settings-field">
                <span className="lbl">{label}</span>
                {type === 'brand' ? (
                  <BrandEditor value={form.brand} onChange={(v) => set('brand', v)} />
                ) : type === 'textarea' ? (
                  <textarea rows={3} value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
                ) : type === 'number' ? (
                  <input type="number" value={form[key] ?? 0} onChange={(e) => set(key, Number(e.target.value))} />
                ) : type === 'datetime' ? (
                  <input type="datetime-local" value={toLocalInput(form[key])}
                    onChange={(e) => e.target.value && set(key, new Date(e.target.value).toISOString())} />
                ) : type === 'image' ? (
                  <span className="img-field">
                    {form[key]
                      ? <img src={form[key]} alt="" />
                      : <span className="img-empty">No picture set</span>}
                    <span className="img-actions">
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        {uploading ? 'Uploading…' : form[key] ? 'Replace' : 'Upload'}
                        <input type="file" accept="image/*" hidden
                          onChange={(e) => pickImage(key, e.target.files?.[0])} />
                      </label>
                      {form[key] && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(key, '')}>Remove</button>}
                    </span>
                  </span>
                ) : type === 'image-list' ? (
                  <span className="image-list-field">
                    {(form[key] || []).length > 0 && <span className="image-list-previews">
                      {(form[key] || []).map((url, index) => (
                        <span className="image-list-item" key={`${url}-${index}`}>
                          <img src={url} alt="" />
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(key, form[key].filter((_, i) => i !== index))}>Remove</button>
                        </span>
                      ))}
                    </span>}
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', width: 'fit-content' }}>
                      {uploading ? 'Uploading…' : 'Add photograph'}
                      <input type="file" accept="image/*" hidden onChange={(e) => addImage(key, e.target.files?.[0])} />
                    </label>
                  </span>
                ) : type === 'video' ? (
                  <span className="img-field">
                    {form[key]
                      ? <video src={form[key]} muted loop autoPlay playsInline style={{ maxWidth: '100%', maxHeight: 130, border: '1px solid var(--line)' }} />
                      : <span className="img-empty">Using the built-in clip</span>}
                    <span className="img-actions">
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        {uploading ? 'Uploading…' : 'Upload video'}
                        <input type="file" accept="video/*" hidden
                          onChange={(e) => pickVideo(key, e.target.files?.[0])} />
                      </label>
                      {form[key] && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(key, '')}>Reset to built-in</button>}
                    </span>
                    <input type="text" inputMode="url" placeholder="…or paste a video URL" value={form[key] ?? ''}
                      onChange={(e) => set(key, e.target.value)} style={{ marginTop: 6 }} />
                  </span>
                ) : type.startsWith('choice:') ? (
                  <span className="choice-row">
                    {type.slice(7).split('|').map((opt) => (
                      <button key={opt} type="button" className={`btn btn-sm ${form[key] === opt ? '' : 'btn-ghost'}`}
                        aria-pressed={form[key] === opt} onClick={() => set(key, opt)}>{opt}</button>
                    ))}
                    <input type="text" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} aria-label={label} />
                  </span>
                ) : type === 'toggle' ? (
                  <span className="toggle-row">
                    <input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} />
                    <i>{form[key] ? 'On' : 'Off'}</i>
                  </span>
                ) : (
                  <input type="text" value={form[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
                )}
                {hint && <small>{hint}</small>}
              </label>
            ))}
          </fieldset>
        ))}
        <div className="admin-head" style={{ marginTop: 12 }}>
          <h2 className="display">Homepage Content</h2>
          <span className="admin-mode">{HOMEPAGE_FIELD_GROUPS.length} editable sections</span>
        </div>
        <p className="note-banner">
          Change every static homepage title, paragraph, button, image, video, poster, list, and FAQ here.
          Product cards still come from Products, and customer reviews still come from Reviews.
        </p>
        <HomepageEditor value={form.homepage} onChange={(homepage) => set('homepage', homepage)} onError={setErr} />
        <div className="publish-bar" role="region" aria-label="Save and publish">
          <span className={`pill ${touched ? '' : status.dirty ? 'info' : 'ok'}`}>
            {touched ? 'Unsaved edits' : status.dirty ? 'Draft has unpublished changes' : 'Everything is published'}
          </span>
          <button className="btn btn-ghost btn-sm" type="submit" disabled={Boolean(busy)}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
          {isLive && <button className="btn btn-ghost btn-sm" type="button" onClick={preview} disabled={Boolean(busy)}>{busy === 'preview' ? 'Opening…' : 'Preview'}</button>}
          {isLive && (
            <button className="btn btn-sm" type="button" onClick={publish} disabled={Boolean(busy) || (!touched && !status.dirty)}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
          {isLive && status.dirty && !touched && (
            <button className="btn btn-ghost btn-sm" type="button" onClick={discard} disabled={Boolean(busy)}>
              {confirmDiscard ? 'Click again to discard' : 'Discard draft'}
            </button>
          )}
          {status.publishedAt && <small>Last published {new Date(status.publishedAt).toLocaleString()}</small>}
          {notice && <span className="pb-notice" role="status">{notice}</span>}
          {err && <span className="pb-err" role="alert">{err}</span>}
        </div>
      </form>
    </>
  );
}

/* Blocks a save that would put something broken in front of customers. */
function validateSettings(f) {
  const out = [];
  const num = (k, min, label) => {
    if (f[k] !== '' && f[k] != null && (Number.isNaN(Number(f[k])) || Number(f[k]) < min)) out.push(`${label} must be ${min} or more`);
  };
  num('freeShipThreshold', 0, 'Free shipping threshold');
  num('returnsDays', 0, 'Return window');
  num('processingDays', 0, 'Processing time');
  num('popupDelaySec', 0, 'Popup delay');
  if (f.dropDate && Number.isNaN(Date.parse(f.dropDate))) out.push('Drop date is not a valid date');
  if (f.saleEndsAt && Number.isNaN(Date.parse(f.saleEndsAt))) out.push('Sale end is not a valid date');
  if (f.supportEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.supportEmail)) out.push('Contact email looks wrong');
  if (f.instagram && !/^https?:\/\//.test(f.instagram)) out.push('Instagram URL must start with https://');
  return out;
}
