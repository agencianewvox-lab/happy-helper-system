import { useState, useCallback, useMemo } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useOfficePresence, OfficeUser } from "@/hooks/useOfficePresence";
import OfficeMap, { MAP_COLS, MAP_ROWS } from "@/components/office/OfficeMap";
import VideoCallPanel from "@/components/office/VideoCallPanel";
import OnlineUsersList from "@/components/office/OnlineUsersList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, Keyboard } from "lucide-react";

const PROXIMITY_RADIUS = 2;

export default function Escritorio() {
  const { signOut } = useAuth();
  const { isAdmin, isMaster } = useProfile();
  const { users, myPosition, move, moveTo, updateStatus, isConnected, currentUserId } = useOfficePresence();

  const [selectedUser, setSelectedUser] = useState<OfficeUser | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [myStatus, setMyStatus] = useState("online");

  // Find nearby user (within proximity radius, excluding self)
  const nearbyUser = useMemo(() => {
    return users.find(u => {
      if (u.user_id === currentUserId) return false;
      const dist = Math.abs(u.x - myPosition.x) + Math.abs(u.y - myPosition.y);
      return dist <= PROXIMITY_RADIUS;
    }) || null;
  }, [users, myPosition, currentUserId]);

  const handleMove = useCallback((dx: number, dy: number) => {
    move(dx, dy, MAP_COLS, MAP_ROWS);
  }, [move]);

  const handleClickTile = useCallback((x: number, y: number) => {
    moveTo(x, y);
  }, [moveTo]);

  const handleClickUser = useCallback((u: OfficeUser) => {
    setSelectedUser(u);
  }, []);

  const handleStartCall = useCallback(() => {
    setIsInCall(true);
    updateStatus("em_chamada");
  }, [updateStatus]);

  const handleEndCall = useCallback(() => {
    setIsInCall(false);
    setSelectedUser(null);
    updateStatus("online");
    setMyStatus("online");
  }, [updateStatus]);

  const handleStatusChange = useCallback((status: string) => {
    setMyStatus(status);
    updateStatus(status);
  }, [updateStatus]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <Monitor className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold">Escritório Virtual</h1>
              <Badge variant="outline" className="text-[10px] gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                {isConnected ? "Conectado" : "Desconectado"}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                <Keyboard className="w-3 h-3" />
                WASD ou Setas para mover
              </div>
              <Select value={myStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">🟢 Online</SelectItem>
                  <SelectItem value="ocupado">🔴 Ocupado</SelectItem>
                  <SelectItem value="ausente">💤 Ausente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 flex gap-4 p-6 overflow-auto">
            {/* Map */}
            <div className="flex-1 min-w-0">
              <OfficeMap
                users={users}
                myPosition={myPosition}
                currentUserId={currentUserId}
                onMove={handleMove}
                onClickTile={handleClickTile}
                onClickUser={handleClickUser}
                nearbyUser={nearbyUser}
              />
            </div>

            {/* Right panel */}
            <div className="w-64 shrink-0 space-y-4">
              <OnlineUsersList
                users={users}
                currentUserId={currentUserId}
                onClickUser={handleClickUser}
              />

              {(selectedUser || nearbyUser) && (
                <VideoCallPanel
                  targetUser={selectedUser || nearbyUser}
                  onClose={handleEndCall}
                  onStartCall={handleStartCall}
                  isInCall={isInCall}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
