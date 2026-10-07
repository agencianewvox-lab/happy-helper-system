import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const source=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("independent Supabase migration contract",()=>{
 it("routes browser auth and WhatsApp to the new backend",()=>{
  expect(source(".env")).toContain("gorqyovidpdvuockzndm");
  expect(source(".env")).not.toContain("fmipenijdipscnqhtwvy");
  expect(source("src/integrations/supabase/client.ts")).not.toContain("brokeredPreviewStorage");
  expect(source("src/lib/whatsapp.ts")).toContain("/functions/v1/whatsapp");
 });
 it("does not trust client supplied recipients in public onboarding followups",()=>{
  const receipt=source("supabase/functions/_shared/onboarding-receipt.ts");
  expect(receipt).toContain("response_id");
  expect(receipt).not.toContain("sendWhatsApp");
  expect(receipt).not.toContain('.update(');
  expect(source("src/pages/OnboardingClinica.tsx")).toContain("responseId.current");
 });
 it("secures background work and avoids historical onboarding replays",()=>{
  const sql=source("supabase/migrations/20261007192201_independent_background_processing.sql");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("for update skip locked");
  expect(sql).toContain("revoke all on function public.claim_panel_jobs() from public,anon,authenticated");
  expect(sql).toContain("Bulk migration uses postgres");
  const worker=source("supabase/functions/process-panel-jobs/index.ts");
  expect(worker).toContain("requireMasterOrService(req)");
  expect(worker).toContain("delivery_requires_review");
  expect(worker).toContain('onConflict:"job_key",ignoreDuplicates:true');
 });
 it("preserves the approved shared instance without modifying its webhook",()=>{
  const whatsapp=source("supabase/functions/whatsapp/index.ts");
  expect(whatsapp).toContain("voxi_executivo_d13a86fd");
  expect(whatsapp).toContain("approvedRelay");
  expect(whatsapp).not.toContain("/webhook/set");
 });
});
// @vitest-environment node
