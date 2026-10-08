import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireMasterOrService, authFailure } from "../_shared/staff-auth.ts";
import {
  dbData,
  processPublication,
  credential,
} from "../_shared/social-worker.ts";
import { graph } from "../_shared/social-publishing.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Método não permitido", { status: 405 });
  try {
    await requireMasterOrService(req);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const body = await req.json().catch(() => ({}));
    if (body.action === "diagnostic") {
      const accounts = dbData(
        await db.from("social_instagram_accounts").select("client_id"),
      );
      const checks = [];
      for (const row of accounts) {
        try {
          const a = await credential(db, row.client_id),
            profile = await graph(
              a.token,
              "/me?fields=user_id,username,account_type,followers_count,media_count",
            );
          let permissions: unknown = null,
            insights = false,
            insightsError = "";
          try {
            permissions = (await graph(a.token, "/me/permissions")).data;
          } catch {
            /* optional endpoint */
          }
          try {
            await graph(
              a.token,
              "/" + a.instagram_id + "/insights?metric=reach&period=day",
            );
            insights = true;
          } catch (e) {
            insightsError = e instanceof Error ? e.message : "Indisponível";
          }
          checks.push({
            clientId: row.client_id,
            username: profile.username,
            accountType: profile.account_type,
            identityMatches:
              String(profile.user_id ?? profile.id) === a.instagram_id,
            permissions,
            insights,
            insightsError,
          });
        } catch (e) {
          checks.push({
            clientId: row.client_id,
            error: e instanceof Error ? e.message : "Falha de diagnóstico",
          });
        }
      }
      return Response.json(
        { checks },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const jobs = dbData(await db.rpc("social_claim"));
    await Promise.all(
      (jobs || []).map((j: unknown) => processPublication(db, j)),
    );
    return Response.json({ processed: jobs.length });
  } catch (e) {
    return authFailure(e);
  }
});
