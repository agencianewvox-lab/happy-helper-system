import { useProfile } from "@/hooks/useProfile";

export function MasterOnly({ children }: { children: React.ReactNode }) {
  const { isMaster } = useProfile();
  if (!isMaster) return null;
  return <>{children}</>;
}
