import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  role: "admin" | "gestor";
  is_master?: boolean;
}

// Maps profile full_name to the gestor_responsavel value in whatsapp_grupos
const GESTOR_NAME_MAP: Record<string, string> = {
  "Murillo": "Murilo Araújo",
  "Netto": "Netto Monge",
  "Jader": "Jader Costa",
  "Priscilla": "Priscilla Borges",
};

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("Profile fetch error:", error);
          setProfile(null);
        } else {
          setProfile(data as Profile | null);
        }
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  const isAdmin = profile?.role === "admin";
  const isMaster = (profile as any)?.is_master === true;
  const gestorFilter = profile ? GESTOR_NAME_MAP[profile.full_name] || null : null;

  return { profile, loading, isAdmin, isMaster, gestorFilter };
}
