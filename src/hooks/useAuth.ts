import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AuthState = { user: User | null; session: Session | null; loading: boolean; recoveryPending: boolean };
type AuthContextValue = AuthState & { signOut: () => ReturnType<typeof supabase.auth.signOut> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true, recoveryPending: false });

  useEffect(() => {
    const applySession = (session: Session | null, event: string) => {
      setState((current) => {
        const recoveryPending = event === "PASSWORD_RECOVERY"
          || (current.recoveryPending && event !== "SIGNED_OUT"
            && Boolean(session?.user && session.user.id === current.user?.id));
        return event !== "USER_UPDATED" && current.session?.access_token === session?.access_token
          && current.recoveryPending === recoveryPending && !current.loading
        ? current
        : { session, user: session?.user ?? null, loading: false, recoveryPending };
      });
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => applySession(session, event)
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return createElement(AuthContext.Provider, { value: { ...state, signOut } }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa de AuthProvider");
  return context;
}
