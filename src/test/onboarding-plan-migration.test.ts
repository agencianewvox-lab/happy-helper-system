import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20261007021509_prepare_secure_onboarding_plans.sql"), "utf8");
describe("prepared onboarding SQL release guards (static checks, not live RLS tests)", () => {
  it("refuses user-editable identity fields, including an own-profile update policy", () => {
    for (const column of ["full_name", "role", "is_master"]) {
      expect(sql).toContain(`has_column_privilege('authenticated','public.profiles','${column}','UPDATE')`);
    }
    expect(sql).toContain("has_table_privilege('authenticated','public.profiles','INSERT')");
    expect(sql.indexOf("Unsafe legacy identity/ownership writes")).toBeLessThan(sql.indexOf("create table public.onboarding_meeting_plans"));
  });
  it("does not infer safety by comparing arbitrary policy expressions to a literal true", () => {
    expect(sql).not.toContain("qual='true'");
    expect(sql).not.toContain("with_check='true'");
    expect(sql).toContain("has_column_privilege('authenticated','public.whatsapp_grupos','gestor_responsavel','UPDATE')");
  });
  it("keeps original answers unchanged and denies browser writes to identity/audit fields", () => {
    expect(sql).toContain("revoke all on public.onboarding_meeting_plans from public,anon,authenticated");
    expect(sql).toContain("grant update (plan)");
    expect(sql).toContain("security invoker set search_path=''");
    expect(sql).not.toMatch(/security definer/i);
    expect(sql).not.toMatch(/(?:update|delete from|alter table) public\.onboarding_responses/i);
    expect(sql).toContain("new.updated_by:=auth.uid()");
    expect(sql).toContain("new.version:=old.version+1");
  });
});
