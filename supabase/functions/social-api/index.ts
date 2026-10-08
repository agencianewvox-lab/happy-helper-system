import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors } from "../_shared/staff-auth.ts";
import {
  contentInput,
  transition,
  type SocialPost,
  type SocialStatus,
} from "../_shared/social-model.ts";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: authCors });
const check = <T>(r: { data: T; error: unknown }) => {
  if (r.error)
    throw new Error("Não foi possível salvar ou consultar os dados.");
  return r.data;
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: authCors });
  if (req.method !== "POST")
    return reply({ error: "Método não permitido." }, 405);
  try {
    const ctx = await requireStaff(req);
    const raw = await req.text();
    if (raw.length > 80000)
      return reply({ error: "Solicitação muito grande." }, 413);
    const body = JSON.parse(raw);
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const clients = check(await ctx.db.rpc("social_portfolio")) as {
      id: string;
      nome: string;
      can_approve: boolean;
    }[];
    if (body.action === "bootstrap") {
      const [posts, members, profiles] = await Promise.all([
        ctx.db
          .from("social_posts")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(500),
        ctx.db.from("social_members").select("*"),
        ctx.isMaster
          ? service.from("profiles").select("user_id,full_name")
          : Promise.resolve({ data: [], error: null }),
      ]);
      return reply({
        clients,
        posts: check(posts),
        members: check(members),
        profiles: check(profiles),
        integration: {
          ready: false,
          message:
            "Publicação automática aguarda configuração e validação do aplicativo Instagram. Datas são planejamento editorial, não disparo automático.",
        },
      });
    }
    const client = clients.find((c) => c.id === body.clientId);
    if (!client)
      return reply({ error: "Cliente fora da sua carteira editorial." }, 403);
    if (body.action === "member") {
      if (!ctx.isMaster)
        return reply(
          { error: "Somente o Master pode atribuir a carteira." },
          403,
        );
      const profile = check(
        await service
          .from("profiles")
          .select("user_id")
          .eq("user_id", body.userId)
          .maybeSingle(),
      );
      if (!profile)
        return reply({ error: "Selecione um usuário ativo do Painel." }, 400);
      if (body.remove)
        check(
          await service
            .from("social_members")
            .delete()
            .eq("client_id", client.id)
            .eq("user_id", body.userId),
        );
      else
        check(
          await service
            .from("social_members")
            .upsert(
              {
                client_id: client.id,
                user_id: body.userId,
                can_approve: body.canApprove === true,
              },
              { onConflict: "client_id,user_id" },
            ),
        );
      return reply({ ok: true });
    }
    if (body.action === "save") {
      const content = contentInput(body.content || {}, client.id);
      for (const asset of content.assets) {
        const signed = await service.storage
          .from("social-assets")
          .createSignedUrl(asset.path, 60);
        if (signed.error)
          throw new Error(
            "Arquivo não encontrado na biblioteca. Envie novamente.",
          );
      }
      if (body.postId) {
        const old = check(
          await ctx.db
            .from("social_posts")
            .select("id,status")
            .eq("id", body.postId)
            .eq("client_id", client.id)
            .maybeSingle(),
        );
        if (!old) return reply({ error: "Conteúdo não encontrado." }, 404);
        if (["published_manual", "cancelled"].includes(old.status))
          throw new Error(
            "Conteúdo finalizado não pode ser editado. Crie um novo conteúdo.",
          );
        const post = check(
          await service
            .from("social_posts")
            .update({ ...content, updated_by: ctx.user.id })
            .eq("id", body.postId)
            .eq("client_id", client.id)
            .eq("version", body.version)
            .select()
            .maybeSingle(),
        );
        if (!post)
          return reply(
            {
              error:
                "Outra pessoa alterou este conteúdo. Reabra a ficha antes de salvar.",
            },
            409,
          );
        return reply({ post });
      }
      const post = check(
        await service
          .from("social_posts")
          .insert({
            ...content,
            client_id: client.id,
            created_by: ctx.user.id,
            updated_by: ctx.user.id,
          })
          .select()
          .single(),
      );
      return reply({ post });
    }
    const post = check(
      await ctx.db
        .from("social_posts")
        .select("*")
        .eq("id", body.postId)
        .eq("client_id", client.id)
        .maybeSingle(),
    ) as SocialPost | null;
    if (!post) return reply({ error: "Conteúdo não encontrado." }, 404);
    if (body.action === "details") {
      const [comments, history] = await Promise.all([
        ctx.db
          .from("social_comments")
          .select("*")
          .eq("post_id", post.id)
          .order("created_at"),
        ctx.db
          .from("social_history")
          .select("id,actor_id,version,status,created_at")
          .eq("post_id", post.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      const assets = await Promise.all(
        post.assets.map(async (asset) => {
          const signed = await service.storage
            .from("social-assets")
            .createSignedUrl(asset.path, 3600);
          return { ...asset, url: signed.data?.signedUrl || null };
        }),
      );
      return reply({
        comments: check(comments),
        history: check(history),
        assets,
      });
    }
    if (body.action === "comment") {
      const text = String(body.text || "").trim();
      if (!text || text.length > 4000)
        throw new Error("Escreva um comentário de até 4.000 caracteres.");
      check(
        await service
          .from("social_comments")
          .insert({
            post_id: post.id,
            client_id: client.id,
            author_id: ctx.user.id,
            body: text,
          }),
      );
      return reply({ ok: true });
    }
    if (body.action === "transition") {
      const status = transition(
        post.status,
        body.status as SocialStatus,
        client.can_approve,
        { assets: post.assets, publication_url: body.publicationUrl },
      );
      const update: Record<string, unknown> = {
        status,
        updated_by: ctx.user.id,
      };
      if (status === "approved") {
        update.approved_by = ctx.user.id;
        update.approved_at = new Date().toISOString();
      }
      if (status === "review" || status === "cancelled" || status === "draft") {
        update.approved_by = null;
        update.approved_at = null;
      }
      if (status === "published_manual")
        update.publication_url = String(body.publicationUrl);
      const next = check(
        await service
          .from("social_posts")
          .update(update)
          .eq("id", post.id)
          .eq("client_id", client.id)
          .eq("version", body.version)
          .select()
          .maybeSingle(),
      );
      if (!next)
        return reply(
          { error: "Conteúdo atualizado por outra pessoa. Reabra a ficha." },
          409,
        );
      return reply({ post: next });
    }
    return reply({ error: "Ação indisponível." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível concluir.",
      },
      400,
    );
  }
});
