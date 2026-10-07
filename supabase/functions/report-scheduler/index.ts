import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireMasterOrService, authFailure } from "../_shared/staff-auth.ts";
import {
  validateSettings,
  scheduleSlot,
  renderReport,
} from "../_shared/report-model.ts";
import { VoxiReader } from "../_shared/voxi-reader.ts";
import { collectReport } from "../_shared/report-engine.ts";
import { dispatchReport } from "../_shared/report-sender.ts";
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  try {
    await requireMasterOrService(req);
  } catch (e) {
    return authFailure(e);
  }
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const now = new Date();
  // A crashed send may already have reached WhatsApp. Never automatically replay.
  await db
    .from("report_runs")
    .update({
      status: "uncertain",
      error: "Execução interrompida. Confira o grupo antes de reenviar.",
      finished_at: now.toISOString(),
    })
    .eq("status", "processing")
    .lt("started_at", new Date(+now - 10 * 60000).toISOString());
  await db
    .from("report_runs")
    .update({
      status: "skipped",
      error: "Prazo de envio expirou.",
      finished_at: now.toISOString(),
    })
    .eq("status", "queued")
    .lt("available_at", new Date(+now - 4 * 3600000).toISOString());
  const { data: configs, error } = await db
    .from("report_configs")
    .select("*")
    .eq("enabled", true);
  if (error)
    return Response.json(
      { error: "Não foi possível ler a agenda." },
      { status: 503 },
    );
  for (const config of configs || []) {
    try {
      const settings = validateSettings(config.settings),
        slot = scheduleSlot(settings, now);
      if (!slot) continue;
      const [{ data: client }, { data: source }] = await Promise.all([
        db
          .from("whatsapp_grupos")
          .select("id,nome,group_id,ad_account_id")
          .eq("id", config.client_id)
          .single(),
        db
          .from("report_sources")
          .select("*")
          .eq("client_id", config.client_id)
          .single(),
      ]);
      if (!client || !source) continue;
      const { error: insertError } = await db
        .from("report_runs")
        .insert({
          client_id: client.id,
          owner_user_id: config.owner_user_id,
          idempotency_key: "scheduled:" + client.id + ":" + slot,
          snapshot: {
            settings,
            source,
            groupId: client.group_id,
            account: client.ad_account_id,
            name: client.nome,
            now: now.toISOString(),
            configVersion: config.version,
            manual: false,
          },
        });
      if (insertError && insertError.code !== "23505")
        console.error("Report queue insert failed", insertError.code);
    } catch {
      console.error("Invalid report schedule", config.client_id);
    }
  }
  const { data: runs, error: claimError } = await db.rpc(
    "claim_panel_report_runs",
    { batch_size: 2 },
  );
  if (claimError)
    return Response.json({ error: "Fila indisponível." }, { status: 503 });
  let processed = 0;
  for (const run of runs || []) {
    try {
      const snap = run.snapshot;
      const [
        { data: allowed },
        { data: client },
        { data: source },
        { data: config },
      ] = await Promise.all([
        db.rpc("panel_report_sender_allowed", {
          target_client: run.client_id,
          target_user: run.owner_user_id,
        }),
        db
          .from("whatsapp_grupos")
          .select("id,group_id,ad_account_id")
          .eq("id", run.client_id)
          .single(),
        db
          .from("report_sources")
          .select("*")
          .eq("client_id", run.client_id)
          .single(),
        db
          .from("report_configs")
          .select("*")
          .eq("client_id", run.client_id)
          .maybeSingle(),
      ]);
      if (
        !allowed ||
        !client ||
        !source ||
        source.version !== snap.source.version ||
        client.group_id !== snap.groupId ||
        client.ad_account_id !== snap.account ||
        (!snap.manual &&
          (!config?.enabled || config.version !== snap.configVersion))
      )
        throw new Error(
          "Permissões, destino ou configuração mudaram; envio cancelado.",
        );
      const settings = validateSettings(snap.settings);
      const result =
        snap.manual && snap.prepared
          ? snap.prepared.result
          : await collectReport(
              new VoxiReader(Deno.env.get("VOXI_READ_KEY") || ""),
              source,
              settings,
              snap.account,
              new Date(snap.now),
              Deno.env.get("META_ADS_ACCESS_TOKEN") || "",
            );
      const message =
        snap.manual && snap.prepared
          ? snap.prepared.message
          : renderReport(snap.name, settings, result);
      // Persist immutable content before contacting the external provider.
      const { error: saveError } = await db
        .from("report_runs")
        .update({ result, message })
        .eq("id", run.id)
        .eq("status", "processing");
      if (saveError)
        throw new Error(
          "Não foi possível registrar o conteúdo; envio cancelado.",
        );
      // Check revoked access immediately before dispatch too.
      const { data: stillAllowed } = await db.rpc(
        "panel_report_sender_allowed",
        { target_client: run.client_id, target_user: run.owner_user_id },
      );
      if (!stillAllowed) throw new Error("Remetente sem acesso ao cliente.");
      const [
        { data: latestSource },
        { data: latestClient },
        { data: latestConfig },
      ] = await Promise.all([
        db
          .from("report_sources")
          .select("version")
          .eq("client_id", run.client_id)
          .single(),
        db
          .from("whatsapp_grupos")
          .select("group_id,ad_account_id")
          .eq("id", run.client_id)
          .single(),
        db
          .from("report_configs")
          .select("version,enabled")
          .eq("client_id", run.client_id)
          .maybeSingle(),
      ]);
      if (
        latestSource?.version !== source.version ||
        latestClient?.group_id !== snap.groupId ||
        latestClient?.ad_account_id !== snap.account ||
        (!snap.manual &&
          (!latestConfig?.enabled ||
            latestConfig.version !== snap.configVersion))
      )
        throw new Error(
          "Vínculo ou agenda alterados durante a preparação; envio cancelado.",
        );
      const sent = await dispatchReport(
        run.owner_user_id,
        snap.groupId,
        message,
      );
      await db
        .from("report_runs")
        .update({
          status: sent.status,
          provider_message_id: sent.id || null,
          error: sent.error || null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    } catch (e) {
      await db
        .from("report_runs")
        .update({
          status: "failed",
          error:
            e instanceof Error ? e.message : "Falha ao preparar o relatório.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    processed++;
  }
  return Response.json({ processed });
});
