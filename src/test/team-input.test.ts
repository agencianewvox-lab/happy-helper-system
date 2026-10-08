import { describe,it,expect } from "vitest";
import { validTeamInput } from "../../supabase/functions/_shared/team-input";
describe("Master team provisioning input",()=>{
 const valid={name:"Pessoa da equipe",email:"pessoa@example.com",password:"Senha-forte-2026",role:"social_media"};
 it("allows social and manager profiles only",()=>{expect(validTeamInput(valid)).toBe(true);expect(validTeamInput({...valid,role:"gestor"})).toBe(true);});
 it.each(["admin","master","service_role","",null])("rejects privilege escalation %s",role=>expect(validTeamInput({...valid,role})).toBe(false));
 it.each([{password:"curta"},{email:"invalido"},{name:"A"},{password:"x".repeat(129)}])("rejects invalid fields",change=>expect(validTeamInput({...valid,...change})).toBe(false));
});

