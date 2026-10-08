export const statusLabels = {
  draft: "Ideia",
  production: "Em produção",
  review: "Em revisão",
  changes: "Ajustes",
  approved: "Aprovado",
  published_manual: "Publicado manualmente",
  cancelled: "Cancelado",
} as const;
export type SocialStatus = keyof typeof statusLabels;
export const formatLabels = {
  image: "Imagem",
  carousel: "Carrossel",
  reel: "Reel",
  story: "Story",
} as const;
export type SocialAsset = {
  path: string;
  name: string;
  type: string;
  size: number;
  url?: string;
};
export type SocialPost = {
  id: string;
  client_id: string;
  title: string;
  format: keyof typeof formatLabels;
  briefing: string;
  caption: string;
  assets: SocialAsset[];
  scheduled_at: string | null;
  status: SocialStatus;
  version: number;
  approved_at: string | null;
  publication_url: string | null;
  updated_at: string;
};
export function contentInput(raw: Record<string, unknown>, clientId: string) {
  const title = String(raw.title || "").trim();
  const format = String(raw.format || "image");
  if (!title || title.length > 160)
    throw new Error("Informe um título de até 160 caracteres.");
  if (!Object.prototype.hasOwnProperty.call(formatLabels, format))
    throw new Error("Formato inválido.");
  const briefing = String(raw.briefing || ""),
    caption = String(raw.caption || "");
  if (briefing.length > 10000 || caption.length > 2200)
    throw new Error("Briefing: até 10.000 caracteres. Legenda: até 2.200.");
  const source = raw.assets ?? [];
  if (!Array.isArray(source) || source.length > 20)
    throw new Error("Selecione até 20 arquivos.");
  const assets = source.map((a: Record<string, unknown>) => {
    if (!a || typeof a !== "object") throw new Error("Arquivo inválido.");
    const path = String(a.path || "");
    if (
      !path.startsWith(clientId + "/") ||
      path.includes("..") ||
      !/^[a-zA-Z0-9/_.-]+$/.test(path)
    )
      throw new Error("Arquivo fora da biblioteca deste cliente.");
    const type = String(a.type || "");
    if (
      ![
        "image/jpeg",
        "image/png",
        "image/webp",
        "video/mp4",
        "video/quicktime",
      ].includes(type)
    )
      throw new Error("Tipo de arquivo não suportado.");
    const size = Number(a.size);
    if (!Number.isInteger(size) || size <= 0 || size > 50 * 1024 * 1024)
      throw new Error("Cada arquivo deve ter até 50 MB.");
    return {
      path,
      name: String(a.name || "Arquivo").slice(0, 200),
      type,
      size,
    };
  });
  const date = raw.scheduled_at ? String(raw.scheduled_at) : null;
  if (date && !Number.isFinite(Date.parse(date)))
    throw new Error("Data inválida.");
  return {
    title,
    format,
    briefing,
    caption,
    assets,
    scheduled_at: date ? new Date(date).toISOString() : null,
  };
}
export function transition(
  current: SocialStatus,
  next: SocialStatus,
  canApprove: boolean,
  post: { assets: unknown[]; publication_url?: unknown },
) {
  const allowed: Record<SocialStatus, SocialStatus[]> = {
    draft: ["production", "review", "cancelled"],
    production: ["draft", "review", "cancelled"],
    review: ["changes", "approved", "cancelled"],
    changes: ["production", "review", "cancelled"],
    approved: ["review", "published_manual", "cancelled"],
    published_manual: [],
    cancelled: ["draft"],
  };
  if (!allowed[current]?.includes(next))
    throw new Error("Esta mudança de etapa não é permitida.");
  if (["approved", "published_manual"].includes(next) && !canApprove)
    throw new Error("Peça a aprovação ao gestor ou Master.");
  if (["approved", "published_manual"].includes(next) && !post.assets.length)
    throw new Error("Adicione os arquivos antes da aprovação.");
  if (next === "published_manual") {
    let url: URL;
    try {
      url = new URL(String(post.publication_url || ""));
    } catch {
      throw new Error("Informe o link da publicação no Instagram.");
    }
    if (
      url.protocol !== "https:" ||
      !["www.instagram.com", "instagram.com"].includes(url.hostname) ||
      !/^\/(p|reel|stories)\/[a-zA-Z0-9_.-]+\/?/.test(url.pathname)
    )
      throw new Error("Use o link https da publicação no Instagram.");
  }
  return next;
}
