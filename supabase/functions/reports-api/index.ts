import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors, authFailure } from "../_shared/staff-auth.ts";
import { VoxiReader, deriveScope, inIds } from "../_shared/voxi-reader.ts";
import { processReportRuns } from "../_shared/report-worker.ts";
import {
  validateSettings,
  renderReport,
  nextExecutions,
} from "../_shared/report-model.ts";
import {
  collectReport,
  metaCampaignCatalog,
} from "../_shared/report-engine.ts";
import {
  connectionState,
  connectionIdentity,
  EvolutionError,
  evolutionReport,
  reportInstance,
  verifyReportGroup,
} from "../_shared/report-sender.ts";
const admin = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
const reader = () => new VoxiReader(Deno.env.get("VOXI_READ_KEY") || "");
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { ...authCors, "Cache-Control": "private, no-store" },
  });
async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function sourceFor(db: any, clientId: string) {
  const { data, error } = await db
    .from("report_sources")
    .select("*")
    .eq("client_id", clientId)
    .single();
  if (error || !data)
    throw new Error("O Master precisa vincular a conta CRM deste cliente.");
  return data;
}
async function checkedSettings(db: any, clientId: string, value: unknown) {
  const s = validateSettings(value);
  if (s.dataMode === "meta") return { s, source: null };
  const source = await sourceFor(db, clientId);
  if (s.pipelines.some((id) => !source.pipeline_ids.includes(id)))
    throw new Error("Funil fora do vínculo autorizado.");
  if (source.pipeline_only && !s.pipelines.includes(source.pipeline_only))
    throw new Error("Selecione o funil exclusivo desta conta.");
  const stages = await reader().read("journey_stages", {
    whatsapp_instance_id: inIds(source.instance_ids),
  });
  const scopeStages = stages.filter(
    (x) =>
      (source.pipeline_ids.includes(x.pipeline_id) ||
        (x.pipeline_id === null &&
          !s.pipelines.length &&
          !source.pipeline_only)) &&
      (!s.pipelines.length || s.pipelines.includes(x.pipeline_id)),
  );
  if (
    [...s.stages.scheduled, ...s.stages.attended].some(
      (id) => !scopeStages.some((x) => x.id === id),
    )
  )
    throw new Error("Etapa fora dos funis selecionados.");
  return { s, source };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: authCors });
  if (req.method !== "POST")
    return reply({ error: "Método não permitido." }, 405);
  try {
    const ctx = await requireStaff(req),
      service = admin();
    if (!ctx.isMaster && ctx.profile.role !== "gestor")
      return reply(
        { error: "Relatórios disponíveis apenas ao Master e aos gestores." },
        403,
      );
    const raw = await req.text();
    if (raw.length > 64000)
      return reply({ error: "Solicitação muito grande." }, 413);
    const body = JSON.parse(raw);
    if (body.action === "bootstrap") {
      const [clients, configs, sources, connection, runs, profiles] =
        await Promise.all([
          ctx.db
            .from("whatsapp_grupos")
            .select("id,nome,group_id,gestor_responsavel,ad_account_id")
            .is("archived_at", null)
            .order("nome"),
          ctx.db.from("report_configs").select("*"),
          ctx.db.from("report_sources").select("*"),
          ctx.db
            .from("report_connections")
            .select("*")
            .eq("user_id", ctx.user.id)
            .maybeSingle(),
          ctx.db
            .from("report_runs")
            .select("id,client_id,status,created_at,finished_at,message,error")
            .order("created_at", { ascending: false })
            .limit(100),
          ctx.isMaster
            ? ctx.db
                .from("profiles")
                .select("user_id,full_name")
                .in("role", ["admin", "gestor"])
            : Promise.resolve({ data: [], error: null }),
        ]);
      if (
        [clients, configs, sources, connection, runs, profiles].some(
          (r) => r.error,
        )
      )
        throw new Error("Não foi possível carregar a central.");
      return reply({
        clients: clients.data,
        configs: configs.data?.map((c) => ({
          ...c,
          nextExecutions:
            c.enabled && !c.review_required ? nextExecutions(c.settings) : [],
        })),
        sources: sources.data,
        connection: connection.data,
        runs: runs.data,
        profiles: profiles.data,
      });
    }
    if (body.action === "run-status") {
      if (
        typeof body.runId !== "string" ||
        !/^[-a-f0-9]{36}$/i.test(body.runId)
      )
        throw new Error("Execução inválida.");
      const { data, error } = await ctx.db
        .from("report_runs")
        .select("id,client_id,status,created_at,finished_at,message,error")
        .eq("id", body.runId)
        .single();
      if (error || !data)
        return reply({ error: "Execução não autorizada." }, 403);
      return reply(data);
    }
    if (body.action === "catalog") {
      if (!ctx.isMaster) return reply({ error: "Exclusivo do Master." }, 403);
      const instances = await reader().read("whatsapp_instances"),
        pipelines = await reader().read("pipelines");
      return reply({
        accounts: instances
          .filter(
            (x) =>
              !x.parent_instance_id && x.connection_purpose !== "mass_dispatch",
          )
          .map((x) => ({
            id: x.id,
            name: x.client_name || x.instance_name,
            pipelineOnly:
              x.crm_scope_mode === "PIPELINE_ONLY"
                ? x.crm_scope_pipeline_id
                : null,
          })),
        pipelines,
      });
    }
    if (
      [
        "connection-status",
        "connection-connect",
        "connection-disconnect",
      ].includes(body.action)
    ) {
      const instance = reportInstance(ctx.user.id);
      if (body.action === "connection-disconnect") {
        await evolutionReport("/instance/logout/" + instance, "DELETE");
        await service
          .from("report_connections")
          .update({
            status: "disconnected",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", ctx.user.id);
        await service
          .from("report_configs")
          .update({ enabled: false })
          .eq("owner_user_id", ctx.user.id);
        return reply({ status: "disconnected" });
      }
      const { data: existing } = await service
        .from("report_connections")
        .select("*")
        .eq("user_id", ctx.user.id)
        .maybeSingle();
      if (body.action === "connection-status") {
        const checkedAt = new Date().toISOString();
        if (!existing)
          return reply({ status: "disconnected", checkedAt, phone: null });
        try {
          const state = await connectionState(ctx.user.id);
          const phone =
            state.status === "open"
              ? await connectionIdentity(ctx.user.id)
              : null;
          await service
            .from("report_connections")
            .update({
              ...state,
              phone,
              last_checked_at: checkedAt,
              last_error: null,
              updated_at: checkedAt,
            })
            .eq("user_id", ctx.user.id);
          return reply({ ...state, phone, checkedAt });
        } catch (e) {
          const status =
            e instanceof EvolutionError && e.status === 404
              ? "disconnected"
              : "unknown";
          const error =
            status === "unknown"
              ? "Não foi possível consultar a Evolution. Isso não confirma desconexão. Atualize ou verifique o servidor."
              : "Conexão não encontrada. Use reconectar para gerar um QR.";
          await service
            .from("report_connections")
            .update({ status, last_checked_at: checkedAt, last_error: error })
            .eq("user_id", ctx.user.id);
          return reply({ status, checkedAt, error });
        }
      }
      // Stable per-user instance. A failed create may have succeeded remotely; keep its binding.
      let providerExists = false;
      try {
        await connectionState(ctx.user.id);
        providerExists = true;
      } catch (e) {
        if (!(e instanceof EvolutionError && e.status === 404)) throw e;
      }
      const registered = await service.from("report_connections").upsert(
        {
          user_id: ctx.user.id,
          instance_name: instance,
          status: "connecting",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (registered.error)
        throw new Error("Não foi possível registrar a conexão.");
      let qr: any;
      if (!providerExists)
        qr = await evolutionReport("/instance/create", "POST", {
          instanceName: instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        });
      await evolutionReport("/webhook/set/" + instance, "POST", {
        webhook: {
          enabled: false,
          url: "https://gorqyovidpdvuockzndm.supabase.co/functions/v1/reports-api",
          byEvents: false,
          base64: false,
          events: ["CONNECTION_UPDATE"],
        },
      });
      const state = await connectionState(ctx.user.id);
      if (state.status === "open") {
        const phone = await connectionIdentity(ctx.user.id),
          checkedAt = new Date().toISOString();
        await service
          .from("report_connections")
          .update({
            status: "open",
            phone,
            last_checked_at: checkedAt,
            last_error: null,
          })
          .eq("user_id", ctx.user.id);
        return reply({ ...state, phone, checkedAt });
      }
      if (!qr?.qrcode?.base64)
        qr = await evolutionReport("/instance/connect/" + instance);
      const base64 = qr.qrcode?.base64 || qr.base64;
      if (
        typeof base64 !== "string" ||
        !base64.startsWith("data:image/png;base64,")
      )
        throw new Error("QR indisponível. Atualize a conexão.");
      return reply({ status: "connecting", qr: base64 });
    }
    if (
      typeof body.clientId !== "string" ||
      !/^[-a-f0-9]{36}$/i.test(body.clientId)
    )
      return reply({ error: "Cliente inválido." }, 400);
    // RLS is the first gate; no client/account/group supplied by the browser is trusted.
    const { data: client, error: clientError } = await ctx.db
      .from("whatsapp_grupos")
      .select("id,nome,group_id,ad_account_id,gestor_responsavel")
      .is("archived_at", null)
      .eq("id", body.clientId)
      .single();
    if (clientError || !client)
      return reply({ error: "Cliente fora da sua carteira." }, 403);
    if (body.action === "campaign-catalog") {
      if (!client.ad_account_id)
        throw new Error("Vincule a conta Meta na área Anúncios deste cliente.");
      return reply({
        campaigns: await metaCampaignCatalog(
          client.ad_account_id,
          Deno.env.get("META_ADS_ACCESS_TOKEN") || "",
        ),
      });
    }
    if (body.action === "bind-source") {
      if (!ctx.isMaster || body.confirm !== true)
        return reply({ error: "O Master deve confirmar o vínculo." }, 403);
      const instances = await reader().read("whatsapp_instances"),
        scope = deriveScope(body.accountId, instances);
      const pipelines = await reader().read("pipelines", {
        account_root_id: "eq." + body.accountId,
      });
      const allowed = pipelines
        .filter((p) => !scope.pipelineOnly || p.id === scope.pipelineOnly)
        .map((p) => p.id);
      if (scope.pipelineOnly && !allowed.length)
        throw new Error("Funil exclusivo não encontrado.");
      const { data: old } = await service
        .from("report_sources")
        .select("version")
        .eq("client_id", client.id)
        .maybeSingle();
      const pause = await service
        .from("report_configs")
        .update({ enabled: false, preview_hash: null })
        .eq("client_id", client.id);
      if (pause.error)
        throw new Error(
          "Não foi possível pausar os envios antes de alterar o vínculo.",
        );
      const { error } = await service.from("report_sources").upsert({
        client_id: client.id,
        crm_account_id: body.accountId,
        instance_ids: scope.ids,
        pipeline_ids: allowed,
        pipeline_only: scope.pipelineOnly,
        version: (old?.version || 0) + 1,
        confirmed_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("Não foi possível salvar o vínculo.");
      return reply({ ok: true });
    }
    if (body.action === "client-catalog") {
      const source = await sourceFor(ctx.db, client.id);
      const [pipelines, stages] = await Promise.all([
        source.pipeline_ids.length
          ? reader().read("pipelines", { id: inIds(source.pipeline_ids) })
          : [],
        reader().read("journey_stages", {
          whatsapp_instance_id: inIds(source.instance_ids),
        }),
      ]);
      return reply({
        pipelines,
        stages: stages.filter(
          (s) =>
            source.pipeline_ids.includes(s.pipeline_id) ||
            (s.pipeline_id === null && !source.pipeline_only),
        ),
      });
    }
    if (body.action === "pause") {
      const paused = await service
        .from("report_configs")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("client_id", client.id);
      if (paused.error) throw new Error("Não foi possível pausar a agenda.");
      return reply({ ok: true });
    }
    const { s, source } = await checkedSettings(
      ctx.db,
      client.id,
      body.settings,
    );
    if (s.dataMode === "meta" && !client.ad_account_id)
      throw new Error(
        "Vincule a conta Meta deste cliente antes de configurar o relatório.",
      );
    const owner = ctx.isMaster ? body.ownerUserId || ctx.user.id : ctx.user.id;
    const { data: ownerProfile } = await service
      .from("profiles")
      .select("full_name,role,is_master")
      .eq("user_id", owner)
      .single();
    if (!ownerProfile) throw new Error("Remetente inválido.");
    const { data: allowed } = await service.rpc("panel_report_sender_allowed", {
      target_client: client.id,
      target_user: owner,
    });
    if (allowed !== true)
      throw new Error("O remetente não gerencia este cliente.");
    const hash = await digest({
      settings: s,
      sourceVersion: source?.version || null,
      group: client.group_id,
      account: client.ad_account_id,
      owner,
    });
    const { data: config } = await service
      .from("report_configs")
      .select("*")
      .eq("client_id", client.id)
      .maybeSingle();
    if (body.action === "preview") {
      const result = await collectReport(
        reader(),
        source,
        s,
        client.ad_account_id,
        new Date(),
        Deno.env.get("META_ADS_ACCESS_TOKEN") || "",
      );
      const message = renderReport(client.nome, s, result);
      const issues = [...(result.blockingReasons || [])];
      const { data: sender } = await service
        .from("report_connections")
        .select("phone")
        .eq("user_id", owner)
        .maybeSingle();
      let senderPhone: string | null = null;
      if (!sender)
        issues.push(
          "O remetente precisa conectar seu WhatsApp em Meu WhatsApp.",
        );
      else
        try {
          await verifyReportGroup(owner, client.group_id);
          senderPhone = await connectionIdentity(owner);
          if (!senderPhone)
            issues.push(
              "Não foi possível identificar o número do remetente. Reconecte seu WhatsApp.",
            );
        } catch (e) {
          issues.push(e instanceof Error ? e.message : "Conexão indisponível.");
        }
      const previewData = {
        result,
        message,
        senderPhone,
        createdAt: new Date().toISOString(),
      };
      const signature = await digest({
        hash,
        previewData,
        secret: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      });
      return reply({
        result,
        message,
        previewData,
        previewToken: signature,
        readiness: { ready: issues.length === 0, issues },
        sender: { name: ownerProfile.full_name, phone: senderPhone },
        destination: { name: client.nome, id: client.group_id },
        nextExecutions: nextExecutions(s),
      });
    }
    const signature = await digest({
      hash,
      previewData: body.previewData,
      secret: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    });
    const previewAge = Date.now() - Date.parse(body.previewData?.createdAt);
    const validPreview =
      body.previewToken === signature &&
      Number.isFinite(previewAge) &&
      previewAge >= -30000 &&
      previewAge < 10 * 60000;
    if (body.action === "save") {
      if (body.enabled === true) {
        if (!nextExecutions(s).length) throw new Error("A agenda não tem uma próxima execução válida. Revise a data, o intervalo e os dias selecionados.");
        if (s.period === "custom" && s.frequency !== "once")
          throw new Error(
            "Datas fixas exigem envio único. Use 7/30 dias para agendas recorrentes.",
          );
        if (!validPreview)
          throw new Error("Gere a prévia desta configuração antes de ativar.");
        if (body.previewData?.result?.blockingReasons?.length)
          throw new Error("Resolva os bloqueios da revisão antes de ativar.");
        await verifyReportGroup(owner, client.group_id);
        const phone = await connectionIdentity(owner);
        if (!phone || phone !== body.previewData.senderPhone)
          throw new Error("Confirme o número do remetente em uma nova prévia.");
      }
      const row = {
        client_id: client.id,
        owner_user_id: owner,
        enabled: body.enabled === true,
        version: (config?.version || 0) + 1,
        settings: s,
        review_required: validPreview
          ? false
          : (config?.review_required ?? true),
        last_evaluated_at: new Date().toISOString(),
        preview_hash: validPreview
          ? hash
          : config?.preview_hash === hash
            ? hash
            : null,
        updated_at: new Date().toISOString(),
      };
      if (config && body.version !== config.version)
        throw new Error("Configuração mudou em outra tela. Reabra o cliente.");
      const write = config
        ? await service
            .from("report_configs")
            .update(row)
            .eq("client_id", client.id)
            .eq("version", config.version)
            .select("version")
            .single()
        : await service
            .from("report_configs")
            .insert(row)
            .select("version")
            .single();
      if (write.error)
        throw new Error("Não foi possível salvar; reabra o cliente.");
      return reply({ ok: true, version: write.data.version });
    }
    if (body.action === "send") {
      if (body.confirm !== true || !validPreview)
        throw new Error(
          "Gere uma prévia atualizada antes de confirmar o envio.",
        );
      if (
        typeof body.requestId !== "string" ||
        !/^[-a-f0-9]{36}$/i.test(body.requestId)
      )
        throw new Error("Identificador de envio inválido.");
      if (body.previewData?.result?.blockingReasons?.length)
        throw new Error("Resolva os bloqueios da revisão antes de enviar.");
      const { data: connection } = await service
        .from("report_connections")
        .select("user_id")
        .eq("user_id", owner)
        .maybeSingle();
      if (!connection)
        throw new Error("Conecte o WhatsApp do remetente em Meu WhatsApp.");
      await verifyReportGroup(owner, client.group_id);
      const phone = await connectionIdentity(owner);
      if (!phone || phone !== body.previewData.senderPhone)
        throw new Error(
          "O número do remetente mudou ou não pôde ser confirmado. Gere uma nova prévia.",
        );
      // Same signed preview = same execution even if a double click creates another request UUID.
      const idempotencyKey = "manual:" + client.id + ":" + body.previewToken;
      const { data: inserted, error } = await service
        .from("report_runs")
        .insert({
          client_id: client.id,
          owner_user_id: owner,
          idempotency_key: idempotencyKey,
          expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
          snapshot: {
            settings: s,
            source,
            groupId: client.group_id,
            account: client.ad_account_id,
            name: client.nome,
            now: body.previewData.createdAt,
            manual: true,
            prepared: body.previewData,
          },
        })
        .select("id,status")
        .single();
      if (error && error.code !== "23505")
        throw new Error("Não foi possível registrar o envio.");
      const run =
        inserted ||
        (
          await service
            .from("report_runs")
            .select("id,status")
            .eq("idempotency_key", idempotencyKey)
            .single()
        ).data;
      if (!run) throw new Error("Não foi possível recuperar a execução.");
      if (run.status === "queued") {
        const task = processReportRuns(service, {
          targetRunId: run.id,
          crmKey: Deno.env.get("VOXI_READ_KEY") || "",
          metaKey: Deno.env.get("META_ADS_ACCESS_TOKEN") || "",
        }).catch(() => undefined);
        const runtime = (
          globalThis as typeof globalThis & {
            EdgeRuntime?: { waitUntil(p: Promise<unknown>): void };
          }
        ).EdgeRuntime;
        if (runtime) runtime.waitUntil(task);
        else await task;
      }
      return reply({ ok: true, status: run.status, runId: run.id });
    }
    return reply({ error: "Ação inválida." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return reply(
      {
        error:
          error instanceof Error ? error.message : "Operação indisponível.",
      },
      400,
    );
  }
});
