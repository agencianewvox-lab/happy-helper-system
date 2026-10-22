export function staffAccess(
  profile?: { role?: string; is_master?: boolean } | null,
) {
  const isMaster = profile?.is_master === true;
  const isAdmin = profile?.role === "admin";
  return {
    isMaster,
    isAdmin,
    canViewAllClients: isMaster || isAdmin,
    canManageTeam: isMaster,
  };
}
