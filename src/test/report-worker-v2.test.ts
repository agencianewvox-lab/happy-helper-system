// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { processReportRuns } from "../../supabase/functions/_shared/report-worker";
import { defaultSettings } from "../../supabase/functions/_shared/report-model";

function harness(options:{authorized?:boolean;archived?:boolean;accepted?:boolean;phone?:string}={}) {
  const run:any={id:"run",client_id:"client",owner_user_id:"owner",status:"queued",attempts:0,lease_token:null,expires_at:new Date(Date.now()+900000).toISOString(),
    snapshot:{manual:true,groupId:"1@g.us",account:"123",name:"Client",settings:{...defaultSettings,dataMode:"meta",metrics:["spend"],ranking:"spend"},
      prepared:{message:"Exact reviewed message",result:{metrics:{}},senderPhone:"5511999999999"}}};
  const records:any={
    whatsapp_grupos:{id:"client",group_id:"1@g.us",ad_account_id:"123",archived_at:options.archived?"2026-01-01":null},
    report_connections:{user_id:"owner"},report_sources:null,report_configs:null,
  };
  const writes:any[]=[];
  const db={
    from(table:string){
      let values:any=null;const filters:any[]=[];
      const q:any={
        update(v:any){values=v;return q;},select(){return q;},
        eq(k:string,v:unknown){filters.push([k,v]);return q;},
        lt(){return q;},gte(){return q;},lte(){return q;},
        single(){return q;},maybeSingle(){return q;},
        then(resolve:any,reject:any){
          let data=records[table];
          if(table==="report_runs" && values){
            // Recovery queries do not target this fresh run. Lease/status conditions are enforced.
            if(filters.some(([k,v])=>k==="id"&&v===run.id) && filters.every(([k,v])=>run[k]===v)){
              writes.push(values);Object.assign(run,values);data={id:run.id};
            }else data=null;
          }
          return Promise.resolve({data,error:null}).then(resolve,reject);
        }
      };return q;
    },
    rpc:vi.fn(async(name:string)=>{
      if(name==="claim_panel_report_runs_v2"){
        if(run.status!=="queued")return {data:[],error:null};
        run.status="processing";run.attempts++;run.lease_token="lease-"+run.attempts;
        return {data:[{...run}],error:null};
      }
      if(name==="panel_report_sender_allowed")return {data:true,error:null};
      if(name==="authorize_panel_report_dispatch"){
        if(options.authorized===false)return {data:false,error:null};
        run.status="sending";return {data:true,error:null};
      }
      throw Error(name);
    }),
  };
  const deps={
    collect:vi.fn(),verify:vi.fn().mockResolvedValue(undefined),identity:vi.fn().mockResolvedValue(options.phone||"5511999999999"),
    dispatch:vi.fn().mockResolvedValue(options.accepted===false?{status:"uncertain",error:"timeout"}:{status:"accepted",id:"provider-id"}),
  };
  const process=()=>processReportRuns(db,{targetRunId:run.id,crmKey:"",metaKey:""},deps);
  return {run,writes,deps,db,process};
}
describe("Report worker: controlled provider, no real messages",()=>{
  it("persists and sends the exact confirmed content once under concurrent workers",async()=>{
    const h=harness();await Promise.all([h.process(),h.process()]);
    expect(h.deps.dispatch).toHaveBeenCalledExactlyOnceWith("owner","1@g.us","Exact reviewed message",true);
    expect(h.writes[0].message).toBe("Exact reviewed message");
    expect(h.run.status).toBe("accepted");expect(h.deps.collect).not.toHaveBeenCalled();
  });
  it("does not send when final authorization revoked access",async()=>{
    const h=harness({authorized:false});await h.process();
    expect(h.deps.dispatch).not.toHaveBeenCalled();expect(h.run.status).toBe("skipped");
  });
  it("does not send an archived client",async()=>{
    const h=harness({archived:true});await h.process();
    expect(h.deps.dispatch).not.toHaveBeenCalled();expect(h.run.status).toBe("skipped");
  });
  it("does not silently substitute a different sender number",async()=>{
    const h=harness({phone:"5522999999999"});await h.process();
    expect(h.deps.dispatch).not.toHaveBeenCalled();expect(h.run.error).toMatch(/Número/);
  });
  it("only retries failures before dispatch, with a bounded attempt count",async()=>{
    const h=harness();h.deps.verify.mockRejectedValue(new Error("Unavailable"));
    await h.process();expect(h.run.status).toBe("queued");
    await h.process();await h.process();expect(h.run.status).toBe("failed");expect(h.run.attempts).toBe(3);
    expect(h.deps.dispatch).not.toHaveBeenCalled();
  });
  it("marks provider timeouts uncertain and never resends automatically",async()=>{
    const h=harness({accepted:false});await h.process();await h.process();
    expect(h.run.status).toBe("uncertain");expect(h.deps.dispatch).toHaveBeenCalledTimes(1);
  });
  it("does not alter a manual sender's saved schedule",async()=>{
    const h=harness();await h.process();
    expect(h.db.rpc.mock.calls.some(([name])=>name==="authorize_panel_report_dispatch")).toBe(true);
    expect(h.run.snapshot.manual).toBe(true);
  });
});
