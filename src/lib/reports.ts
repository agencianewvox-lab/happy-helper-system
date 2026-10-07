import { supabase } from "@/integrations/supabase/client";
export {
  defaultSettings,
  metricLabels,
} from "../../supabase/functions/_shared/report-model";
export type {
  ReportSettings,
  Metric,
} from "../../supabase/functions/_shared/report-model";
export type ReportClient = {
  id: string;
  nome: string;
  group_id: string;
  ad_account_id: string | null;
  gestor_responsavel: string | null;
};
export type ReportConfig = {
  client_id: string;
  owner_user_id: string;
  enabled: boolean;
  version: number;
  settings: import("../../supabase/functions/_shared/report-model").ReportSettings;
};
export type ReportSource = {
  client_id: string;
  crm_account_id: string;
  pipeline_ids: string[];
  pipeline_only: string | null;
  version: number;
};
export type ReportRun = {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  message: string | null;
  error: string | null;
};
export type ReportBootstrap = {
  clients: ReportClient[];
  configs: ReportConfig[];
  sources: ReportSource[];
  connection: { status: string } | null;
  runs: ReportRun[];
  profiles: { user_id: string; full_name: string }[];
};
export async function reportsApi<T = Record<string, unknown>>(
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("reports-api", {
    body: payload,
  });
  if (error) {
    let message = "Não foi possível concluir. Tente novamente.";
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* safe fallback */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const runLabels: Record<string, string> = {
  queued: "Na fila",
  processing: "Preparando",
  accepted: "Aceito pela Evolution",
  failed: "Falhou",
  uncertain: "Conferir no grupo",
  skipped: "Cancelado / expirado",
};
