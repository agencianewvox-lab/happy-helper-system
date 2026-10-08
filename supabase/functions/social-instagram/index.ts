import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors } from "../_shared/staff-auth.ts";
import {
  newState,
  stateHash,
  loginUrl,
  exchangeInstagram,
  INSTAGRAM_REDIRECT,
} from "../_shared/social-instagram.ts";
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { ...authCors, "Cache-Control": "no-store" },
  });
const check = <T>(r: { data: T; error: unknown }) => {
  if (r.error)
    throw new Error(
      "Não foi possível concluir. O perfil pode já estar vinculado a outro cliente.",
    );
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
    if (raw.length > 16000)
      return reply({ error: "Solicitação inválida." }, 413);
    const b = JSON.parse(raw);
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
    const appId = Deno.env.get("INSTAGRAM_APP_ID") || "",
      secret = Deno.env.get("INSTAGRAM_APP_SECRET") || "";
    if (b.action === "list") {
      const accounts = check(
        await ctx.db.from("social_instagram_accounts").select("*"),
      );
      return reply({
        accounts,
        configured: !!appId && !!secret,
        redirectUri: INSTAGRAM_REDIRECT,
      });
    }
    if (!appId || !secret)
      throw new Error(
        "Cadastre INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET nos segredos do Supabase do Painel.",
      );
    if (b.action === "start") {
      check(await service.rpc("social_instagram_expire"));
      const client = clients.find((c) => c.id === b.clientId && c.can_approve);
      if (!client)
        return reply(
          { error: "Sem permissão para conectar este cliente." },
          403,
        );
      const recent = await service
        .from("social_instagram_oauth")
        .select("state_hash", { count: "exact", head: true })
        .eq("user_id", ctx.user.id)
        .gt("expires_at", new Date().toISOString());
      if (recent.error)
        throw new Error("Não foi possível iniciar a autorização.");
      if ((recent.count || 0) >= 10)
        return reply(
          {
            error:
              "Muitas tentativas. Aguarde dez minutos para tentar novamente.",
          },
          429,
        );
      const state = newState(),
        hash = await stateHash(state);
      const url = loginUrl(appId, state);
      check(
        await service
          .from("social_instagram_oauth")
          .insert({
            state_hash: hash,
            client_id: client.id,
            user_id: ctx.user.id,
            expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
          }),
      );
      return reply({ url });
    }
    const hash = await stateHash(String(b.state || ""));
    const session = check(
      await service
        .from("social_instagram_oauth")
        .select(
          "client_id,user_id,expires_at,claimed_at,username,instagram_id,secret_id",
        )
        .eq("state_hash", hash)
        .eq("user_id", ctx.user.id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    const client = clients.find(
      (c) => c.id === session?.client_id && c.can_approve,
    );
    if (!session || !client)
      throw new Error(
        "Autorização expirada ou sem permissão. Inicie novamente pelo cliente correto.",
      );
    if (b.action === "exchange") {
      if (typeof b.code !== "string" || !b.code || b.code.length > 6000)
        throw new Error("Código inválido. Inicie novamente.");
      const claim = check(
        await service
          .from("social_instagram_oauth")
          .update({ claimed_at: new Date().toISOString() })
          .eq("state_hash", hash)
          .eq("user_id", ctx.user.id)
          .is("claimed_at", null)
          .select("state_hash")
          .maybeSingle(),
      );
      if (!claim)
        throw new Error("Autorização já utilizada. Inicie novamente.");
      const profile = await exchangeInstagram(b.code, appId, secret);
      check(
        await service.rpc("social_instagram_stage", {
          h: hash,
          u: ctx.user.id,
          t: profile.token,
          ig: profile.id,
          n: profile.username,
          k: profile.accountType,
          p: profile.canPublish,
          e: profile.expiresAt,
        }),
      );
      return reply({
        clientId: client.id,
        clientName: client.nome,
        username: profile.username,
        canPublish: profile.canPublish,
        expiresAt: profile.expiresAt,
      });
    }
    if (b.action === "confirm") {
      if (!session.secret_id)
        throw new Error("Autorize o perfil antes de confirmar.");
      check(
        await service.rpc("social_instagram_confirm", {
          h: hash,
          u: ctx.user.id,
          c: client.id,
        }),
      );
      return reply({ ok: true, clientId: client.id });
    }
    return reply({ error: "Ação indisponível." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Não foi possível conectar.",
      },
      400,
    );
  }
});
