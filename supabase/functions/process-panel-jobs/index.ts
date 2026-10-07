import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { requireMasterOrService, authFailure, authCors } from "../_shared/staff-auth.ts";
import { sendWhatsApp, lookupTeamPhone } from "../_shared/evolution.ts";
const INSTANCE = "voxi_executivo_d13a86fd";
const BASE = "https://bot-evolution-api.1lxz8u.easypanel.host";
function check(result: any) { if (result.error) throw new Error("database_operation_failed"); return result.data; }
async function audio(db: any, job: any) {
  const row = check(await db.from("whatsapp_conversas").select("group_id,mensagem,dados_extras").eq("id",job.source_id).single());
  if (!row.dados_extras?._retention?.transcription_pending) return;
  const registered = check(await db.from("whatsapp_grupos").select("id").eq("group_id",row.group_id).maybeSingle());
  if (!registered) return;
  const metadata = row.dados_extras;
  let encoded = metadata.data?.message?.base64;
  if (!encoded) {
    const key = Deno.env.get("EVOLUTION_API_KEY");
    const response = await fetch(BASE + "/chat/getBase64FromMediaMessage/" + encodeURIComponent(INSTANCE), {
      method:"POST", headers: { apikey:key!, "Content-Type":"application/json" },
      body:JSON.stringify({ message:{key:metadata.data?.key}, convertToMp4:false }), signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("audio_source_unavailable");
    const media = await response.json();
    encoded = media.base64;
    if (typeof encoded !== "string") throw new Error("audio_source_unavailable");
  }
  encoded = encoded.replace(/^data:[^,]+,/, "");
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded) || encoded.length > 30 * 1024 * 1024) throw new Error("audio_invalid_or_too_large");
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const mime = metadata.data?.message?.audioMessage?.mimetype?.split(";")[0] || "audio/ogg";
  const extensions: Record<string,string> = {"audio/ogg":"ogg","audio/mpeg":"mp3","audio/mp4":"m4a","audio/webm":"webm","audio/wav":"wav"};
  if (!extensions[mime]) throw new Error("audio_format_unsupported");
  const retained = {...metadata, data:{...metadata.data,message:{...metadata.data.message,base64:encoded}},
    _retention:{...metadata._retention,binary_audio_present:true}};
  check(await db.from("whatsapp_conversas").update({dados_extras:retained}).eq("id",job.source_id));
  const key = Deno.env.get("openai") || Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("transcription_not_configured");
  const form = new FormData();
  form.append("file",new Blob([bytes],{type:mime}),"audio."+extensions[mime]);
  form.append("model","whisper-1"); form.append("language","pt");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions",{
    method:"POST",headers:{Authorization:"Bearer "+key},body:form,signal:AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error("transcription_provider_"+response.status);
  const value = await response.json();
  if (typeof value.text !== "string" || !value.text.trim()) throw new Error("transcription_empty");
  check(await db.from("whatsapp_conversas").update({mensagem:"[Áudio] "+value.text.trim(),
    dados_extras:{...retained,_retention:{...retained._retention,transcription_pending:false,transcribed_at:new Date().toISOString()}}
  }).eq("id",job.source_id));
}
async function onboarding(db:any, job:any) {
  const row=check(await db.from("onboarding_responses").select("*").eq("id",job.source_id).single());
  const group=check(await db.from("whatsapp_grupos").select("nome,gestor_responsavel").eq("group_id",row.group_id).single());
  const form=row.responses || {}, name=String(form.clinic_name || form.business_name || group.nome).slice(0,200);
  const updates:Record<string,string>={};
  if (["Proprietário(a)","Sócio(a)"].includes(form.responsible_role)) {
    if (typeof form.responsible_name === "string") updates.responsavel_master=form.responsible_name.slice(0,200);
    const birthday=String(form.responsible_birthday || "").match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?$/);
    if (birthday) {
      const date=(birthday[3] || "2000")+"-"+birthday[2].padStart(2,"0")+"-"+birthday[1].padStart(2,"0");
      const parsed=new Date(date);
      if (Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date)) updates.aniversario_cliente=date;
    }
  }
  const cnpj=String(form.cnpj || "").replace(/\D/g,"");
  if (cnpj.length===14) {
    try {
      const result=await fetch("https://brasilapi.com.br/api/cnpj/v1/"+cnpj,{signal:AbortSignal.timeout(8000)});
      if(result.ok) { const company=await result.json(); if (/^\d{4}-\d{2}-\d{2}$/.test(company.data_inicio_atividade)) updates.aniversario_empresa=company.data_inicio_atividade; }
    } catch { /* Company lookup is optional; the form is already safely persisted. */ }
  }
  if(Object.keys(updates).length) check(await db.from("whatsapp_grupos").update(updates).eq("group_id",row.group_id));
  check(await db.from("tasks").upsert({id:row.id,title:"Agendar call de onboarding — "+name,
    description:"Briefing recebido. Revisar respostas, alinhar acessos e agendar a primeira reunião.",
    assigned_to:group.gestor_responsavel || "Alisson",group_id:row.group_id,priority:"alta",status:"pendente",created_by:"Sistema (Onboarding Automático)"
  },{onConflict:"id",ignoreDuplicates:true}));
  const notices=[{job_key:"onboarding-group:"+row.id,kind:"notification",source_id:row.id,
    payload:{destination:row.group_id,text:"🆕 *Onboarding recebido — Newvox*\n\nRecebemos o briefing de *"+name+"*. Nosso time vai revisar suas respostas e combinar a reunião de alinhamento dos próximos passos.\n\nObrigado por preencher!"}}];
  if(group.gestor_responsavel) {
    const aliases:Record<string,string>={"Murilo Araújo":"Murillo","Netto Monge":"Netto","Priscilla Borges":"Priscilla"};
    const phone=await lookupTeamPhone(db,[aliases[group.gestor_responsavel] || group.gestor_responsavel,group.gestor_responsavel]);
    if(phone) notices.push({job_key:"onboarding-manager:"+row.id,kind:"notification",source_id:row.id,
      payload:{destination:phone,text:"🆕 *Onboarding recebido*\n\n"+name+" preencheu o briefing. A tarefa de agendar a reunião está no Painel Newvox."}});
  }
  check(await db.from("panel_jobs").upsert(notices,{onConflict:"job_key",ignoreDuplicates:true}));
}
export async function processJobs(db:any) {
  // A crashed send is never retried automatically: delivery could already have happened.
  check(await db.from("panel_jobs").update({status:"uncertain",last_error:"delivery_requires_review"})
    .eq("kind","notification").eq("status","processing").lt("started_at",new Date(Date.now()-300000).toISOString()));
  check(await db.from("panel_jobs").update({status:"pending",available_at:new Date().toISOString()})
    .neq("kind","notification").eq("status","processing").lt("started_at",new Date(Date.now()-300000).toISOString()).lt("attempts",5));
  check(await db.from("panel_jobs").update({status:"failed",last_error:"worker_retry_limit"})
    .neq("kind","notification").eq("status","processing").lt("started_at",new Date(Date.now()-300000).toISOString()).gte("attempts",5));
  const jobs=check(await db.rpc("claim_panel_jobs")) || [];
  const results=await Promise.all(jobs.map(async (job:any)=>{
    try {
      if(job.kind==="audio") await audio(db,job);
      else if(job.kind==="onboarding") await onboarding(db,job);
      else {
        const sent=await sendWhatsApp(job.payload.destination,job.payload.text);
        if(!sent.ok) {
          const uncertain=sent.status===0 || sent.status>=500;
          check(await db.from("panel_jobs").update({status:uncertain?"uncertain":"failed",last_error:"evolution_"+sent.status}).eq("job_key",job.job_key));
          return {kind:job.kind,status:uncertain?"uncertain":"failed"};
        }
      }
      check(await db.from("panel_jobs").update({status:"done",completed_at:new Date().toISOString(),last_error:null}).eq("job_key",job.job_key));
      return {kind:job.kind,status:"done"};
    } catch(e) {
      const status=job.kind==="notification"?"uncertain":job.attempts>=5?"failed":"pending";
      check(await db.from("panel_jobs").update({status,last_error:e instanceof Error?e.message:"processing_failed",
        available_at:new Date(Date.now()+Math.min(30,job.attempts*2)*60000).toISOString()}).eq("job_key",job.job_key));
      return {kind:job.kind,status};
    }
  }));
  return {processed:results.length,results};
}
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:authCors});
  const denied=await requireMasterOrService(req).then(()=>null,authFailure); if(denied)return denied;
  try {
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
    return Response.json(await processJobs(db),{headers:authCors});
  } catch { return Response.json({error:"worker_unavailable"},{status:503,headers:authCors}); }
});
