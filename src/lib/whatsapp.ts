import { supabase } from '@/integrations/supabase/client';

export async function whatsappRequest<T>(body?: { group_id: string; message: string }, action?: 'discover-groups'): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  const endpoint = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/whatsapp';
  const response = await fetch(action ? endpoint + '?action=' + action : endpoint, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json().catch(() => ({ error: 'A integração está indisponível neste deploy.' }));
  if (!response.ok || result.error) throw new Error(result.error || 'Não foi possível concluir.');
  return result as T;
}

export function publicFormUrl(path: string) {
  return new URL(path, 'https://paineldecontrole.newvox.site').toString();
}
