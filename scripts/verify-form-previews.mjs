import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
for (const [kind, route] of [['onboarding', '/onboardingnv/:path*'], ['nps', '/pesquisa-nps/:path*']]) {
  const html = await readFile(new URL(`dist/form-${kind}.html`, root), 'utf8');
  assert.equal(config.rewrites.find(item => item.source === route)?.destination, `/form-${kind}.html`);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.ok(html.includes(`https://paineldecontrole.newvox.site/share/${kind}-v1.jpg`));
  assert.ok(html.includes('content="image/jpeg"'));
  assert.ok(html.includes('content="1200"') && html.includes('content="630"'));
  assert.ok(html.includes('id="root"') && html.includes('type="module"'));
  assert.ok(!html.includes('lovable.app') && !html.includes('Customer Success'));
  const image = await readFile(new URL(`dist/share/${kind}-v1.jpg`, root));
  assert.equal(image.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.ok(image.length < 300000, 'Keep cards lightweight');
}
console.log('PASS: both static previews, routing, app entry, domain and image formats.');
