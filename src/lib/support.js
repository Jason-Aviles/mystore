import { hasSupabase, supabase } from './supabase';

const DEMO_KEY = 'dd_demo_support_requests';
const KINDS = new Set(['message', 'tracking', 'return', 'order_issue']);

function demoTickets() {
  try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || []; } catch { return []; }
}

function demoReference() {
  const date = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `DD-${date}-${suffix}`;
}

export function normalizeSupportRequest(payload) {
  const normalized = {
    kind: String(payload?.kind ?? '').trim(),
    name: String(payload?.name ?? '').trim().slice(0, 100),
    email: String(payload?.email ?? '').trim().toLowerCase().slice(0, 320),
    orderNumber: String(payload?.orderNumber ?? '').trim().slice(0, 80),
    subject: String(payload?.subject ?? '').trim().slice(0, 160),
    message: String(payload?.message ?? '').trim().slice(0, 4000),
  };
  if (!KINDS.has(normalized.kind)) throw new Error('Choose a valid request type.');
  if (!normalized.name) throw new Error('Enter your name.');
  if (!normalized.email.includes('@') || normalized.email.startsWith('@') || normalized.email.endsWith('@')) {
    throw new Error('Enter a valid email address.');
  }
  if (!normalized.message) throw new Error('Tell us how we can help.');
  return normalized;
}

export async function createSupportRequest(payload) {
  const request = normalizeSupportRequest(payload);
  if (hasSupabase) {
    const { data, error } = await supabase.functions.invoke('create-support-request', {
      body: {
        kind: request.kind,
        name: request.name,
        email: request.email,
        order_number: request.orderNumber || null,
        subject: request.subject || null,
        message: request.message,
      },
    });
    if (error || !data?.ok || !data?.reference) {
      const reason = data?.error === 'too_many_requests'
        ? 'Too many requests were sent. Wait two minutes and try again.'
        : 'Your request could not be saved. Try again.';
      throw new Error(reason);
    }
    return { reference: data.reference };
  }

  const reference = demoReference();
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    reference,
    kind: request.kind,
    name: request.name,
    email: request.email,
    order_number: request.orderNumber || null,
    subject: request.subject || null,
    message: request.message,
    status: 'new',
    internal_note: '',
    created_at: now,
    updated_at: now,
  };
  localStorage.setItem(DEMO_KEY, JSON.stringify([row, ...demoTickets()]));
  return { reference };
}

export { DEMO_KEY as SUPPORT_DEMO_KEY };
