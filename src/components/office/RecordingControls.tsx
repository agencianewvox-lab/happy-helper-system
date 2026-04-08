import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Circle, Square, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  roomName: string;
  onSystemMessage: (content: string) => void;
}

export default function RecordingControls({ roomName, onSystemMessage }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      let combinedStream = screenStream;

      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        screenStream.getAudioTracks().forEach(t => dest.stream.addTrack(t));
        micStream.getAudioTracks().forEach(t => {
          const src = ctx.createMediaStreamSource(new MediaStream([t]));
          src.connect(dest);
        });
        combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        // proceed without mic audio
      }

      chunksRef.current = [];
      const recorder = new MediaRecorder(combinedStream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const b = new Blob(chunksRef.current, { type: "video/webm" });
        setBlob(b);
        combinedStream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setDuration(0);
      setBlob(null);

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      onSystemMessage(`🔴 Gravação iniciada na ${roomName}`);

      screenStream.getVideoTracks()[0].onended = () => stopRecording();
    } catch {
      toast({ title: "Erro", description: "Não foi possível iniciar a gravação.", variant: "destructive" });
    }
  }, [roomName, onSystemMessage]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
    onSystemMessage(`⏹ Gravação encerrada na ${roomName}`);
  }, [roomName, onSystemMessage]);

  const download = useCallback(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gravacao-${roomName}-${new Date().toISOString().slice(0, 16)}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }, [blob, roomName]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h > 0 ? h.toString().padStart(2, "0") + ":" : ""}${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-1">
      {isRecording ? (
        <>
          <div className="flex items-center gap-1 text-[10px] text-red-400 animate-pulse">
            <Circle className="w-2 h-2 fill-red-500 text-red-500" />
            {fmt(duration)}
          </div>
          <Button size="sm" variant="destructive" className="h-7 w-7 p-0" onClick={stopRecording}>
            <Square className="w-3 h-3" />
          </Button>
        </>
      ) : blob ? (
        <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={download}>
          <Download className="w-3 h-3" />
          Baixar
        </Button>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={startRecording} title="Gravar tela">
          <Circle className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
