import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireMasterOrService, authFailure } from "../_shared/staff-auth.ts";
import { enqueueSchedules, processReportRuns } from "../_shared/report-worker.ts";
Deno.serve(async req => {
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  try { await requireMasterOrService(req); } catch(e){return authFailure(e);}
  try {
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    await enqueueSchedules(db);
    const result=await processReportRuns(db,{crmKey:Deno.env.get("VOXI_READ_KEY")||"",metaKey:Deno.env.get("META_ADS_ACCESS_TOKEN")||""});
    return Response.json(result);
  } catch { return Response.json({error:"Não foi possível concluir o ciclo da agenda."},{status:503}); }
});
