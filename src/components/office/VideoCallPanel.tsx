import { useState, useRef, useCallback } from "react";
import { OfficeUser } from "@/hooks/useOfficePresence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface Props {
  targetUser: OfficeUser | null;
  onClose: () => void;
  onStartCall: () => void;
  isInCall: boolean;
}

export default function VideoCallPanel({ targetUser, onClose, onStartCall, isInCall }: Props) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const handleStartCall = useCallback(async () => {
    setPermissionError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      onStartCall();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setPermissionError("Permissão negada. Libere câmera e microfone nas configurações do navegador.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setPermissionError("Nenhuma câmera ou microfone encontrado.");
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        setPermissionError("Câmera ou microfone em uso por outro app.");
      } else {
        setPermissionError("Erro ao acessar câmera/microfone.");
      }
      toast({ title: "Erro de mídia", description: permissionError || "Não foi possível acessar câmera/microfone.", variant: "destructive" });
    }
  }, [onStartCall]);

  const handleEndCall = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  const toggleVideo = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    }
    setVideoEnabled(v => !v);
  }, []);

  const toggleMic = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    }
    setMicEnabled(m => !m);
  }, []);

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
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleEndCall}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isInCall ? (
          <>
            {/* Remote video placeholder */}
            <div className="relative aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: targetUser.avatar_color }}
                >
                  {targetUser.user_name.charAt(0)}
                </div>
                <span className="text-xs text-muted-foreground">Aguardando {targetUser.user_name.split(" ")[0]}...</span>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] text-emerald-600">Conectado</span>
                </div>
              </div>

              {/* Local video preview (real camera) */}
              <div className="absolute bottom-2 right-2 w-24 h-18 rounded border border-border/50 overflow-hidden bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn("w-full h-full object-cover", !videoEnabled && "hidden")}
                />
                {!videoEnabled && (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <VideoOff className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant={micEnabled ? "outline" : "destructive"}
                className="h-9 w-9 p-0"
                onClick={toggleMic}
              >
                {micEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant={videoEnabled ? "outline" : "destructive"}
                className="h-9 w-9 p-0"
                onClick={toggleVideo}
              >
                {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-9 px-4"
                onClick={handleEndCall}
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
            {permissionError && (
              <p className="text-xs text-destructive text-center px-2">{permissionError}</p>
            )}
            <Button size="sm" onClick={handleStartCall} className="gap-1.5">
              <Phone className="w-4 h-4" />
              Iniciar Chamada
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Será solicitado acesso à câmera e microfone
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
