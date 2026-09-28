// Sandbox by default. For real money set MOMO_ENV=mtnuganda (needs MTN MoMo *production* keys).
const PROD = process.env.MOMO_ENV === 'mtnuganda';
export const LIVE = PROD;
const BASE = PROD ? 'https://proxy.momoapi.mtn.com' : 'https://sandbox.momodeveloper.mtn.com';
const CUR = PROD ? 'UGX' : 'EUR'; // sandbox only accepts EUR
const KEY = () => process.env.MTN_PRIMARY_KEY;

async function token() {
  const r = await fetch(`${BASE}/collection/token/`, { method: 'POST', headers: {
    'Ocp-Apim-Subscription-Key': KEY(),
    Authorization: 'Basic ' + Buffer.from(process.env.MTN_USER_ID + ':' + process.env.MTN_API_KEY).toString('base64') } });
  if (!r.ok) throw new Error('MTN token error ' + r.status);
  return (await r.json()).access_token;
}
const hdr = t => ({ Authorization: 'Bearer ' + t, 'X-Target-Environment': PROD ? 'mtnuganda' : 'sandbox', 'Ocp-Apim-Subscription-Key': KEY() });

export async function requestToPay(ref, amount, phone, name, callback) {
  const t = await token();
  const r = await fetch(`${BASE}/collection/v1_0/requesttopay`, { method: 'POST',
    headers: { ...hdr(t), 'X-Reference-Id': ref, 'Content-Type': 'application/json', ...(PROD && callback ? { 'X-Callback-Url': callback } : {}) },
    body: JSON.stringify({ amount: String(amount), currency: CUR, externalId: ref,
      payer: { partyIdType: 'MSISDN', partyId: phone }, payerMessage: name.slice(0, 40), payeeNote: 'MUKI ' + name.slice(0, 30) }) });
  if (r.status !== 202) throw new Error('MTN rejected request (' + r.status + ')');
}
export async function status(ref) {
  const r = await fetch(`${BASE}/collection/v1_0/requesttopay/${ref}`, { headers: hdr(await token()) });
  if (!r.ok) throw new Error('MTN status error ' + r.status);
  return (await r.json()).status; // PENDING | SUCCESSFUL | FAILED
}
