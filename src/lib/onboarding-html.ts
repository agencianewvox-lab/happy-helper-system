import type { OnboardingDeck } from "./onboarding-presentation";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Offline document: no API calls, raw form payload, executable client input or external assets.
export function buildOnboardingHtml(deck: OnboardingDeck, logo: string) {
  const image = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? `<img src="${logo}" alt="Newvox">` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Newvox · ${escape(deck.clientName)}</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:80px}body{margin:0;background:#070e1c;color:#edf5ff;font-family:Arial,sans-serif}header{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:16px;background:#070e1cf5;border-bottom:1px solid #243653;padding:12px 5vw}header img{width:64px;height:44px;object-fit:cover;border-radius:8px}header strong{font-size:18px}header small{color:#8ba4c6;font-size:10px;letter-spacing:.15em}nav{padding:20px 5vw;display:flex;flex-wrap:wrap;gap:10px;border-bottom:1px solid #243653}a{color:#8bdfff;text-decoration:none;font-size:12px;border:1px solid #294461;border-radius:24px;padding:10px 15px}a:hover,a:focus{background:#163955}section{min-height:90vh;padding:8vh 8vw;max-width:1500px;margin:auto;display:flex;flex-direction:column;justify-content:center;border-bottom:1px solid #243653;background:radial-gradient(ellipse at top right,#12316040,transparent 70%)}.kicker{font-size:11px;letter-spacing:.18em;color:#63cbff;text-transform:uppercase}h1,h2{font-size:clamp(34px,5vw,74px);line-height:1.08;letter-spacing:-.05em;max-width:1100px;margin:24px 0;overflow-wrap:anywhere}p{line-height:1.7;color:#a8b9d0;max-width:850px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:25px 0}article{background:linear-gradient(140deg,#14243a,#0d182a);border:1px solid #263b58;border-radius:16px;padding:25px;min-width:0}article h3{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#87adce;margin:0 0 16px}article p{color:#edf5ff;font-size:clamp(16px,1.6vw,23px);margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.pending{border-style:dashed}.pending small{display:block;color:#8ebbd9;font-size:11px;margin-top:12px}.source{font-size:11px;color:#8196b1}.next{align-self:flex-start;margin-top:20px}footer{padding:28px 8vw;color:#8196b1;font-size:12px}@media(max-width:650px){.grid{grid-template-columns:1fr}section{padding:35px 6vw}header small{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{header{position:static}nav,.next{display:none}section{break-before:page;min-height:0}body{print-color-adjust:exact}}
</style></head><body><header>${image}<strong>NEWVOX</strong><small>CLIENT EXPERIENCE / ONBOARDING</small></header><nav aria-label="Capítulos">${deck.chapters.map((c, i) => `<a href="#capitulo-${i}">${String(i + 1).padStart(2, "0")} ${escape(c.label)}</a>`).join("")}</nav>${deck.chapters.map((c, i) => `<section id="capitulo-${i}"><div class="kicker">${String(i + 1).padStart(2, "0")} / ${deck.chapters.length} · ${escape(c.label)}</div><${i === 0 ? "h1" : "h2"}>${escape(c.title)}</${i === 0 ? "h1" : "h2"}><p>${escape(c.description)}</p><div class="grid">${c.facts.map(f => `<article${f.missing ? ' class="pending"' : ""}><h3>${escape(f.label)}</h3><p>${escape(f.value)}</p>${f.missing ? "<small>Ponto para alinharmos</small>" : ""}</article>`).join("")}</div><p class="source">${c.kind === "agenda" ? "Plano de reunião · Confirme escopo, responsáveis e datas antes de executar." : `Briefing recebido em ${escape(deck.submittedAt)} · Informações declaradas pelo cliente.`}</p>${i < deck.chapters.length - 1 ? `<a class="next" href="#capitulo-${i + 1}">Próximo capítulo →</a>` : '<a class="next" href="#capitulo-0">Voltar ao início ↑</a>'}</section>`).join("")}<footer>NEWVOX · ${escape(deck.clientName)} · Material de alinhamento. Metas não são garantia de resultados.</footer></body></html>`;
}

export async function downloadOnboardingHtml(deck: OnboardingDeck, logoUrl: string) {
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("Não foi possível carregar a marca.");
  const blob = await response.blob();
  const logo = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const url = URL.createObjectURL(new Blob([buildOnboardingHtml(deck, logo)], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Newvox-onboarding-${deck.clientName.replace(/[^\p{L}\p{N} -]/gu, "").slice(0, 80) || "cliente"}.html`;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Keep the blob alive while browsers scan/save a document with an embedded logo.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
