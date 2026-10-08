import { supabase } from "@/integrations/supabase/client";
export type InstagramAccount = {
  client_id: string;
  instagram_id: string;
  username: string;
  account_type: string;
  can_publish: boolean;
  expires_at: string;
  connected_at: string;
};
export async function instagramApi<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("social-instagram", {
    body,
  });
  if (error) {
    let message = "Não foi possível conectar o Instagram.";
    try {
      const result = await error.context?.json();
      message = result?.error || message;
    } catch {
      /* no body */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
