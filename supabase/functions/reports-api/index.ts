import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireStaff, authCors, authFailure } from "../_shared/staff-auth.ts";
import { VoxiReader, deriveScope, inIds } from "../_shared/voxi-reader.ts";
import { validateSettings, renderReport } from "../_shared/report-model.ts";
import {
  collectReport,
  metaCampaignCatalog,
} from "../_shared/report-engine.ts";
import {
  connectionState,
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
  Response.json(data, { status, headers: authCors });
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
            ? ctx.db.from("profiles").select("user_id,full_name")
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
        configs: configs.data,
        sources: sources.data,
        connection: connection.data,
        runs: runs.data,
        profiles: profiles.data,
      });
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
      if (body.action === "connection-status") {
        try {
          const state = await connectionState(ctx.user.id);
          await service
            .from("report_connections")
            .update({ ...state, updated_at: new Date().toISOString() })
            .eq("user_id", ctx.user.id);
          return reply(state);
        } catch {
          return reply({ status: "disconnected" });
        }
      }
      // Never reuse, modify or disconnect the central inbound instance.
      const { data: existing } = await service
        .from("report_connections")
        .select("*")
        .eq("user_id", ctx.user.id)
        .maybeSingle();
      let qr: any;
      if (!existing) {
        const { error } = await service
          .from("report_connections")
          .insert({ user_id: ctx.user.id, instance_name: instance });
        if (error) throw new Error("Conexão em configuração; tente novamente.");
        try {
          qr = await evolutionReport("/instance/create", "POST", {
            instanceName: instance,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          });
        } catch {
          await service
            .from("report_connections")
            .delete()
            .eq("user_id", ctx.user.id);
          throw new Error("Não foi possível criar a conexão de relatórios.");
        }
      }
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
      if (state.status === "open") return reply(state);
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
      // Sign both config and rendered snapshot: manual sends preserve the reviewed content.
      const previewData = {
        result,
        message,
        createdAt: new Date().toISOString(),
      };
      const signature = await digest({
        hash,
        previewData,
        secret: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      });
      return reply({ result, message, previewData, previewToken: signature });
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
        if (s.period === "custom" && s.frequency !== "once")
          throw new Error(
            "Datas fixas exigem envio único. Use 7/30 dias para agendas recorrentes.",
          );
        if (!validPreview && config?.preview_hash !== hash)
          throw new Error("Gere a prévia desta configuração antes de ativar.");
        await verifyReportGroup(owner, client.group_id);
      }
      const row = {
        client_id: client.id,
        owner_user_id: owner,
        enabled: body.enabled === true,
        version: (config?.version || 0) + 1,
        settings: s,
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
      await verifyReportGroup(owner, client.group_id);
      const { error } = await service.from("report_runs").insert({
        client_id: client.id,
        owner_user_id: owner,
        idempotency_key: "manual:" + client.id + ":" + body.requestId,
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
      });
      if (error && error.code !== "23505")
        throw new Error("Não foi possível agendar o envio.");
      return reply({ ok: true, status: "queued" });
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
