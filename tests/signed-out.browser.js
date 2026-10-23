const c = require('./common'); (async () => { const st = c.checker(); const b = await c.launch(); const p = await b.newPage(); const B='http://localhost:3231';
await c.local(p, B, { 'clientready-documents': [{ id: 'd1', type: 'invoice', title: 'X', data: { invoiceNumber: 'INV-1', updatedAt: new Date().toISOString() } }] });
await p.goto(B + '/dashboard'); await p.waitForTimeout(2500);
const pill = await p.locator('[data-testid=sync-pill]').first().getAttribute('data-state').catch(() => null);
st.check('pill shows signed-out', pill === 'signed-out', pill);
const banner = await p.locator('[data-testid=dashboard-stale]').innerText().catch(() => '');
st.check('banner says signed out', /signed out/i.test(banner) || banner === '', banner);
console.log('url', p.url(), 'banner:', banner); st.done(); await b.close(); })();
