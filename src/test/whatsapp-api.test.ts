// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleWhatsapp } from '../../server/whatsapp';

const fixture = vi.hoisted(() => ({
  profile: { full_name: 'Alisson', role: 'admin', is_master: true } as Record<string, unknown> | null,
  user: { id: 'test-master' } as { id: string } | null,
  group: { group_id: '123@g.us', gestor_responsavel: 'Murilo Araújo' },
  registered: [] as { group_id: string }[],
  registeredError: null as null | { message: string },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: fixture.user }, error: null }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'not', 'gte', 'order', 'limit']) query[method] = () => query;
    query.single = async () => ({ data: table === 'profiles' ? fixture.profile : fixture.group, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'whatsapp_grupos' ? fixture.registered : [], count: 0, error: table === 'whatsapp_grupos' ? fixture.registeredError : null }).then(resolve);
    return query;
  },
}) }));
const request = (method = 'GET', body?: unknown) => new Request('https://paineldecontrole.newvox.site/api/whatsapp', { method, headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
beforeEach(() => { fixture.profile = { full_name: 'Alisson', role: 'admin', is_master: true }; fixture.user = { id: 'test-master' }; fixture.registered = []; fixture.registeredError = null; vi.stubEnv('EVOLUTION_API_KEY', 'test-key-not-real'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('WhatsApp API permissions and truthful results', () => {
  it('asks Evolution to render a link preview without changing the message or recipient', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ instance: { state: 'open' } })).mockResolvedValueOnce(Response.json({ key: { id: 'preview-test' } }));
    vi.stubGlobal('fetch', fetch);
    const message = '*New Vox*\nhttps://paineldecontrole.newvox.site/onboardingnv/123%40g.us/clinica';
    expect((await handleWhatsapp(request('POST', { group_id: '123@g.us', message }))).status).toBe(200);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ number: '123@g.us', text: message, linkPreview: true });
  });
  it('rejects anonymous access', async () => { expect((await handleWhatsapp(new Request('https://example.test/api/whatsapp'))).status).toBe(401); });
  it('rejects an invalid session', async () => { fixture.user = null; expect((await handleWhatsapp(request())).status).toBe(401); });
  it('rejects removed team profiles', async () => { fixture.profile = null; expect((await handleWhatsapp(request())).status).toBe(403); });
  it('keeps diagnostics Master-only', async () => { fixture.profile = { full_name: 'Murillo', role: 'gestor', is_master: false }; expect((await handleWhatsapp(request())).status).toBe(403); });
  it('reports missing secrets rather than connected', async () => { vi.stubEnv('EVOLUTION_API_KEY', ''); expect((await handleWhatsapp(request())).status).toBe(503); });
  it('rejects non-group destinations', async () => { expect((await handleWhatsapp(request('POST', { group_id: '5511999999999', message: 'hello' }))).status).toBe(400); });
  it('prevents sending to another gestor group', async () => { fixture.profile = { full_name: 'Netto', role: 'gestor', is_master: false }; expect((await handleWhatsapp(request('POST', { group_id: '123@g.us', message: 'hello' }))).status).toBe(403); });
  it('does not send while disconnected', async () => { const fetch = vi.fn().mockResolvedValue(Response.json({ instance: { state: 'close' } })); vi.stubGlobal('fetch', fetch); expect((await handleWhatsapp(request('POST', { group_id: '123@g.us', message: 'hello' }))).status).toBe(409); expect(fetch).toHaveBeenCalledTimes(1); });
  it('requires a message id before confirming acceptance', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ instance: { state: 'open' } })).mockResolvedValueOnce(Response.json({}))); expect((await handleWhatsapp(request('POST', { group_id: '123@g.us', message: 'hello' }))).status).toBe(502); });
  it('reports acceptance, not delivery', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ instance: { state: 'open' } })).mockResolvedValueOnce(Response.json({ key: { id: 'test-message' }, status: 'PENDING' }))); const result = await (await handleWhatsapp(request('POST', { group_id: '123@g.us', message: 'hello' }))).json(); expect(result.accepted).toBe(true); expect(result.providerStatus).toBe('PENDING'); expect(result.delivered).toBeUndefined(); });
  it('separates connected from reception, and redacts webhook credentials', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ instance: { state: 'open' } })).mockResolvedValueOnce(Response.json({ enabled: true, url: 'https://receiver.test/webhook?token=do-not-leak', events: ['MESSAGES_UPSERT'] }))); const result = await (await handleWhatsapp(request())).json(); expect(result.connection).toBe('open'); expect(result.reception.messages24h).toBe(0); expect(result.webhook.host).toBe('receiver.test'); expect(result.webhook.targetMatches).toBe(false); expect(result.webhook.messagesEventEnabled).toBe(true); expect(JSON.stringify(result)).not.toContain('do-not-leak'); });
  it('checks the panel destination and required event independently', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ instance: { state: 'open' } })).mockResolvedValueOnce(Response.json({ enabled: true, url: 'https://fmipenijdipscnqhtwvy.supabase.co/functions/v1/whatsapp-webhook', events: ['CONNECTION_UPDATE'] }))); const result = await (await handleWhatsapp(request())).json(); expect(result.webhook.targetMatches).toBe(true); expect(result.webhook.messagesEventEnabled).toBe(false); });
});

const discoveryRequest = () => new Request('https://paineldecontrole.newvox.site/api/whatsapp?action=discover-groups', { headers: { Authorization: 'Bearer test-session' } });
describe('Group discovery API', () => {
  it('allows registered team members, excludes existing groups and makes no send call', async () => {
    fixture.profile = { full_name: 'Murillo', role: 'gestor', is_master: false };
    fixture.registered = [{ group_id: '123@g.us' }];
    const fetch = vi.fn().mockImplementation(async (url: string) => url.includes('/group/fetchAllGroups/')
      ? Response.json([{ id: '123@g.us', subject: 'Existente' }, { id: '456@g.us', subject: 'Novo', participants: [{ id: 'private-phone' }] }])
      : Response.json([{ remoteJid: '456@g.us', lastMessage: { messageTimestamp: 1791028800, message: 'private-text' } }]));
    vi.stubGlobal('fetch', fetch);
    const response = await handleWhatsapp(discoveryRequest());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.groups.map((group: { group_id: string }) => group.group_id)).toEqual(['456@g.us']);
    expect(result.activityAvailable).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://bot-evolution-api.1lxz8u.easypanel.host/group/fetchAllGroups/voxi_executivo_d13a86fd?getParticipants=false',
      'https://bot-evolution-api.1lxz8u.easypanel.host/chat/findChats/voxi_executivo_d13a86fd',
    ]);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('keeps group selection available when message metadata is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => url.includes('/group/fetchAllGroups/')
      ? Response.json([{ id: '456@g.us', subject: 'Novo' }]) : new Response('', { status: 500 })));
    const result = await (await handleWhatsapp(discoveryRequest())).json();
    expect(result.groups).toHaveLength(1);
    expect(result.activityAvailable).toBe(false);
  });
  it('fails safely when registered groups cannot be checked', async () => {
    fixture.registeredError = { message: 'database unavailable' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])));
    const response = await handleWhatsapp(discoveryRequest());
    expect(response.status).toBe(503);
    expect((await response.json()).groups).toBeUndefined();
  });
  it('rejects anonymous discovery and unknown roles before contacting Evolution', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await handleWhatsapp(new Request('https://example.test/api/whatsapp?action=discover-groups'))).status).toBe(401);
    fixture.profile = { role: 'external', is_master: false };
    expect((await handleWhatsapp(discoveryRequest())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports a provider error instead of presenting an empty list as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'malformed' })));
    const response = await handleWhatsapp(discoveryRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('buscar os grupos');
  });
});
