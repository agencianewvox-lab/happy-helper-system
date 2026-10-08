import { supabase } from "@/integrations/supabase/client";
export type Publication = {
  id: string;
  post_id: string;
  client_id: string;
  instagram_id: string;
  status: string;
  due_at: string;
  media_id: string | null;
  permalink: string | null;
  error: string | null;
  updated_at: string;
};
export const publicationLabels: Record<string, string> = {
  queued: "Agendado",
  processing: "Preparando no Instagram",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Precisa de ajuste",
  uncertain: "Confirmando envio",
  cancelled: "Cancelado",
};
export async function publishingApi<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("social-publishing", {
    body,
  });
  if (error) {
    let message = "Não foi possível concluir.";
    try {
      message = (await error.context?.json())?.error || message;
    } catch {
      /* empty */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export type InstagramReport = {
  clientName: string;
  username: string;
  range: { from: string; to: string };
  generatedAt: string;
  followers: number | null;
  metrics: Record<string, number | null>;
  warnings: string[];
  media: {
    id: string;
    caption: string;
    type: string;
    timestamp: string;
    permalink: string | null;
    thumbnail: string | null;
    likes: number | null;
    comments: number | null;
  }[];
};
