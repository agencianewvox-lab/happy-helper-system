import { supabase } from "@/integrations/supabase/client";

export type Deliverable = {
  id: string;
  name: string;
  quantity: string;
  frequency: string;
};
export type Contract = {
  title: string;
  description: string;
  deliverables: Deliverable[];
  startDate: string;
  limits: string;
  notes: string;
};
export type Responsible = {
  id: string;
  team: "agency" | "client";
  name: string;
  role: string;
  responsibility: string;
  phone: string;
  primary: boolean;
};
export type Credential = {
  id: string;
  platform: string;
  label: string;
  url: string;
  version: number;
  updatedAt: string;
};
export type CredentialSecret = {
  login: string;
  password: string;
  notes: string;
};
export type Workspace = {
  clientId: string;
  name: string;
  managerId: string | null;
  legacyManager: string | null;
  contract: Contract;
  contacts: Responsible[];
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  canEditContract: boolean;
  canEdit: boolean;
  archivedAt: string | null;
  credentials: Credential[];
  history: {
    version: number;
    contract: Contract;
    contacts: Responsible[];
    createdAt: string;
    author: string | null;
  }[];
  audit: { action: string; createdAt: string; author: string | null }[];
};
export async function clientWorkspace<T>(
  action: string,
  clientId?: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("client-workspace", {
    body: { action, clientId, payload },
  });
  if (error) {
    let message = "Não foi possível concluir. Tente novamente.";
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* no sensitive diagnostic */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
