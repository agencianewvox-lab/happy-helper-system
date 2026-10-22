import { describe, it, expect } from "vitest";
import {
  validTeamInput,
  canManageTeam,
} from "../../supabase/functions/_shared/team-input";
import { staffAccess } from "@/lib/staff-access";
describe("Master team provisioning input", () => {
  const valid = {
    name: "Pessoa da equipe",
    email: "pessoa@example.com",
    password: "Senha-forte-2026",
    role: "social_media",
  };
  it.each(["social_media", "gestor", "admin"])(
    "allows assignable profile %s",
    (role) => expect(validTeamInput({ ...valid, role })).toBe(true),
  );
  it.each(["master", "service_role", "", null])(
    "rejects privilege escalation %s",
    (role) => expect(validTeamInput({ ...valid, role })).toBe(false),
  );
  it("separates whole-portfolio ADM from owner-only provisioning", () => {
    expect(staffAccess({ role: "admin", is_master: false })).toEqual({
      isMaster: false,
      isAdmin: true,
      canViewAllClients: true,
      canManageTeam: false,
    });
    expect(canManageTeam({ is_master: false })).toBe(false);
    expect(canManageTeam({ is_master: true })).toBe(true);
    expect(canManageTeam(null)).toBe(false);
    for (const role of ["gestor", "social_media"])
      expect(staffAccess({ role }).canViewAllClients).toBe(false);
  });
  it.each([
    { password: "curta" },
    { email: "invalido" },
    { name: "A" },
    { password: "x".repeat(129) },
  ])("rejects invalid fields", (change) =>
    expect(validTeamInput({ ...valid, ...change })).toBe(false),
  );
});
