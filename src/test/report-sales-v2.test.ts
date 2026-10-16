// @vitest-environment node
import { describe, expect, it } from "vitest";
import { closedSales, verifiedSalesTotals } from "../../supabase/functions/_shared/report-sales";
import { defaultSettings, validateSettings, renderReport, nextExecutions, scheduleOccurrences } from "../../supabase/functions/_shared/report-model";
const now = new Date("2026-10-08T12:00:00Z");
const period = {start:"2026-10-01T03:00:00Z",end:"2026-10-08T03:00:00Z"};
const base = {instances:["account"],connections:[],budgets:[],pipelines:[],period,now,
  leads:[{id:"lead",whatsapp_instance_id:"account",lead_entered_at:"2020-01-01",pipeline_id:"p"}],
  opportunities:[{id:"deal",whatsapp_instance_id:"account",lead_id:"lead",status:"won",won_at:"2026-10-06T12:00:00Z",value:900,pipeline_id:"p"}],
  events:[{whatsapp_instance_id:"account",lead_id:"lead",provider:"META",attribution_status:"VERIFIED",ad_id:"123",occurred_at:"2020-01-01T12:00:00Z"}],
};
const connection={id:"connection",whatsapp_instance_id:"account",enabled:true,last_status:"ok",last_synced_at:now.toISOString()};
const budget={whatsapp_instance_id:"account",connection_id:"connection",clinicorp_budget_id:"budget",clinicorp_budget_status:"APPROVED",approved_at:"2026-10-06T12:00:00Z",budget_amount:1200,lead_id:"lead"};
describe("Closed sales: source, identity and attribution",()=>{
  it("counts a won deal from an old lead by closing date, never lead entry",()=>{
    const r=closedSales(base);expect(r.sales).toHaveLength(1);expect(r.sales[0].value).toBe(900);
  });
  it("does not count open, lost, canceled, out of period or other-account deals",()=>{
    const d=base.opportunities[0];
    expect(closedSales({...base,opportunities:[{...d,status:"lost"},{...d,status:"open"},{...d,won_at:period.end},{...d,whatsapp_instance_id:"other"}]}).sales).toEqual([]);
  });
  it("deduplicates deal IDs, not names, and counts distinct repeat purchases",()=>{
    const d=base.opportunities[0];
    expect(closedSales({...base,opportunities:[d,d,{...d,id:"second"}]}).sales).toHaveLength(2);
  });
  it("prefers approved Clinicorp budgets and never sums opportunities",()=>{
    const r=closedSales({...base,connections:[connection],budgets:[budget,budget,{...budget,clinicorp_budget_id:"canceled",clinicorp_budget_status:"CANCELED"}]});
    expect(r.source).toBe("clinicorp");expect(r.sales).toHaveLength(1);expect(r.sales[0].value).toBe(1200);
  });
  it("marks unavailable sync and missing approval dates instead of inventing zero",()=>{
    expect(closedSales({...base,connections:[{...connection,last_status:"error"}],budgets:[]}).available).toBe(false);
    const r=closedSales({...base,connections:[connection],budgets:[{...budget,approved_at:null,closed_at:"2026-10-06T12:00:00Z"}]});
    expect(r.available).toBe(false);expect(r.missingDate).toBe(1);
  });
  it("excludes declared origin, ambiguity, cross-client events and post-sale clicks",()=>{
    for(const events of [
      [{...base.events[0],attribution_status:"DECLARED"}],
      [base.events[0],{...base.events[0],ad_id:"456"}],
      [{...base.events[0],whatsapp_instance_id:"other"}],
      [{...base.events[0],occurred_at:"2026-10-07T12:00:00Z"}],
    ]){const r=closedSales({...base,events});expect(r.sales).toEqual([]);expect(r.excludedAttribution).toBe(1);}
  });
  it("requires ad account ownership and applies campaign selection without spend",()=>{
    const sales=closedSales(base).sales;
    expect(verifiedSalesTotals(sales,new Map(), "act_777",[]).sales).toBe(0);
    const ads=new Map([["123",{account_id:"777",campaign_id:"campaign"}]]);
    expect(verifiedSalesTotals(sales,ads,"act_777",[])).toMatchObject({sales:1,revenue:900});
    expect(verifiedSalesTotals(sales,ads,"777",["other"])).toMatchObject({sales:0,excludedCampaign:1});
    expect(verifiedSalesTotals(sales,ads,"999",[])).toMatchObject({sales:0,excludedAccount:1});
  });
  it("does not confuse missing value with zero revenue",()=>{
    const r=closedSales({...base,opportunities:[{...base.opportunities[0],value:null}]});
    expect(verifiedSalesTotals(r.sales,new Map([["123",{account_id:"777",campaign_id:"c"}]]),"777",[])).toMatchObject({sales:1,revenue:null});
  });
});
describe("Review and schedule v2 safeguards",()=>{
  it("never inserts unselected sales through ranking, variables, warnings or footer",()=>{
    const s={...defaultSettings,metrics:["leads" as const],campaignIds:["1"]};
    const text=renderReport("Client",s,{period:{startDate:"1",endDate:"7"},metrics:{leads:4,sales:99},ads:[{name:"Ad",leads:4,sales:99}],warnings:["99 vendas excluídas"]});
    expect(text).not.toMatch(/vendas|99/i);
    expect(()=>validateSettings({...s,template:"{{vendas}}"})).toThrow();
    expect(()=>validateSettings({...s,ranking:"sales"})).toThrow();
  });
  it("states a spend ranking is not evidence of efficiency",()=>{
    const s={...defaultSettings,dataMode:"meta" as const,metrics:["spend" as const],ranking:"spend" as const};
    expect(renderReport("Client",s,{period:{},metrics:{spend:50},ads:[{name:"Ad",spend:50,url:"https://www.instagram.com/p/real"}]})).toContain("gasto, não eficiência");
  });
  it("shows next three local executions across month/year boundaries",()=>{
    const dates=nextExecutions({...defaultSettings,frequency:"monthly",monthDay:31},new Date("2026-12-31T13:00:00Z"));
    expect(dates).toEqual(["2027-01-31T12:00:00.000Z","2027-02-28T12:00:00.000Z","2027-03-31T12:00:00.000Z"]);
    expect(nextExecutions({...defaultSettings,time:""})).toEqual([]);
  });
  it("records missed occurrences after 15 minutes rather than sending late",()=>{
    const s={...defaultSettings,frequency:"daily" as const};
    const from=new Date("2026-10-08T11:59:00Z");
    expect(scheduleOccurrences(s,from,new Date("2026-10-08T12:15:00Z"))[0].expired).toBe(false);
    expect(scheduleOccurrences(s,from,new Date("2026-10-08T12:15:01Z"))[0].expired).toBe(true);
  });
});
