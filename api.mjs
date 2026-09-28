import { getStore } from '@netlify/blobs';
import { requestToPay, status, LIVE } from '../lib/momo.mjs';
import { runCycle } from '../lib/cycle.mjs';
export const config = { path: '/api/*' };
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const all = async s => { const { blobs } = await s.list(); return Promise.all(blobs.map(b => s.get(b.key, { type: 'json' }))); };

// Ask MTN for the truth, and record the sale if (and only if) MTN says SUCCESSFUL.
async function settle(ref, tx, led) {
  const t = await tx.get(ref, { type: 'json' });
  if (!t) return null;
  const s = await status(ref);
  if (s === 'SUCCESSFUL' && !(await led.get(ref)))
    await led.setJSON(ref, { ref, business: t.biz, amount: t.amount, customer: t.phone.slice(0, 5) + '****' + t.phone.slice(-3), time: Date.now(), live: LIVE, method: 'MoMo' });
  return s;
}

export default async req => {
  const u = new URL(req.url), p = u.pathname.replace('/api/', '');
  const biz = getStore('businesses'), tx = getStore('tx'), led = getStore('ledger');
  try {
    if (p === 'businesses') return J((await all(biz)).sort((a, b) => b.created - a.created));
    if (p === 'business') { const b = await biz.get(u.searchParams.get('id') || 'x', { type: 'json' }); return b ? J(b) : J({ error: 'Business not found' }, 404); }
    if (p === 'ledger') { // catch sales where the customer approved but closed the page
      const done = new Set((await led.list()).blobs.map(b => b.key));
      const { blobs } = await tx.list();
      await Promise.all(blobs.filter(b => !done.has(b.key)).map(async b => {
        const t = await tx.get(b.key, { type: 'json' });
        if (t && Date.now() - t.created < 864e5) await settle(b.key, tx, led).catch(() => {});
      }));
    }
    if (p === 'ledger') return J({ live: LIVE, sales: (await all(led)).sort((a, b) => b.time - a.time) });

    if (p === 'pay' && req.method === 'POST') {
      const { bizId, phone } = await req.json();
      const b = await biz.get(String(bizId), { type: 'json' }); // price comes from the server, never the browser
      if (!b) return J({ error: 'Business not found' }, 404);
      if (!/^256(76|77|78|39)\d{7}$/.test(phone || '')) return J({ error: 'Enter an MTN number like 256772123456' }, 400);
      const ref = crypto.randomUUID();
      await requestToPay(ref, b.price, phone, b.name, u.origin + '/api/callback');
      await tx.setJSON(ref, { ref, bizId: b.id, biz: b.name, amount: b.price, phone, created: Date.now() });
      return J({ ref });
    }
    if (p === 'status') {
      const s = await settle(u.searchParams.get('ref') || 'x', tx, led);
      return s ? J({ status: s }) : J({ error: 'Unknown payment' }, 404);
    }
    if (p === 'callback') { // MTN webhook (production). The body is never trusted: we re-check with MTN.
      const b = await req.json().catch(() => ({}));
      if (b.externalId) await settle(String(b.externalId), tx, led).catch(() => {});
      return J({ ok: true });
    }
    if (p === 'run' && req.method === 'POST') {
      if (!process.env.ADMIN_TOKEN || req.headers.get('x-admin') !== process.env.ADMIN_TOKEN) return J({ error: 'Wrong admin token' }, 403);
      const { idea } = await req.json().catch(() => ({}));
      return J(await runCycle(idea));
    }
    return J({ error: 'Not found' }, 404);
  } catch (e) { return J({ error: e.message }, 500); }
};
