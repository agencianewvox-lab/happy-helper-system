import { useState } from "react";
import { OfficeUser } from "@/hooks/useOfficePresence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  targetUser: OfficeUser | null;
  onClose: () => void;
  onStartCall: () => void;
  isInCall: boolean;
}

export default function VideoCallPanel({ targetUser, onClose, onStartCall, isInCall }: Props) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);

  if (!targetUser) return null;

  return (
    <Card className="border-border/50 shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: targetUser.avatar_color }}
            >
              {targetUser.user_name.charAt(0)}
            </div>
            {targetUser.user_name}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isInCall ? (
          <>
            {/* Simulated video area */}
            <div className="relative aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              {videoEnabled ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold animate-pulse"
                    style={{ backgroundColor: targetUser.avatar_color }}
                  >
                    {targetUser.user_name.charAt(0)}
                  </div>
                  <span className="text-xs text-muted-foreground">Chamada em andamento...</span>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-emerald-600">Conectado</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">Câmera desligada</div>
              )}
              {/* Self preview */}
              <div className="absolute bottom-2 right-2 w-16 h-12 bg-muted-foreground/20 rounded border border-border/50 flex items-center justify-center">
                <span className="text-[8px] text-muted-foreground">Você</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant={micEnabled ? "outline" : "destructive"}
                className="h-9 w-9 p-0"
                onClick={() => setMicEnabled(!micEnabled)}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant={videoEnabled ? "outline" : "destructive"}
                className="h-9 w-9 p-0"
                onClick={() => setVideoEnabled(!videoEnabled)}
              >
                {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9 px-4"
                onClick={onClose}
              >
                <PhoneOff className="w-4 h-4 mr-1" />
                Encerrar
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: targetUser.avatar_color }}
            >
              {targetUser.user_name.charAt(0)}
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Você está perto de <strong>{targetUser.user_name.split(" ")[0]}</strong>
            </p>
            <Button size="sm" onClick={onStartCall} className="gap-1.5">
              <Phone className="w-4 h-4" />
              Iniciar Chamada
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
