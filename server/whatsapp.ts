import { createClient } from '@supabase/supabase-js';
import database from './public-database.json' with { type: 'json' };
import { discoverGroups, isWhatsappGroupId } from '../src/lib/group-discovery.js';

const BASE = 'https://bot-evolution-api.1lxz8u.easypanel.host';
const INSTANCE = 'voxi_executivo_d13a86fd';
const names: Record<string, string> = { Murillo: 'Murilo Araújo', Murilo: 'Murilo Araújo', Netto: 'Netto Monge', Neto: 'Netto Monge' };
export function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export async function handleWhatsapp(request: Request) {
  try {
    if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Método não permitido.' }, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Entre novamente para continuar.' }, 401);
    const db = createClient(database.url, database.publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !user) return reply({ error: 'Sessão inválida. Entre novamente.' }, 401);
    const { data: profile, error: profileError } = await db.from('profiles').select('full_name,role,is_master').eq('user_id', user.id).single();
    if (profileError || !profile) return reply({ error: 'Acesso não autorizado.' }, 403);
    const discovery = request.method === 'GET' && new URL(request.url).searchParams.get('action') === 'discover-groups';
    if (discovery && !profile.is_master && !['admin', 'gestor'].includes(profile.role)) return reply({ error: 'Você não tem permissão para cadastrar clientes.' }, 403);
    if (request.method === 'GET' && !discovery && !profile.is_master) return reply({ error: 'Esta área é exclusiva do Acesso Master.' }, 403);
    const apiKey = process.env.EVOLUTION_API_KEY;
    if (!apiKey) return reply({ error: 'A chave da Evolution não está disponível neste deploy. Contate o administrador.' }, 503);
    async function evolution(path: string, body?: unknown, query = '', timeout = 15000) {
      const response = await fetch(BASE + path + '/' + encodeURIComponent(INSTANCE) + query, {
        method: body ? 'POST' : 'GET', headers: { apikey: apiKey!, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error('EVOLUTION_UNAVAILABLE');
      return response.json();
    }
    if (discovery) {
      const [rawGroups, chats, registered] = await Promise.all([
        evolution('/group/fetchAllGroups', undefined, '?getParticipants=false', 35000),
        // A read-only search: no WhatsApp messages are sent or marked as read.
        evolution('/chat/findChats', { take: 1000 }).then(value => ({ value, ok: Array.isArray(value) })).catch(() => ({ value: null, ok: false })),
        db.from('whatsapp_grupos').select('group_id'),
      ]);
      if (registered.error || !registered.data) return reply({ error: 'Não foi possível conferir os clientes já cadastrados. Tente novamente.' }, 503);
      return reply({
        ...discoverGroups(rawGroups, chats.value, registered.data.map(group => group.group_id)),
        checkedAt: new Date().toISOString(),
        activityAvailable: chats.ok,
      });
    }
    if (request.method === 'GET') {
      const [stateResult, webhookResult, latest, recent, groups] = await Promise.all([
        evolution('/instance/connectionState').then(value => ({ value, ok: true })).catch(() => ({ value: null, ok: false })),
        evolution('/webhook/find').then(value => ({ value, ok: true })).catch(() => ({ value: null, ok: false })),
        db.from('whatsapp_conversas').select('recebido_em,group_id').not('group_id', 'is', null).order('recebido_em', { ascending: false }).limit(1),
        db.from('whatsapp_conversas').select('id', { count: 'exact', head: true }).not('group_id', 'is', null).gte('recebido_em', new Date(Date.now() - 86400000).toISOString()),
        db.from('whatsapp_grupos').select('group_id,nome,categoria,responsavel_master').order('nome'),
      ]);
      const webhook = webhookResult.value?.webhook ?? webhookResult.value;
      let webhookHost: string | null = null;
      let targetMatches = false;
      try { webhookHost = new URL(webhook?.url).hostname; } catch { /* Never expose webhook credentials or query strings. */ }
      try {
        const configured = new URL(webhook?.url);
        const expected = new URL('/functions/v1/whatsapp-webhook', database.url);
        targetMatches = configured.origin === expected.origin && configured.pathname.replace(/\/$/, '') === expected.pathname;
      } catch { /* Invalid or missing destination is reported as unmatched. */ }
      const events = Array.isArray(webhook?.events) ? webhook.events : [];
      return reply({
        checkedAt: new Date().toISOString(), instance: INSTANCE,
        connection: stateResult.ok ? stateResult.value?.instance?.state ?? 'unknown' : 'unavailable',
        webhook: { checked: webhookResult.ok, enabled: webhook?.enabled === true, host: webhookHost, targetMatches, messagesEventEnabled: events.some((event: unknown) => typeof event === 'string' && event.toUpperCase() === 'MESSAGES_UPSERT') },
        reception: { available: !latest.error && !recent.error, lastMessageAt: latest.data?.[0]?.recebido_em ?? null, messages24h: recent.error ? null : recent.count ?? 0 },
        groups: groups.data ?? [], groupsAvailable: !groups.error,
      });
    }
    const raw = await request.text();
    if (raw.length > 16000) return reply({ error: 'Mensagem muito longa.' }, 413);
    let input: { group_id?: string; message?: string };
    try { input = JSON.parse(raw); } catch { return reply({ error: 'Solicitação inválida.' }, 400); }
    if (!input || typeof input.group_id !== 'string' || !isWhatsappGroupId(input.group_id) || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 8000) return reply({ error: 'Selecione um grupo válido e informe a mensagem.' }, 400);
    const { data: group, error: groupError } = await db.from('whatsapp_grupos').select('group_id,gestor_responsavel').eq('group_id', input.group_id).single();
    if (groupError || !group) return reply({ error: 'Grupo não encontrado no painel.' }, 404);
    if (!profile.is_master && profile.role !== 'admin' && (!names[profile.full_name] || group.gestor_responsavel !== names[profile.full_name])) return reply({ error: 'Você não tem permissão para enviar a este grupo.' }, 403);
    const state = await evolution('/instance/connectionState');
    if (state?.instance?.state !== 'open') return reply({ error: 'O WhatsApp não está conectado. Peça ao Master para verificar a conexão.' }, 409);
    const sent = await evolution('/message/sendText', { number: input.group_id, text: input.message.trim(), linkPreview: true });
    if (!sent?.key?.id) return reply({ error: 'A Evolution não confirmou o envio. Consulte o WhatsApp antes de tentar novamente.' }, 502);
    return reply({ accepted: true, messageId: sent.key.id, providerStatus: typeof sent.status === 'string' ? sent.status : 'PENDING', acceptedAt: new Date().toISOString() });
  } catch {
    const discovery = request.method === 'GET' && new URL(request.url).searchParams.get('action') === 'discover-groups';
    return reply({ error: discovery
      ? 'Não foi possível buscar os grupos. Confira a conexão na área WhatsApp central e tente novamente, ou use o cadastro manual.'
      : 'Não foi possível confirmar a operação com a Evolution. Se tentou enviar, confira o WhatsApp antes de repetir.' }, 502);
  }
}
