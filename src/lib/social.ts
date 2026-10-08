import { supabase } from "@/integrations/supabase/client";
export {
  statusLabels,
  formatLabels,
} from "../../supabase/functions/_shared/social-model";
export type {
  SocialPost,
  SocialStatus,
  SocialAsset,
} from "../../supabase/functions/_shared/social-model";
export type SocialClient = { id: string; nome: string; can_approve: boolean };
export type SocialBootstrap = {
  clients: SocialClient[];
  posts: import("../../supabase/functions/_shared/social-model").SocialPost[];
  members: { client_id: string; user_id: string; can_approve: boolean }[];
  profiles: { user_id: string; full_name: string }[];
  integration: { ready: boolean; message: string };
};
export async function socialApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("social-api", {
    body,
  });
  if (error) {
    let message = "Não foi possível concluir. Tente novamente.";
    try {
      const result = await error.context?.json();
      message = result?.error || message;
    } catch {
      /* no response body */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export function editorialDate(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso))
    : "";
}
export function localInput(iso: string | null) {
  return iso
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .format(new Date(iso))
        .replace(" ", "T")
    : "";
}
export function utcInput(value: string) {
  return value ? new Date(value + "-03:00").toISOString() : null;
}
