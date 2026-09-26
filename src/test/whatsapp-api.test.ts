// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleWhatsapp } from '../../server/whatsapp';

const fixture = vi.hoisted(() => ({
  profile: { full_name: 'Alisson', role: 'admin', is_master: true } as Record<string, unknown> | null,
  user: { id: 'test-master' } as { id: string } | null,
  group: { group_id: '123@g.us', gestor_responsavel: 'Murilo Araújo' },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { getUser: async () => ({ data: { user: fixture.user }, error: null }) },
  from: (table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'not', 'gte', 'order', 'limit']) query[method] = () => query;
    query.single = async () => ({ data: table === 'profiles' ? fixture.profile : fixture.group, error: null });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    return query;
  },
}) }));
const request = (method = 'GET', body?: unknown) => new Request('https://paineldecontrole.newvox.site/api/whatsapp', { method, headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
beforeEach(() => { fixture.profile = { full_name: 'Alisson', role: 'admin', is_master: true }; fixture.user = { id: 'test-master' }; vi.stubEnv('EVOLUTION_API_KEY', 'test-key-not-real'); });
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
