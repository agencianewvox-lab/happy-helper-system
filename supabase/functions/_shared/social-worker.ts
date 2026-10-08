import { graph, InstagramError } from "./social-publishing.ts";
import { containerBody } from "./social-publishing.ts";
// Database client stays server-side; the worker persists every external boundary.
type Db = any;
export const dbData = (r: any) => {
  if (r.error) throw new Error("Não foi possível atualizar a publicação.");
  return r.data;
};
export async function credential(db: Db, c: string) {
  let a = dbData(await db.rpc("social_credential", { c }));
  if (!a) throw new Error("Conecte o Instagram deste cliente.");
  if (Date.parse(a.expires_at) <= Date.now())
    throw new Error("Autorização expirada. Reconecte.");
  if (Date.parse(a.expires_at) - Date.now() < 7 * 86400000) {
    try {
      const u = new URL("https://graph.instagram.com/refresh_access_token");
      u.search = new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: a.token,
      }).toString();
      const r = await fetch(u, {
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      const v = await r.json();
      if (
        !r.ok ||
        typeof v.access_token !== "string" ||
        !Number.isFinite(v.expires_in) ||
        v.expires_in <= 0
      )
        throw new Error();
      const ok = dbData(
        await db.rpc("social_refresh_token", {
          c,
          bound: a.connected_at,
          t: v.access_token,
          e: new Date(Date.now() + v.expires_in * 1000).toISOString(),
        }),
      );
      if (!ok) throw new Error();
      a = { ...a, token: v.access_token };
    } catch {
      /* Existing unexpired token can still be used; UI surfaces expiry. */
    }
  }
  return a;
}
export async function processPublication(db: Db, job: any, provider = graph) {
  const update = async (values: any) =>
    dbData(
      await db
        .from("social_publications")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("lock_token", job.lock_token)
        .select("id")
        .maybeSingle(),
    );
  const release = async (values: any) =>
    update({
      next_attempt_at: new Date(Date.now() + 60000).toISOString(),
      ...values,
      locked_until: null,
    });
  const finished = async (id: string | null, permalink: string | null) => {
    dbData(
      await db.rpc("social_finish_publication", {
        j: job.id,
        l: job.lock_token,
        m: id,
        p: permalink,
      }),
    );
  };
  let publishStarted = job.status === "uncertain";
  try {
    const a = await credential(db, job.client_id);
    if (
      a.instagram_id !== job.instagram_id ||
      a.connected_at !== job.connected_at
    )
      throw new Error("A conexão mudou. Revise e agende novamente.");
    if (job.status === "uncertain") {
      if (!job.root_container) return;
      const status = await provider(
        a.token,
        "/" + job.root_container + "?fields=status_code",
      );
      if (status.status_code === "PUBLISHED")
        await finished(job.media_id || null, job.permalink || null);
      else
        await release({
          status: "uncertain",
          next_attempt_at: new Date(Date.now() + 5 * 60000).toISOString(),
          error: "Confirmação pendente. Não reenviar para evitar duplicação.",
        });
      return;
    }
    if (
      !dbData(
        await db.rpc("social_actor_allowed", {
          c: job.client_id,
          u: job.actor_id,
        }),
      )
    )
      throw new Error("O responsável não tem mais acesso a este cliente.");
    const post = dbData(
      await db
        .from("social_posts")
        .select("version,status")
        .eq("id", job.post_id)
        .single(),
    );
    if (post.version !== job.post_version || post.status !== "approved")
      throw new Error("A versão aprovada mudou. Revise o conteúdo.");
    if (Date.now() - Date.parse(job.due_at) > 24 * 3600000)
      throw new Error("O prazo de publicação expirou. Revise o agendamento.");
    const snapshot = job.snapshot,
      children = [...job.containers];
    let root = job.root_container;
    if (!root) {
      let created = 0;
      while (children.length < snapshot.assets.length && created < 2) {
        const asset = snapshot.assets[children.length];
        const signed = dbData(
          await db.storage
            .from("social-assets")
            .createSignedUrl(asset.path, 3600),
        );
        const result = await provider(
          a.token,
          "/" + a.instagram_id + "/media",
          containerBody(
            snapshot,
            asset,
            signed.signedUrl,
            snapshot.format === "carousel",
          ),
        );
        if (!/^\d+$/.test(String(result.id || "")))
          throw new Error(
            "O Instagram não retornou o identificador do arquivo.",
          );
        children.push(String(result.id));
        created++;
        if (!(await update({ containers: children }))) return;
      }
      if (children.length < snapshot.assets.length) {
        await release({ status: "processing" });
        return;
      }
      for (const id of children) {
        const state = await provider(a.token, "/" + id + "?fields=status_code");
        if (["ERROR", "EXPIRED"].includes(state.status_code))
          throw new Error(
            "Instagram rejeitou o arquivo. Confira formato, codecs e duração do vídeo.",
          );
        if (state.status_code !== "FINISHED") {
          await release({ status: "processing" });
          return;
        }
      }
      if (snapshot.format === "carousel") {
        const result = await provider(
          a.token,
          "/" + a.instagram_id + "/media",
          {
            media_type: "CAROUSEL",
            children: children.join(","),
            caption: snapshot.caption,
          },
        );
        root = String(result.id || "");
        if (!/^\d+$/.test(root))
          throw new Error("Falha ao preparar carrossel.");
      } else root = children[0];
      if (!(await update({ root_container: root }))) return;
    }
    const state = await provider(a.token, "/" + root + "?fields=status_code");
    if (["ERROR", "EXPIRED"].includes(state.status_code))
      throw new Error("O Instagram não conseguiu processar esta mídia.");
    if (state.status_code === "PUBLISHED") {
      await finished(job.media_id || null, job.permalink || null);
      return;
    }
    if (state.status_code !== "FINISHED") {
      await release({ status: "processing" });
      return;
    }
    const ready = dbData(
      await db.rpc("social_begin_publish", { j: job.id, l: job.lock_token }),
    );
    if (!ready) throw new Error("Agendamento cancelado ou conexão alterada.");
    publishStarted = true;
    const result = await provider(
      a.token,
      "/" + a.instagram_id + "/media_publish",
      { creation_id: root },
    );
    if (!/^\d+$/.test(String(result.id || "")))
      throw new InstagramError(0, true);
    const id = String(result.id);
    // Persist confirmed success before any optional permalink request.
    await finished(id, null);
    try {
      const media = await provider(a.token, "/" + id + "?fields=permalink");
      const link =
        typeof media.permalink === "string" &&
        /^https:\/\/(www\.)?instagram\.com\//.test(media.permalink)
          ? media.permalink
          : null;
      if (link) {
        await update({
          permalink: link,
        }); /* post record remains immutable; UI reads job permalink */
      }
    } catch {
      /* published ID is already confirmed */
    }
  } catch (e) {
    const uncertain =
      publishStarted && (!(e instanceof InstagramError) || e.uncertain);
    await release({
      status: uncertain ? "uncertain" : "failed",
      error: uncertain
        ? "Envio aguardando confirmação do Instagram. Não será reenviado automaticamente."
        : e instanceof Error
          ? e.message
          : "Falha na publicação.",
    });
  }
}
