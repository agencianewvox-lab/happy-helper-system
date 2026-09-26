import { readFile, writeFile, access } from 'node:fs/promises';

// Serve metadata in the initial HTML: WhatsApp does not need to execute React.
// These pages reuse the exact built app and never contain customer information.
const template = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const previews = [
  { name: 'onboarding', title: 'Seu próximo passo começa aqui | New Vox', description: 'Vamos conhecer o seu negócio. Preencha seu onboarding com tranquilidade, sem precisar de login.' },
  { name: 'nps', title: 'Sua opinião faz a diferença | New Vox', description: 'Conte como está sendo sua experiência com a New Vox. Uma pesquisa simples para evoluirmos juntos.' },
];
for (const item of previews) {
  await access(new URL(`../public/share/${item.name}-v1.jpg`, import.meta.url));
  const html = template
    .replace(/<title>.*?<\/title>/, `<title>${item.title}</title>`)
    .replace(/<meta (?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g, '')
    .replace('</head>', `
    <meta name="description" content="${item.description}" />
    <meta property="og:site_name" content="New Vox" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${item.title}" />
    <meta property="og:description" content="${item.description}" />
    <meta property="og:image" content="https://paineldecontrole.newvox.site/share/${item.name}-v1.jpg" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${item.title}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${item.title}" />
    <meta name="twitter:description" content="${item.description}" />
    <meta name="twitter:image" content="https://paineldecontrole.newvox.site/share/${item.name}-v1.jpg" />
  </head>`);
  if (!html.includes('type="module"') || !html.includes('id="root"')) throw new Error('Built app entry is missing');
  await writeFile(new URL(`../dist/form-${item.name}.html`, import.meta.url), html);
}
console.log('Public form metadata generated: onboarding + NPS.');
