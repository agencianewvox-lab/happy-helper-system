import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const EVOLUTION_BASE_URL = "https://bot-evolution-api.1lxz8u.easypanel.host";
const EVOLUTION_INSTANCE = "financeiro new vox";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const groupJid = url.searchParams.get('groupJid');
  if (!groupJid) {
    return new Response(JSON.stringify({ error: 'groupJid required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get("EVOLUTION_API_KEY")!;

  // Try multiple known endpoints
  const instance = url.searchParams.get('instance') || EVOLUTION_INSTANCE;
  const attempts = [
    `${EVOLUTION_BASE_URL}/instance/fetchInstances`,
    `${EVOLUTION_BASE_URL}/instance/connectionState/${encodeURIComponent(instance)}`,
    `${EVOLUTION_BASE_URL}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`,
    `${EVOLUTION_BASE_URL}/group/participants/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    `${EVOLUTION_BASE_URL}/group/findGroupInfos/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  ];

  const results: any[] = [];
  for (const u of attempts) {
    const r = await fetch(u, { headers: { apikey: apiKey } });
    const body = await r.text();
    results.push({ url: u, status: r.status, body: body.slice(0, 5000) });
    if (r.ok && u.includes('/group/participants/')) break;
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
