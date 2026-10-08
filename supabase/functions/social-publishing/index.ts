import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors } from "../_shared/staff-auth.ts";
import {
  graph,
  publishIssues,
  reportRange,
} from "../_shared/social-publishing.ts";
import { credential, dbData } from "../_shared/social-worker.ts";
import { contentInput, type SocialPost } from "../_shared/social-model.ts";
const reply = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { ...authCors, "Cache-Control": "no-store" },
  });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: authCors });
  if (req.method !== "POST")
    return reply({ error: "Método não permitido." }, 405);
  try {
    const ctx = await requireStaff(req),
      text = await req.text();
    if (text.length > 20000)
      return reply({ error: "Solicitação muito grande." }, 413);
    const b = JSON.parse(text);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const clients = dbData(await ctx.db.rpc("social_portfolio"));
    if (b.action === "jobs") {
      return reply({
        jobs: dbData(
          await ctx.db
            .from("social_publications")
            .select(
              "id,post_id,client_id,instagram_id,status,due_at,media_id,permalink,error,updated_at",
            )
            .order("updated_at", { ascending: false })
            .limit(500),
        ),
      });
    }
    const c = clients.find((c: any) => c.id === b.clientId);
    if (!c) return reply({ error: "Cliente fora da sua carteira." }, 403);
    if (b.action === "cancel") {
      if (!c.can_approve)
        return reply({ error: "Sem permissão para cancelar." }, 403);
      const result = dbData(
        await db
          .from("social_publications")
          .update({
            status: "cancelled",
            locked_until: null,
            lock_token: null,
            error: "Cancelado pela equipe.",
            updated_at: new Date().toISOString(),
          })
          .eq("client_id", c.id)
          .eq("id", b.jobId)
          .in("status", ["queued", "processing"])
          .select("id")
          .maybeSingle(),
      );
      if (!result)
        throw new Error(
          "A publicação já foi enviada ou está em confirmação. Atualize o histórico.",
        );
      return reply({ ok: true });
    }
    if (b.action === "disconnect") {
      if (!c.can_approve)
        return reply({ error: "Sem permissão para desconectar." }, 403);
      const r = await db.rpc("social_disconnect", { c: c.id });
      if (r.error)
        throw new Error(
          "Há publicação em confirmação. Aguarde a conclusão antes de desconectar.",
        );
      return reply({ ok: true });
    }
    if (b.action === "duplicate") {
      const p = dbData(
        await ctx.db
          .from("social_posts")
          .select("*")
          .eq("id", b.postId)
          .eq("client_id", c.id)
          .single(),
      );
      const content = contentInput(
        {
          ...p,
          title: (p.title + " — cópia").slice(0, 160),
          scheduled_at: null,
        },
        c.id,
      );
      return reply({
        post: dbData(
          await db
            .from("social_posts")
            .insert({
              ...content,
              client_id: c.id,
              created_by: ctx.user.id,
              updated_by: ctx.user.id,
            })
            .select()
            .single(),
        ),
      });
    }
    const a = await credential(db, c.id);
    if (b.action === "check") {
      try {
        const profile = await graph(
          a.token,
          "/me?fields=user_id,username,account_type,followers_count,media_count",
        );
        if (String(profile.user_id ?? profile.id) !== a.instagram_id)
          throw new Error("O perfil autorizado mudou. Reconecte.");
        let permissions: string[] | null = null;
        try {
          const p = await graph(a.token, "/me/permissions");
          permissions = (p.data || [])
            .filter((x: any) => x.status === "granted")
            .map((x: any) => x.permission);
        } catch {
          /* retain previously granted capability */
        }
        const update: any = {
          username: profile.username,
          account_type: profile.account_type || a.account_type,
          last_checked_at: new Date().toISOString(),
          connection_error: null,
        };
        if (permissions) {
          update.can_publish = permissions.includes(
            "instagram_business_content_publish",
          );
          update.can_insights = permissions.includes(
            "instagram_business_manage_insights",
          );
        }
        dbData(
          await db
            .from("social_instagram_accounts")
            .update(update)
            .eq("client_id", c.id)
            .eq("connected_at", a.connected_at),
        );
        return reply({
          ok: true,
          username: profile.username,
          accountType: update.account_type,
          canPublish: update.can_publish ?? a.can_publish,
          canInsights: update.can_insights ?? a.can_insights,
          followers: profile.followers_count,
        });
      } catch (e) {
        await db
          .from("social_instagram_accounts")
          .update({
            connection_error:
              e instanceof Error ? e.message : "Falha de conexão",
            last_checked_at: new Date().toISOString(),
          })
          .eq("client_id", c.id);
        throw e;
      }
    }
    if (b.action === "queue") {
      if (!c.can_approve)
        return reply(
          { error: "A publicação exige aprovação do responsável." },
          403,
        );
      const p = dbData(
        await ctx.db
          .from("social_posts")
          .select("*")
          .eq("id", b.postId)
          .eq("client_id", c.id)
          .single(),
      ) as SocialPost;
      if (p.status !== "approved" || p.version !== b.version)
        throw new Error("Salve e aprove a versão atual antes de publicar.");
      const due = b.now === true ? new Date() : new Date(p.scheduled_at || "");
      if (
        !Number.isFinite(+due) ||
        (b.now !== true && +due < Date.now() + 60000)
      )
        throw new Error("Escolha um horário futuro de pelo menos um minuto.");
      if (+due - Date.now() > 180 * 86400000)
        throw new Error("Agende com até 180 dias de antecedência.");
      const assets = await Promise.all(
        p.assets.map(async (asset) => {
          if (!asset.path.startsWith(c.id + "/") || asset.path.includes(".."))
            throw new Error("Arquivo fora deste cliente.");
          const info = dbData(
            await db.storage.from("social-assets").info(asset.path),
          );
          const size = Number(info.size ?? info.metadata?.size),
            type = String(
              info.contentType ??
                info.content_type ??
                info.metadata?.mimetype ??
                "",
            );
          if (size !== asset.size || type !== asset.type)
            throw new Error(
              "Os dados do arquivo mudaram. Envie o material novamente e revise a aprovação.",
            );
          return { ...asset, size, type };
        }),
      );
      const issues = publishIssues({ ...p, assets }, a);
      if (issues.length) throw new Error(issues.join(" "));
      const id = dbData(
        await db.rpc("social_enqueue", {
          p: p.id,
          u: ctx.user.id,
          v: p.version,
          d: due.toISOString(),
        }),
      );
      // The durable row is the source of truth; the minute scheduler covers a failed wake-up.
      const wake = fetch(
        Deno.env.get("SUPABASE_URL")! + "/functions/v1/social-publisher",
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      ).catch(() => undefined);
      // @ts-ignore Supabase Edge runtime
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(wake);
      return reply({ ok: true, id });
    }
    if (b.action === "report") {
      const range = reportRange(b.from, b.to);
      const profile = await graph(
        a.token,
        "/me?fields=user_id,username,account_type,followers_count,media_count",
      );
      if (String(profile.user_id ?? profile.id) !== a.instagram_id)
        throw new Error("Perfil divergente. Reconecte esta conta.");
      const warnings: string[] = [],
        metrics: Record<string, number | null> = {};
      const metricsNames = [
        "views",
        "reach",
        "accounts_engaged",
        "total_interactions",
      ];
      await Promise.all(
        metricsNames.map(async (metric) => {
          try {
            const r = await graph(
              a.token,
              "/" +
                a.instagram_id +
                "/insights?metric=" +
                metric +
                "&period=day&metric_type=total_value&since=" +
                range.start +
                "&until=" +
                range.end,
            );
            const value = r.data?.[0]?.total_value?.value;
            metrics[metric] = typeof value === "number" ? value : null;
          } catch {
            metrics[metric] = null;
          }
        }),
      );
      if (Object.values(metrics).some((x) => x === null))
        warnings.push(
          "Algumas métricas não foram disponibilizadas pela Meta. Elas aparecem como N/D, nunca como zero. Pode ser necessário reconectar com acesso aos relatórios.",
        );
      let media: any[] = [],
        after = "",
        hasMore = false;
      for (let page = 0; page < 3; page++) {
        const r = await graph(
          a.token,
          "/" +
            a.instagram_id +
            "/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url&limit=100" +
            (after ? "&after=" + encodeURIComponent(after) : ""),
        );
        media.push(...(r.data || []));
        hasMore = !!r.paging?.next;
        after = String(r.paging?.cursors?.after || "");
        if (!hasMore || !after) break;
      }
      if (hasMore)
        warnings.push(
          "Foram consultados os 300 conteúdos mais recentes. O histórico deste período pode estar incompleto.",
        );
      media = media.filter(
        (m) =>
          Date.parse(m.timestamp) / 1000 >= range.start &&
          Date.parse(m.timestamp) / 1000 <= range.end,
      );
      return reply({
        clientName: c.nome,
        username: profile.username,
        range,
        generatedAt: new Date().toISOString(),
        followers: profile.followers_count ?? null,
        profileMediaCount: profile.media_count ?? null,
        metrics,
        media: media.map((m) => ({
          id: m.id,
          caption: m.caption || "",
          type: m.media_product_type || m.media_type,
          timestamp: m.timestamp,
          permalink: m.permalink || null,
          thumbnail:
            m.thumbnail_url || (m.media_type === "IMAGE" ? m.media_url : null),
          likes: typeof m.like_count === "number" ? m.like_count : null,
          comments:
            typeof m.comments_count === "number" ? m.comments_count : null,
        })),
        warnings,
      });
    }
    return reply({ error: "Ação indisponível." }, 400);
  } catch (e) {
    if (e instanceof Response) return e;
    return reply(
      { error: e instanceof Error ? e.message : "Não foi possível concluir." },
      400,
    );
  }
});
