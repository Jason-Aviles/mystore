import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('support requests have RLS with no anonymous table access', async () => {
  const schema = await read('supabase/schema.sql');
  assert.match(schema, /create table if not exists support_requests/i);
  assert.match(schema, /alter table support_requests enable row level security/i);
  assert.match(schema, /revoke all on table support_requests from anon/i);
  assert.match(schema, /create policy "admin all support requests"[\s\S]*to authenticated/i);
  assert.doesNotMatch(schema, /create policy "public[^\n]*support requests"/i);
});

test('support creation runs through a server-side Edge Function', async () => {
  const edge = await read('supabase/functions/create-support-request/index.ts');
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /from\('support_requests'\)\.insert/);
  assert.match(edge, /DD-/);
  assert.match(edge, /too_many_requests/);
  assert.doesNotMatch(edge, /select\('\*'\)/);
});

test('storefront and admin data layers expose the support interfaces', async () => {
  const [support, admin] = await Promise.all([
    read('src/lib/support.js'),
    read('src/admin/adminData.js'),
  ]);
  assert.match(support, /export async function createSupportRequest/);
  assert.match(support, /functions\.invoke\('create-support-request'/);
  assert.match(admin, /export async function adminListSupportRequests/);
  assert.match(admin, /export async function adminUpdateSupportRequest/);
});
