import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

export const authCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
export function authFailure(error: unknown): Response {
  if (error instanceof Response) return error;
  return Response.json({ error: "Não foi possível validar o acesso." }, { status: 503, headers: authCors });
}
export async function requireStaff(req: Request, masterOnly = false) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw Response.json({ error: "Entre novamente para continuar." }, { status: 401, headers: authCors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !user) throw Response.json({ error: "Sessão inválida." }, { status: 401, headers: authCors });
  // RLS verifies that this profile's user is active (including banned/deleted checks).
  const { data: profile, error: profileError } = await db.from("profiles").select("full_name,role,is_master").eq("user_id", user.id).single();
  if (profileError || !profile) throw Response.json({ error: "Acesso não autorizado." }, { status: 403, headers: authCors });
  const isMaster = profile.is_master === true || profile.role === "admin";
  if (masterOnly && !isMaster) throw Response.json({ error: "Área exclusiva do Master." }, { status: 403, headers: authCors });
  return { db, user, profile, isMaster };
}
/** Verify internal callers through Supabase, since issued service JWTs can differ in value. */
async function isVerifiedService(req: Request): Promise<boolean> {
  const authorization=req.headers.get("authorization");
  if(!authorization?.startsWith("Bearer ")) return false;
  // Untrusted hint only; the database must authenticate the signature and service-only grant.
  try {
    const payload=JSON.parse(atob(authorization.slice(7).split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    if(payload.role!=="service_role") return false;
  } catch { return false; }
  try {
    const response=await fetch(Deno.env.get("SUPABASE_URL")!+"/rest/v1/rpc/verify_panel_service",{
      method:"POST",headers:{apikey:Deno.env.get("SUPABASE_ANON_KEY")!,Authorization:authorization,"Content-Type":"application/json"},
      body:"{}",signal:AbortSignal.timeout(8000),
    });
    return response.ok && await response.json()===true;
  } catch { return false; }
}
export async function requireMasterOrService(req: Request) {
  if (await isVerifiedService(req)) return;
  await requireStaff(req, true);
}
export async function requireAnalyticsCaller(req: Request) {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (expected && await isVerifiedService(req)) {
    return { db: createClient(Deno.env.get("SUPABASE_URL")!, expected, { auth: { persistSession: false } }), isMaster: true };
  }
  return requireStaff(req);
}
