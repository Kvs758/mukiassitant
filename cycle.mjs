import { getStore } from '@netlify/blobs';
// One real AI cycle: the CEO agent picks/plans a business and the specialist agents write their deliverables.
export async function runCycle(idea) {
  const biz = getStore('businesses');
  const { blobs } = await biz.list();
  const names = (await Promise.all(blobs.map(b => biz.get(b.key, { type: 'json' })))).map(b => b.name);
  const prompt = `You are the CEO agent of MUKI, an autonomous company in Kampala, Uganda that sells online and is paid by MTN MoMo (UGX). ` +
    (idea ? `Build this business: ${idea}.` : `Pick ONE new small business sellable online this week, different from: ${names.join('; ') || 'none'}.`) +
    ` Act as research, planner, ads, social, sales and support agents. Be realistic and specific to Uganda. Return ONLY JSON with keys: name, desc, price_ugx (integer 2000-100000), research, plan, ad_copy, social_post, sales_dm, support_faq.`;
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) throw new Error('AI error ' + r.status);
  const text = (await r.json()).content.map(c => c.text || '').join('');
  const j = JSON.parse(text.replace(/```json|```/g, '').trim());
  const id = crypto.randomUUID();
  const b = { id, name: String(j.name).slice(0, 80), desc: String(j.desc).slice(0, 300),
    price: Math.min(100000, Math.max(2000, parseInt(j.price_ugx) || 11000)), created: Date.now(),
    work: { research: j.research, plan: j.plan, ad_copy: j.ad_copy, social_post: j.social_post, sales_dm: j.sales_dm, support_faq: j.support_faq } };
  await biz.setJSON(id, b);
  return b;
}
