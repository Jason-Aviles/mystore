/* Shown when a LIVE Supabase read fails.

   The panel used to swallow these errors and render an empty table, which is
   indistinguishable from "nothing here yet" — or, on Products, silently fell
   back to the bundled seed catalog while the header still read "LIVE". Any
   admin page that loads rows should render this above its table. */
export default function LoadError({ error }) {
  if (!error) return null;
  return (
    <div className="note-banner warn">
      <b>This page could not load its live data.</b> {error}
      <div style={{ marginTop: 6 }}>
        Treat what's shown below as incomplete. Usual causes: your account isn't
        allowed through the table's row-level security policy, the table is missing
        from this Supabase project, or the project is paused.
      </div>
    </div>
  );
}
