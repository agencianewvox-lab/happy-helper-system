import {
  validateSettings,
  renderReport,
  scheduleOccurrences,
} from "./report-model.ts";
import { collectReport } from "./report-engine.ts";
import { VoxiReader } from "./voxi-reader.ts";
import {
  verifyReportGroup,
  dispatchReport,
  connectionIdentity,
} from "./report-sender.ts";

export async function enqueueSchedules(db: any, now = new Date()) {
  const { data: configs, error } = await db
    .from("report_configs")
    .select("*")
    .eq("enabled", true)
    .eq("review_required", false);
  if (error) throw new Error("Não foi possível ler a agenda.");
  for (const config of configs || []) {
    const settings = validateSettings(config.settings);
    const from = new Date(
      Math.max(
        Date.parse(config.last_evaluated_at),
        Date.parse(config.updated_at),
      ),
    );
    const occurrences = scheduleOccurrences(settings, from, now);
    const [{ data: client }, { data: source }] = await Promise.all([
      db
        .from("whatsapp_grupos")
        .select("id,nome,group_id,ad_account_id,archived_at")
        .eq("id", config.client_id)
        .single(),
      db
        .from("report_sources")
        .select("*")
        .eq("client_id", config.client_id)
        .maybeSingle(),
    ]);
    if (!client || client.archived_at) continue;
    for (const occurrence of occurrences) {
      const { error: queueError } = await db.from("report_runs").insert({
        client_id: client.id,
        owner_user_id: config.owner_user_id,
        idempotency_key: "scheduled:" + client.id + ":" + occurrence.slot,
        status: occurrence.expired ? "expired" : "queued",
        available_at: occurrence.at,
        expires_at: new Date(
          Date.parse(occurrence.at) + 15 * 60000,
        ).toISOString(),
        error: occurrence.expired
          ? "Ocorrência perdida: atraso superior a 15 minutos. Nenhuma mensagem enviada."
          : null,
        finished_at: occurrence.expired ? now.toISOString() : null,
        snapshot: {
          settings,
          source: settings.dataMode === "meta" ? null : source,
          groupId: client.group_id,
          account: client.ad_account_id,
          name: client.nome,
          now: occurrence.at,
          configVersion: config.version,
          manual: false,
        },
      });
      if (queueError && queueError.code !== "23505")
        throw new Error("Não foi possível persistir uma ocorrência da agenda.");
    }
    const checkpoint = await db
      .from("report_configs")
      .update({ last_evaluated_at: now.toISOString() })
      .eq("client_id", config.client_id)
      .eq("version", config.version)
      .eq("last_evaluated_at", config.last_evaluated_at);
    if (checkpoint.error)
      throw new Error("Não foi possível atualizar o acompanhamento da agenda.");
  }
}

export const workerDependencies = {
  collect: collectReport,
  verify: verifyReportGroup,
  dispatch: dispatchReport,
  identity: connectionIdentity,
};
export async function processReportRuns(
  db: any,
  options: {
    targetRunId?: string;
    now?: Date;
    crmKey: string;
    metaKey: string;
  },
  deps = workerDependencies,
) {
  const now = options.now || new Date(),
    stale = new Date(+now - 5 * 60000).toISOString();
  // Only an already-started provider call is uncertain; pre-dispatch work may safely retry.
  const recoveries = await Promise.all([
    db
      .from("report_runs")
      .update({
        status: "uncertain",
        error: "Disparo interrompido. Confira o grupo antes de reenviar.",
        finished_at: now.toISOString(),
      })
      .eq("status", "sending")
      .lt("dispatch_started_at", stale),
    db
      .from("report_runs")
      .update({
        status: "queued",
        available_at: now.toISOString(),
        lease_token: null,
      })
      .eq("status", "processing")
      .lt("started_at", stale)
      .lt("attempts", 3),
    db
      .from("report_runs")
      .update({
        status: "failed",
        error: "Limite de preparação atingido. Nenhuma mensagem enviada.",
        finished_at: now.toISOString(),
      })
      .eq("status", "processing")
      .lt("started_at", stale)
      .gte("attempts", 3),
    db
      .from("report_runs")
      .update({
        status: "expired",
        error: "Prazo de 15 minutos expirou. Nenhuma mensagem enviada.",
        finished_at: now.toISOString(),
      })
      .eq("status", "queued")
      .lte("expires_at", now.toISOString()),
  ]);
  if (recoveries.some((r) => r.error))
    throw new Error("Não foi possível recuperar a fila com segurança.");
  const { data: runs, error } = await db.rpc("claim_panel_report_runs_v2", {
    target_run: options.targetRunId || null,
    batch_size: 2,
  });
  if (error) throw new Error("Fila indisponível.");
  for (const run of runs || []) {
    let dispatchStarted = false;
    const write = (value: any, status = "processing") =>
      db
        .from("report_runs")
        .update(value)
        .eq("id", run.id)
        .eq("status", status)
        .eq("lease_token", run.lease_token);
    try {
      const snap = run.snapshot,
        settings = validateSettings(snap.settings);
      const [
        { data: allowed },
        { data: client },
        { data: source },
        { data: config },
        { data: connection },
      ] = await Promise.all([
        db.rpc("panel_report_sender_allowed", {
          target_client: run.client_id,
          target_user: run.owner_user_id,
        }),
        db
          .from("whatsapp_grupos")
          .select("id,group_id,ad_account_id,archived_at")
          .eq("id", run.client_id)
          .single(),
        db
          .from("report_sources")
          .select("*")
          .eq("client_id", run.client_id)
          .maybeSingle(),
        db
          .from("report_configs")
          .select("*")
          .eq("client_id", run.client_id)
          .maybeSingle(),
        db
          .from("report_connections")
          .select("user_id")
          .eq("user_id", run.owner_user_id)
          .maybeSingle(),
      ]);
      if (
        !allowed ||
        !client ||
        client.archived_at ||
        !connection ||
        client.group_id !== snap.groupId ||
        client.ad_account_id !== snap.account ||
        (settings.dataMode !== "meta" &&
          (!source || source.version !== snap.source?.version)) ||
        (!snap.manual &&
          (!config?.enabled ||
            config.review_required ||
            config.version !== snap.configVersion))
      ) {
        await write({
          status: "skipped",
          error:
            "Permissão, remetente, vínculo ou agenda alterados. Nenhuma mensagem enviada.",
          finished_at: new Date().toISOString(),
        });
        continue;
      }
      const result =
        snap.manual && snap.prepared
          ? snap.prepared.result
          : await deps.collect(
              new VoxiReader(options.crmKey),
              source,
              settings,
              snap.account,
              new Date(snap.now),
              options.metaKey,
            );
      if (result.blockingReasons?.length)
        throw new Error(result.blockingReasons.join(" "));
      const message =
        snap.manual && snap.prepared
          ? snap.prepared.message
          : renderReport(snap.name, settings, result);
      const saved = await write({ message, result }).select("id").maybeSingle();
      if (saved.error || !saved.data) continue; // Lease was revoked; no provider call.
      await deps.verify(run.owner_user_id, snap.groupId);
      const phone = await deps.identity(run.owner_user_id);
      if (!phone || (snap.manual && phone !== snap.prepared?.senderPhone))
        throw new Error(
          "Número do remetente alterado ou indisponível. Revise a conexão e gere uma nova prévia.",
        );
      const checked = await db
        .from("report_connections")
        .update({
          status: "open",
          phone,
          last_checked_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("user_id", run.owner_user_id);
      if (checked.error)
        throw new Error(
          "Não foi possível registrar a verificação do WhatsApp.",
        );
      const authorization = await db.rpc("authorize_panel_report_dispatch", {
        target_run: run.id,
        expected_lease: run.lease_token,
      });
      if (authorization.error || authorization.data !== true) {
        await write({
          status:
            Date.parse(run.expires_at) <= Date.now() ? "expired" : "skipped",
          error:
            "Validação final recusou o envio. Confira prazo, acesso e agenda.",
          finished_at: new Date().toISOString(),
        });
        continue;
      }
      dispatchStarted = true;
      const sent = await deps.dispatch(
        run.owner_user_id,
        snap.groupId,
        message,
        true,
      );
      const finished = await write(
        {
          status: sent.status,
          provider_message_id: sent.id || null,
          error: sent.error || null,
          finished_at: new Date().toISOString(),
        },
        "sending",
      );
      if (finished.error)
        throw new Error("Confirmação do provedor não pôde ser registrada.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha na preparação do relatório.";
      if (dispatchStarted) {
        await write(
          {
            status: "uncertain",
            error:
              "Confirmação incerta. Confira o grupo; não haverá repetição automática.",
            finished_at: new Date().toISOString(),
          },
          "sending",
        );
        continue;
      }
      const retry =
        run.attempts < 3 && Date.parse(run.expires_at) > Date.now() + 60000;
      await write({
        status: retry ? "queued" : "failed",
        available_at: new Date(Date.now() + 60000).toISOString(),
        error: message,
        finished_at: retry ? null : new Date().toISOString(),
      });
    }
  }
  return { processed: runs?.length || 0 };
}
