import { runCycle } from '../lib/cycle.mjs';
export const config = { schedule: '0 23 * * *' }; // 23:00 UTC = 2 AM Kampala
export default async () => { const b = await runCycle(); console.log('[MUKI 2AM] Built:', b.name); };
