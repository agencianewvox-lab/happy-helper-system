import { useState, useCallback } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useOfficePresence, OfficeUser } from "@/hooks/useOfficePresence";
import { useOfficeMessages } from "@/hooks/useOfficeMessages";
import { getAvatarColor } from "@/lib/avatarUtils";
import RoomCard from "@/components/office/RoomCard";
import RoomView from "@/components/office/RoomView";
import OnlineList from "@/components/office/OnlineList";
import DirectMessageDialog from "@/components/office/DirectMessageDialog";
import RoomAdminModal from "@/components/office/RoomAdminModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function Escritorio() {
  const { signOut, user } = useAuth();
  const { profile, isAdmin, isMaster } = useProfile();
  const {
    users, rooms, currentRoomId, switchRoom,
    updateStatus, updateStatusMessage, toggleMic,
    isConnected, currentUserId, fetchRooms,
  } = useOfficePresence();

  const { messages, sendMessage } = useOfficeMessages(currentRoomId);

  const [dmTarget, setDmTarget] = useState<OfficeUser | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [myStatus, setMyStatus] = useState("online");
  const [myStatusMsg, setMyStatusMsg] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const usersInCurrentRoom = users.filter(u => u.room_id === currentRoomId);

  const handleSendMessage = useCallback((content: string) => {
    if (!user || !profile) return;
    sendMessage(content, user.id, profile.full_name, getAvatarColor(profile.full_name));
  }, [user, profile, sendMessage]);

  const handleSendSystemMessage = useCallback((content: string) => {
    if (!user || !profile) return;
    sendMessage(content, user.id, profile.full_name, getAvatarColor(profile.full_name), "system");
  }, [user, profile, sendMessage]);

  const handleStatusChange = useCallback((status: string) => {
    setMyStatus(status);
    updateStatus(status);
  }, [updateStatus]);

  const handleStatusMsgChange = useCallback((msg: string) => {
    setMyStatusMsg(msg);
    updateStatusMessage(msg);
  }, [updateStatusMessage]);

  const handleToggleMic = useCallback((enabled: boolean) => {
    setMicEnabled(enabled);
    toggleMic(enabled);
  }, [toggleMic]);

  const handleClickUser = useCallback((u: OfficeUser) => {
    setDmTarget(u);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    switchRoom(null);
  }, [switchRoom]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <DashboardSidebar isAdmin={isAdmin} isMaster={isMaster} onSignOut={signOut} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-border/30">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">Escritório Virtual</h1>
              <Badge variant="outline" className="text-[10px] gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
                {isConnected ? "Conectado" : "Desconectado"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {isMaster && (
                <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => setShowAdmin(true)}>
                  <Settings className="w-3.5 h-3.5" />
                  Configurar Salas
                </Button>
              )}
            </div>
          </header>

          {/* Content: 3 areas */}
          <div className="flex-1 flex gap-0 overflow-hidden">
            {/* Left: Room list */}
            <div className="w-64 shrink-0 border-r border-border/30 p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-3 px-1">Salas</p>
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="space-y-2 pr-2">
                  {rooms.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      users={users.filter(u => u.room_id === room.id)}
                      isActive={currentRoomId === room.id}
                      onClick={() => switchRoom(room.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Center: Current room */}
            <div className="flex-1 min-w-0 p-3">
              {currentRoom ? (
                <RoomView
                  room={currentRoom}
                  usersInRoom={usersInCurrentRoom}
                  messages={messages}
                  currentUserId={currentUserId}
                  currentUserName={profile?.full_name}
                  currentAvatarColor={profile ? getAvatarColor(profile.full_name) : undefined}
                  micEnabled={micEnabled}
                  status={myStatus}
                  statusMessage={myStatusMsg}
                  onLeaveRoom={handleLeaveRoom}
                  onSendMessage={handleSendMessage}
                  onToggleMic={handleToggleMic}
                  onStatusChange={handleStatusChange}
                  onStatusMessageChange={handleStatusMsgChange}
                  onClickUser={handleClickUser}
                  onSendSystemMessage={handleSendSystemMessage}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Selecione uma sala para entrar</p>
                    <p className="text-[10px] mt-1">Clique em uma sala à esquerda</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Online list */}
            <div className="w-56 shrink-0 border-l border-border/30 p-3">
              <OnlineList
                users={users}
                rooms={rooms}
                currentUserId={currentUserId}
                onClickUser={handleClickUser}
              />
            </div>
          </div>
        </main>

        {/* DM Dialog */}
        {dmTarget && currentUserId && profile && (
          <DirectMessageDialog
            open={!!dmTarget}
            onClose={() => setDmTarget(null)}
            targetUserId={dmTarget.user_id}
            targetUserName={dmTarget.user_name}
            currentUserId={currentUserId}
            currentUserName={profile.full_name}
          />
        )}

        {/* Admin Modal */}
        <RoomAdminModal
          open={showAdmin}
          onClose={() => setShowAdmin(false)}
          rooms={rooms}
          onRefresh={fetchRooms}
        />
      </div>
    </SidebarProvider>
  );
}
