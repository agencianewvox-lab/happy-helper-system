/** The only CRM transport: fixed origin, allowlisted projections, GET only. */
export const voxiColumns = {
  whatsapp_instances:
    "id,parent_instance_id,client_name,instance_name,crm_scope_mode,crm_scope_pipeline_id,connection_purpose",
  pipelines: "id,account_root_id,name",
  journey_stages: "id,name,pipeline_id,whatsapp_instance_id",
  leads:
    "id,whatsapp_instance_id,pipeline_id,lead_entered_at,ad_id,source,stage_id",
  lead_identity_links: "id,whatsapp_instance_id,contact_id,lead_id",
  contacts: "id,whatsapp_instance_id,merged_into_id",
  opportunities:
    "id,whatsapp_instance_id,contact_id,lead_id,pipeline_id,status,value,won_at",
  stage_history: "id,lead_id,to_stage,changed_at",
  acquisition_events:
    "id,whatsapp_instance_id,lead_id,contact_id,ad_id,occurred_at",
} as const;
type Table = keyof typeof voxiColumns;
export class VoxiReader {
  constructor(
    private key: string,
    private transport: typeof fetch = fetch,
  ) {}
  async read(
    table: Table,
    filters: Record<string, string> = {},
  ): Promise<any[]> {
    if (!Object.prototype.hasOwnProperty.call(voxiColumns, table))
      throw new Error("Fonte não permitida.");
    if (!this.key) throw new Error("Leitura do CRM ainda não configurada.");
    const fields = voxiColumns[table].split(",");
    for (const [field, value] of Object.entries(filters)) {
      if (
        !fields.includes(field) ||
        !/^(eq|in|gte|gt|lt|lte|is)\./.test(value) ||
        value.length > 15000
      )
        throw new Error("Filtro de leitura inválido.");
    }
    const output: any[] = [];
    for (let offset = 0; offset < 100000; ) {
      const url = new URL(
        "https://kjwtfnabcqrxzfilqlom.supabase.co/rest/v1/" + table,
      );
      url.searchParams.set("select", voxiColumns[table]);
      url.searchParams.set("order", "id.asc");
      for (const [field, value] of Object.entries(filters))
        url.searchParams.set(field, value);
      const response = await this.transport(url.toString(), {
        method: "GET",
        headers: {
          apikey: this.key,
          Authorization: "Bearer " + this.key,
          Range: offset + "-" + (offset + 999),
          Prefer: "count=exact",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível consultar o CRM (" + response.status + ").",
        );
      const batch = await response.json();
      if (!Array.isArray(batch)) throw new Error("Resposta inválida do CRM.");
      output.push(...batch);
      const rawTotal = response.headers.get("Content-Range")?.split("/")[1];
      const total =
        rawTotal && /^\d+$/.test(rawTotal) ? Number(rawTotal) : null;
      offset += batch.length;
      if (total !== null && offset < total && !batch.length)
        throw new Error("CRM retornou uma página incompleta.");
      if (
        (total !== null && offset >= total) ||
        (total === null && batch.length < 1000)
      ) {
        return [...new Map(output.map((row) => [row.id, row])).values()];
      }
    }
    throw new Error("Volume excede a consulta segura; reduza o período.");
  }
}
export const inIds = (ids: string[]) => {
  if (!ids.length || ids.some((x) => !/^[-a-f0-9]{36}$/i.test(x)))
    throw new Error("Escopo CRM inválido.");
  return "in.(" + ids.join(",") + ")";
};
export function deriveScope(accountId: string, instances: any[]) {
  const root = instances.find((x) => x.id === accountId);
  if (
    !root ||
    root.parent_instance_id ||
    root.connection_purpose === "mass_dispatch"
  )
    throw new Error("Selecione uma conta principal do CRM.");
  const found = new Set([accountId]);
  if (root.crm_scope_mode === "PIPELINE_ONLY" && !root.crm_scope_pipeline_id) {
    throw new Error("Conta de funil exclusivo sem funil definido no CRM.");
  }
  for (let i = 0; i < instances.length; i++)
    for (const x of instances)
      if (
        x.parent_instance_id &&
        found.has(x.parent_instance_id) &&
        x.connection_purpose !== "mass_dispatch"
      )
        found.add(x.id);
  return {
    ids: [...found],
    pipelineOnly:
      root.crm_scope_mode === "PIPELINE_ONLY"
        ? root.crm_scope_pipeline_id
        : null,
  };
}
