import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientWorkspace } from "@/components/ClientWorkspace";
const mocks=vi.hoisted(()=>({api:vi.fn()}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({user:{id:"operator"}})}));
vi.mock("@/lib/client-workspace",()=>({clientWorkspace:mocks.api}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({select:()=>({in:()=>({order:async()=>({data:[],error:null})})})})}}));
const workspace={
  clientId:"client",name:"Cliente de teste",managerId:null,legacyManager:null,version:4,
  contract:{title:"SM + Tráfego",description:"Escopo original",deliverables:[],startDate:"",limits:"",notes:""},
  contacts:[],credentials:[{id:"credential",platform:"instagram",label:"Instagram institucional",url:"",version:1}],
  updatedAt:"2026-10-16T12:00:00Z",updatedBy:"Master",canEditContract:true,canEdit:true,history:[],audit:[],
};
function view(initialTab="contract"){const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});return {qc,...render(<QueryClientProvider client={qc}><ClientWorkspace clientId="client" initialTab={initialTab}/></QueryClientProvider>)};}
beforeEach(()=>{vi.clearAllMocks();mocks.api.mockImplementation(async(action)=>action==="read"?workspace:action==="reveal"?{login:"fake-login",password:"fake-secret",notes:""}:{ok:true});});
describe("Operational workspace UX and secret boundaries",()=>{
  it("preserves the legacy plan without inventing deliverables",async()=>{
    view();expect(await screen.findByText("SM + Tráfego")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum entregável detalhado/)).toBeInTheDocument();
  });
  it("cancels a contract draft without saving",async()=>{
    view();fireEvent.click(await screen.findByRole("button",{name:"Editar escopo"}));
    fireEvent.change(screen.getByLabelText("Nome do plano"),{target:{value:"Unsaved"}});
    fireEvent.click(screen.getByRole("button",{name:"Cancelar"}));
    expect(screen.getByText("SM + Tráfego")).toBeInTheDocument();
    expect(mocks.api.mock.calls.every(([a])=>a==="read")).toBe(true);
  });
  it("passes the version and keeps edits when a concurrent change is rejected",async()=>{
    mocks.api.mockImplementation(async(action)=>{if(action==="read")return workspace;throw Error("Outra pessoa atualizou esta ficha.");});
    view();fireEvent.click(await screen.findByRole("button",{name:"Editar escopo"}));
    fireEvent.change(screen.getByLabelText("Nome do plano"),{target:{value:"Changed"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar contratado"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Outra pessoa");
    expect(screen.getByLabelText("Nome do plano")).toHaveValue("Changed");
    expect(mocks.api).toHaveBeenCalledWith("contract","client",expect.objectContaining({version:4}));
  });
  it("loads metadata only, reveals explicitly, and never caches the secret",async()=>{
    const {qc}=view("access");await screen.findByText("Instagram institucional");
    expect(screen.queryByText("fake-secret")).not.toBeInTheDocument();
    expect(mocks.api.mock.calls.some(([a])=>a==="reveal")).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Revelar"}));
    expect(await screen.findByText("fake-secret",{exact:false})).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith("reveal","client",{id:"credential"});
    expect(JSON.stringify(qc.getQueryCache().getAll().map(q=>q.state.data))).not.toContain("fake-secret");
    fireEvent.click(screen.getByRole("button",{name:"Ocultar"}));
    expect(screen.queryByText("fake-secret",{exact:false})).not.toBeInTheDocument();
  });
  it("hides contract and vault edit controls from assigned social users",async()=>{
    mocks.api.mockResolvedValue({...workspace,canEdit:false,canEditContract:false});
    view("access");await screen.findByText("Instagram institucional");
    expect(screen.queryByRole("button",{name:"Novo acesso"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Editar"})).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Revelar"})).toBeEnabled();
  });
  it("permits multiple responsible people without requiring phone or creating a login",async()=>{
    view("people");fireEvent.click(await screen.findByRole("button",{name:"Editar responsáveis"}));
    fireEvent.click(screen.getAllByRole("button",{name:"Adicionar pessoa"})[0]);
    fireEvent.change(screen.getByLabelText("Nome"),{target:{value:"Pessoa de teste"}});
    fireEvent.change(screen.getByLabelText("Cargo / função"),{target:{value:"Design"}});
    fireEvent.click(screen.getByRole("button",{name:"Salvar responsáveis"}));
    await waitFor(()=>expect(mocks.api).toHaveBeenCalledWith("contacts","client",expect.objectContaining({contacts:[expect.objectContaining({name:"Pessoa de teste",phone:""})]})));
    expect(mocks.api.mock.calls.every(([a])=>["read","contacts"].includes(a))).toBe(true);
  });
});
