import type { SocialPost } from "./social-model.ts";
export class InstagramError extends Error {
  constructor(
    public code: number,
    public uncertain = false,
  ) {
    super(
      code === 190
        ? "Autorização expirada. Reconecte o Instagram."
        : code === 10 || code === 200
          ? "A Meta não liberou esta permissão para a conta. Reconecte ou revise o acesso do aplicativo."
          : code === 4 || code === 32 || code === 613
            ? "Limite temporário do Instagram. Tente mais tarde."
            : "O Instagram não aceitou esta operação. Confira formato, conexão e permissões. Código " +
              code,
    );
  }
}
export async function graph(
  token: string,
  path: string,
  body?: Record<string, unknown>,
  request: typeof fetch = fetch,
) {
  if (!/^\/[A-Za-z0-9_/?=&%,.:-]+$/.test(path) || path.includes(".."))
    throw new Error("Consulta Instagram inválida.");
  let response: Response;
  try {
    response = await request("https://graph.instagram.com/v26.0" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new InstagramError(0, true);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new InstagramError(0, true);
  }
  if (!response.ok || data.error)
    throw new InstagramError(
      Number(data.error?.code) || response.status,
      response.status >= 500,
    );
  return data;
}
export function publishIssues(
  post: Pick<SocialPost, "format" | "assets" | "caption">,
  account: { account_type: string; can_publish: boolean; expires_at: string },
) {
  const errors: string[] = [];
  if (!account.can_publish)
    errors.push("Reconecte e autorize a publicação no Instagram.");
  if (Date.parse(account.expires_at) <= Date.now())
    errors.push("A conexão expirou. Reconecte o Instagram.");
  if (post.format === "story" && account.account_type !== "BUSINESS")
    errors.push("Stories pela API exigem uma conta Instagram do tipo Empresa.");
  if (
    post.format === "carousel"
      ? post.assets.length < 2 || post.assets.length > 10
      : post.assets.length !== 1
  )
    errors.push(
      post.format === "carousel"
        ? "O carrossel pela API deve ter de 2 a 10 arquivos."
        : "Selecione um arquivo para este formato.",
    );
  if (post.caption.length > 2200)
    errors.push("A legenda pode ter até 2.200 caracteres.");
  for (const a of post.assets) {
    const video = a.type.startsWith("video/");
    if (!video && a.type !== "image/jpeg")
      errors.push("Converta as imagens para JPG no envio de arquivos.");
    if (post.format === "reel" && !video) errors.push("Reels exigem um vídeo.");
    if (post.format === "image" && video)
      errors.push("Use Reel para vídeo no feed.");
    if (
      a.size >
      (video ? (post.format === "story" ? 100 : 1024) : 8) * 1024 * 1024
    )
      errors.push(
        video
          ? "Vídeo acima do limite deste formato."
          : "A imagem deve ter até 8 MB.",
      );
    if (
      video &&
      a.duration &&
      (a.duration < 3 || a.duration > (post.format === "reel" ? 900 : 60))
    )
      errors.push(
        "Duração permitida: 3 a " +
          (post.format === "reel" ? "900" : "60") +
          " segundos.",
      );
  }
  return [...new Set(errors)];
}
export function containerBody(
  post: SocialPost,
  asset: { type: string },
  url: string,
  child = false,
) {
  const video = asset.type.startsWith("video/");
  const body: Record<string, unknown> = {};
  if (video) {
    body.video_url = url;
    body.media_type = child
      ? "VIDEO"
      : post.format === "story"
        ? "STORIES"
        : "REELS";
  } else {
    body.image_url = url;
    if (post.format === "story") body.media_type = "STORIES";
  }
  if (child) body.is_carousel_item = true;
  else if (post.format !== "story") {
    body.caption = post.caption;
    if (video) body.share_to_feed = true;
  }
  return body;
}
export function reportRange(from: unknown, to: unknown) {
  const f = String(from || ""),
    t = String(to || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t))
    throw new Error("Escolha o início e o fim do período.");
  const start = Date.parse(f + "T00:00:00-03:00"),
    end = Date.parse(t + "T23:59:59-03:00");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    new Date(start).toISOString().slice(0,10) !== f ||
    new Date(end-3*3600000).toISOString().slice(0,10) !== t ||
    end < start ||
    end - start > 90 * 86400000
  )
    throw new Error("Selecione um período de até 90 dias.");
  return {
    from: f,
    to: t,
    start: Math.floor(start / 1000),
    end: Math.floor(end / 1000),
  };
}
