import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authCors } from "./staff-auth.ts";
// Public receipt status only: the unguessable response ID cannot choose recipients or mutate clients.
// Actual follow-up work is queued by the database only when the response is first inserted.
export async function onboardingReceipt(req: Request) {
  if(req.method==="OPTIONS") return new Response("ok",{headers:authCors});
  const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:authCors});
  if(req.method!=="POST") return reply({error:"method_not_allowed"},405);
  try {
    const raw=await req.text(); if(raw.length>256) return reply({error:"invalid_request"},400);
    const {response_id}=JSON.parse(raw);
    if(typeof response_id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(response_id)) return reply({error:"invalid_receipt"},400);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    const {data,error}=await db.from("onboarding_responses").select("id").eq("id",response_id).gte("created_at",new Date(Date.now()-86400000).toISOString()).maybeSingle();
    if(error) return reply({error:"unavailable"},503);
    if(!data) return reply({error:"invalid_receipt"},404);
    return reply({ok:true,status:"saved"},202);
  } catch { return reply({error:"invalid_request"},400); }
}
