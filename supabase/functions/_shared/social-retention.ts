import { graph } from "./social-publishing.ts";
import { credential, dbData } from "./social-worker.ts";
export function instagramMediaItems(media: any) {
  const items =
    media.media_type === "CAROUSEL_ALBUM"
      ? media.children?.data || []
      : [media];
  return items.filter(
    (m: any) =>
      typeof m.media_url === "string" && m.media_url.startsWith("https://"),
  );
}
export async function remotePublication(db: any, job: any, provider = graph) {
  const a = await credential(db, job.client_id);
  if (a.instagram_id !== job.instagram_id)
    throw new Error(
      "Reconecte o perfil original para consultar esta publicação. O link do histórico continua disponível.",
    );
  if (job.status !== "published" || !job.media_id)
    throw new Error("A publicação ainda não possui confirmação consultável.");
  return provider(
    a.token,
    "/" +
      job.media_id +
      "?fields=id,media_type,media_url,thumbnail_url,permalink,children%7Bid,media_type,media_url,thumbnail_url%7D",
  );
}
export async function cleanPublishedVideos(db: any, provider = graph) {
  const jobs = dbData(
    await db
      .from("social_publications")
      .select("*")
      .eq("status", "published")
      .not("media_id", "is", null)
      .is("media_removed_at", null)
      .lt("updated_at", new Date(Date.now() - 3600000).toISOString())
      .or(
        "cleanup_checked_at.is.null,cleanup_checked_at.lt." +
          new Date(Date.now() - 3600000).toISOString(),
      )
      .limit(3),
  );
  let removed = 0;
  for (const job of jobs || []) {
    const update = (values: any) =>
      db.from("social_publications").update(values).eq("id", job.id);
    dbData(await update({ cleanup_checked_at: new Date().toISOString() }));
    const videos = job.snapshot.assets.filter((a: any) =>
      a.type.startsWith("video/"),
    );
    if (!videos.length) {
      dbData(await update({ media_removed_at: new Date().toISOString() }));
      continue;
    }
    try {
      const media = await remotePublication(db, job, provider);
      if (
        instagramMediaItems(media).filter((m: any) => m.media_type === "VIDEO")
          .length !== videos.length
      )
        throw new Error(
          "Vídeo ainda não disponível para consulta no Instagram. Cópia preservada.",
        );
      const paths = dbData(
        await db.rpc("social_reserve_cleanup", { j: job.id }),
      ) as string[];
      if (!paths.length) {
        dbData(
          await update({
            cleanup_error:
              "Vídeo preservado porque outro conteúdo ainda utiliza este arquivo.",
          }),
        );
        continue;
      }
      if (
        paths.some(
          (p) => !p.startsWith(job.client_id + "/") || p.includes(".."),
        )
      )
        throw new Error("Caminho de mídia inválido.");
      dbData(await db.storage.from("social-assets").remove(paths));
      dbData(await db.rpc("social_complete_cleanup", { j: job.id }));
      removed += paths.length;
    } catch (e) {
      dbData(
        await update({
          cleanup_error:
            e instanceof Error
              ? e.message
              : "Não foi possível limpar a cópia. Ela será preservada para nova tentativa.",
        }),
      );
    }
  }
  return removed;
}
