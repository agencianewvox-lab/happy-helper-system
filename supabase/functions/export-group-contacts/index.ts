import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BASE = "https://bot-evolution-api.1lxz8u.easypanel.host";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'listInstances';
  const instance = url.searchParams.get('instance') || '';
  const groupJid = url.searchParams.get('groupJid') || '';
  const apiKey = Deno.env.get("EVOLUTION_API_KEY")!;

  let target = '';
  if (action === 'listInstances') target = `${BASE}/instance/fetchInstances`;
  else if (action === 'participants') target = `${BASE}/group/participants/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`;
  else if (action === 'info') target = `${BASE}/group/findGroupInfos/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`;
  else if (action === 'allGroups') target = `${BASE}/group/fetchAllGroups/${encodeURIComponent(instance)}?getParticipants=false`;

  const r = await fetch(target, { headers: { apikey: apiKey } });
  const body = await r.text();
  return new Response(body, { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
