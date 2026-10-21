import { supabase } from "@/integrations/supabase/client";
export type Meeting = {
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  owner_name?: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  partial: boolean;
  error: string | null;
  reviewed_at: string | null;
  version: number;
  uploaded_chunks?: number;
  transcribed_chunks?: number;
};
export type MeetingDetail = Meeting & {
  transcript: string | null;
  review_notes: string | null;
  summary: {
    summary: string;
    decisions: string[];
    goals: string[];
    actions: string[];
    openQuestions: string[];
  } | null;
  chunks: { seq: number; status: string; transcript: string | null }[];
  tasks: { item_index: number; task_id: string }[];
};
export type MeetingDevice = {
  id: string;
  user_id: string;
  user_name: string;
  label: string;
  status: "pending" | "approved" | "revoked";
  last_seen_at: string | null;
  created_at: string;
  extension_version: string;
};
export type MeetingBootstrap = {
  actor: { userId: string; isMaster: boolean; name: string };
  clients: { id: string; name: string }[];
  devices: MeetingDevice[];
  meetings: Meeting[];
  audit: {
    id: number;
    actor_name: string;
    device_id: string | null;
    meeting_id: string | null;
    action: string;
    created_at: string;
  }[];
};
export const meetingStatus: Record<string, string> = {
  recording: "Capturando",
  paused: "Pausada",
  finalizing: "Processando trechos",
  interrupted: "Interrompida · sincronizar extensão",
  processing: "Organizando alinhamentos",
  ready: "Pronta para revisão",
  failed: "Precisa de atenção",
};
export const auditLabels: Record<string, string> = {
  extension_downloaded: "Baixou a extensão",
  session_authorized: "Autorizou uma sessão",
  session_ended: "Encerrou a sessão",
  device_approved: "Aprovou dispositivo",
  device_revoked: "Bloqueou dispositivo",
  recording_started_consent_confirmed: "Iniciou registro · aviso confirmado",
  recording_stopped: "Encerrou registro",
  transcription_ready: "Transcrição concluída",
  meeting_viewed: "Consultou reunião",
  meeting_reviewed: "Revisou alinhamentos",
  task_created: "Criou tarefa revisada",
  processing_retried: "Solicitou reprocessamento",
  partial_finalized: "Finalizou explicitamente um registro parcial",
};
export async function meetingsApi<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("meetings-api", {
    body: { action, payload },
  });
  if (error) {
    let message = "Não foi possível acessar as reuniões. Tente novamente.";
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* Safe fallback. */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export async function downloadMeetingExtension() {
  const { data, error } = await supabase.functions.invoke("meetings-api", {
    body: { action: "download" },
  });
  if (error || !(data instanceof Blob))
    throw new Error(
      "Não foi possível baixar a extensão. Confira seu acesso e tente novamente.",
    );
  const url = URL.createObjectURL(data),
    a = document.createElement("a");
  a.href = url;
  a.download = "newvox-reunioes-1.0.0.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function meetingDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString("pt-BR")
    : "Ainda não utilizado";
}
