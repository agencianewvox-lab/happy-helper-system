import { useState, useCallback, useRef, useEffect } from "react";
import { OfficeRoom, OfficeUser } from "@/hooks/useOfficePresence";
import { OfficeMessage } from "@/hooks/useOfficeMessages";
import OfficeAvatar from "./OfficeAvatar";
import OfficeChat from "./OfficeChat";
import RecordingControls from "./RecordingControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Mic, MicOff, Video, VideoOff, MessageSquare, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Props {
  room: OfficeRoom;
  usersInRoom: OfficeUser[];
  messages: OfficeMessage[];
  currentUserId?: string;
  currentUserName?: string;
  currentAvatarColor?: string;
  micEnabled: boolean;
  camEnabled: boolean;
  status: string;
  statusMessage: string;
  onLeaveRoom: () => void;
  onSendMessage: (content: string) => void;
  onToggleMic: (enabled: boolean) => void;
  onToggleCam: (enabled: boolean) => void;
  onToggleLock: (lock: boolean) => void;
  onStatusChange: (status: string) => void;
  onStatusMessageChange: (msg: string) => void;
  onClickUser: (u: OfficeUser) => void;
  onSendSystemMessage: (content: string) => void;
}

export default function RoomView({
  room, usersInRoom, messages, currentUserId, currentUserName, currentAvatarColor,
  micEnabled, camEnabled, status, statusMessage,
  onLeaveRoom, onSendMessage, onToggleMic, onToggleCam, onToggleLock,
  onStatusChange, onStatusMessageChange,
  onClickUser, onSendSystemMessage,
}: Props) {
  const [showChat, setShowChat] = useState(true);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Handle camera stream
  useEffect(() => {
    if (camEnabled) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
          streamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        })
        .catch(err => {
          toast({ title: "Erro de câmera", description: "Não foi possível acessar a câmera.", variant: "destructive" });
          onToggleCam(false);
        });
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [camEnabled]);

  const handleSend = useCallback((content: string) => {
    onSendMessage(content);
  }, [onSendMessage]);

  const isLocked = !!room.locked_by;
  const isLockedByMe = room.locked_by === currentUserId;

  const handleToggleLock = () => {
    if (isLocked && !isLockedByMe) {
      toast({ title: "Sala trancada", description: `Trancada por ${room.locked_by_name}. Apenas essa pessoa pode destrancar.`, variant: "destructive" });
      return;
    }
    const newLock = !isLocked;
    onToggleLock(newLock);
    onSendSystemMessage(newLock
      ? `🔒 ${currentUserName} trancou a sala`
      : `🔓 ${currentUserName} destrancou a sala`
    );
  };

  return (
    <div className="flex flex-col h-full rounded-xl border border-border/30 bg-card/60 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className="text-xl">{room.icone}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold">{room.nome}</h2>
              {isLocked && (
                <span className="text-[9px] text-amber-500 flex items-center gap-0.5">
                  <Lock className="w-2.5 h-2.5" />
                  Trancada
                </span>
              )}
            </div>
            {room.descricao && <p className="text-[10px] text-muted-foreground">{room.descricao}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status selector */}
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="h-7 w-28 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="online">🟢 Online</SelectItem>
              <SelectItem value="busy">🔴 Ocupado</SelectItem>
              <SelectItem value="away">💤 Ausente</SelectItem>
            </SelectContent>
          </Select>

          {/* Status message */}
          <Input
            placeholder="Status..."
            value={statusMessage}
            onChange={(e) => onStatusMessageChange(e.target.value)}
            className="h-7 w-32 text-[10px] bg-background/50 border-border/30"
          />

          {/* Mic toggle */}
          <Button
            size="sm"
            variant={micEnabled ? "default" : "ghost"}
            className="h-7 w-7 p-0"
            onClick={() => onToggleMic(!micEnabled)}
            title={micEnabled ? "Desligar microfone" : "Ligar microfone"}
          >
            {micEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </Button>

          {/* Cam toggle */}
          <Button
            size="sm"
            variant={camEnabled ? "default" : "ghost"}
            className="h-7 w-7 p-0"
            onClick={() => onToggleCam(!camEnabled)}
            title={camEnabled ? "Desligar câmera" : "Ligar câmera"}
          >
            {camEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
          </Button>

          {/* Lock toggle */}
          <Button
            size="sm"
            variant={isLocked ? "default" : "ghost"}
            className={cn("h-7 w-7 p-0", isLocked && "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30")}
            onClick={handleToggleLock}
            title={isLocked ? "Destrancar sala" : "Trancar sala"}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </Button>

          {/* Recording */}
          <RecordingControls roomName={room.nome} onSystemMessage={onSendSystemMessage} />

          {/* Chat toggle */}
          <Button
            size="sm"
            variant={showChat ? "default" : "ghost"}
            className="h-7 w-7 p-0"
            onClick={() => setShowChat(!showChat)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>

          {/* Leave */}
          <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive hover:text-destructive" onClick={onLeaveRoom}>
            <LogOut className="w-3.5 h-3.5 mr-1" />
            Sair
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Avatars grid + local camera */}
        <div className="flex-1 overflow-auto p-6">
          {/* Local camera preview */}
          {camEnabled && (
            <div className="mb-4 flex justify-center">
              <div className="relative rounded-xl overflow-hidden border border-border/30 shadow-lg" style={{ width: 240, height: 180 }}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 left-1 bg-card/80 px-1.5 py-0.5 rounded text-[9px] font-medium">
                  Sua câmera
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-6 justify-center items-start">
            {usersInRoom.map(u => {
              const isSelf = u.user_id === currentUserId;
              return (
                <div
                  key={u.id}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl transition-all",
                    !isSelf && "cursor-pointer hover:bg-muted/30",
                  )}
                  onClick={() => !isSelf && onClickUser(u)}
                >
                  <OfficeAvatar
                    name={u.user_name}
                    size="lg"
                    status={u.status}
                    micEnabled={u.mic_enabled ?? false}
                    camEnabled={u.cam_enabled ?? false}
                    statusMessage={u.status_message}
                  />
                  <span className={cn("text-xs font-medium", isSelf && "text-primary")}>
                    {u.user_name.split(" ")[0]}
                    {isSelf && " (você)"}
                  </span>
                  <div className="flex items-center gap-1">
                    {u.mic_enabled && <Mic className="w-3 h-3 text-emerald-500" />}
                    {u.cam_enabled && <Video className="w-3 h-3 text-blue-500" />}
                  </div>
                </div>
              );
            })}

            {usersInRoom.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">Sala vazia</p>
                <p className="text-[10px] mt-1">Seja o primeiro a entrar!</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat panel */}
        {showChat && (
          <div className="w-80 border-l border-border/30 flex flex-col">
            <OfficeChat messages={messages} onSend={handleSend} currentUserId={currentUserId} />
          </div>
        )}
      </div>
    </div>
  );
}
