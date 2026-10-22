import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { staffAccess } from "@/lib/staff-access";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  role: "admin" | "gestor" | "social_media";
  is_master?: boolean;
}

// Maps profile full_name to the gestor_responsavel value in whatsapp_grupos
const GESTOR_NAME_MAP: Record<string, string> = {
  "Murillo": "Murilo Araújo",
  "Netto": "Netto Monge",
  "Priscilla": "Priscilla Borges",
};

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const { data: profile = null, isPending, error } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !authLoading && !!user,
    staleTime: 60_000,
    refetchOnMount: true,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,user_id,full_name,role,is_master")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
  if (error) console.error("Profile fetch error:", error);
  const loading = authLoading || (!!user && isPending);

  const access = staffAccess(profile);
  const gestorFilter = profile?.role === "gestor" ? GESTOR_NAME_MAP[profile.full_name] || profile.full_name : null;

  return { profile, loading, ...access, gestorFilter };
}
